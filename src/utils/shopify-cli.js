const core = require('@actions/core');
const exec = require('@actions/exec');
const { normalizeStore, isValidThemeId } = require('./validators');
const { withRetry } = require('./retry');

/**
 * Install Shopify CLI globally
 * @returns {Promise<void>}
 */
async function installShopifyCLI() {
  try {
    core.info('Installing Shopify CLI...');

    // Install @shopify/cli globally (theme plugin is now bundled)
    await exec.exec('npm', ['install', '-g', '@shopify/cli@latest']);

    // Verify installation
    const version = await getShopifyCLIVersion();
    core.info(`✅ Shopify CLI installed successfully: ${version}`);
  } catch (error) {
    throw new Error(`Failed to install Shopify CLI: ${error.message}`);
  }
}

/**
 * Get Shopify CLI version
 * @returns {Promise<string>} Version string
 */
async function getShopifyCLIVersion() {
  let output = '';
  const options = {
    listeners: {
      stdout: (data) => {
        output += data.toString();
      },
    },
    silent: true,
  };

  try {
    await exec.exec('shopify', ['version'], options);
    return output.trim();
  } catch (error) {
    throw new Error(`Shopify CLI not found or not accessible: ${error.message}`);
  }
}

/**
 * Validate theme access token
 * @param {string} token - Theme access token
 * @param {string} store - Store domain
 * @returns {Promise<boolean>} True if valid
 */
async function validateThemeToken(token, store) {
  if (!token) {
    throw new Error('SHOPIFY_CLI_THEME_TOKEN is not set');
  }

  const storeDomain = normalizeStore(store);

  try {
    // Try to list themes to validate token
    await exec.exec('shopify', ['theme', 'list', '--store', storeDomain, '--json'], {
      env: {
        ...process.env,
        SHOPIFY_CLI_THEME_TOKEN: token,
        SHOPIFY_FLAG_STORE: storeDomain,
      },
      silent: true,
    });

    return true;
  } catch (error) {
    throw new Error(`Invalid theme access token or store: ${error.message}`);
  }
}

/**
 * List all themes in the store
 * @param {string} token - Theme access token
 * @param {string} store - Store domain
 * @returns {Promise<Array>} Array of theme objects
 */
async function listThemes(token, store) {
  const storeDomain = normalizeStore(store);
  let output = '';

  const options = {
    listeners: {
      stdout: (data) => {
        output += data.toString();
      },
    },
    env: {
      ...process.env,
      SHOPIFY_CLI_THEME_TOKEN: token,
      SHOPIFY_FLAG_STORE: storeDomain,
    },
    silent: true,
  };

  try {
    await withRetry(
      async () => {
        output = ''; // Reset output for each retry
        await exec.exec('shopify', ['theme', 'list', '--store', storeDomain, '--json'], options);
      },
      {
        retries: 3,
        shouldRetry: (error) =>
          // Retry on network errors or rate limits
          error.code === 'ECONNRESET' ||
          error.code === 'ETIMEDOUT' ||
          error.message?.includes('rate limit') ||
          error.message?.includes('Throttled'),
      }
    );

    // Parse JSON output with error handling
    let themes;
    try {
      themes = JSON.parse(output);
    } catch (parseError) {
      core.error(`Failed to parse theme list JSON: ${output}`);
      throw new Error(`Invalid JSON response from Shopify CLI: ${parseError.message}`);
    }

    // Validate themes array
    if (!Array.isArray(themes)) {
      throw new Error('Expected array of themes from Shopify CLI');
    }

    // Log theme summary
    core.info(`Found ${themes.length} themes in store ${storeDomain}`);

    return themes;
  } catch (error) {
    core.error(`Failed to list themes: ${error.message}`);
    throw error;
  }
}

/**
 * Get the live (published) theme
 * @param {string} token - Theme access token
 * @param {string} store - Store domain
 * @returns {Promise<Object|null>} Live theme object or null
 */
async function getLiveTheme(token, store) {
  try {
    const themes = await listThemes(token, store);

    // Debug: Log all theme roles to understand what's available
    themes.forEach((theme) => {
      core.debug(`Theme: ${theme.name} (ID: ${theme.id}, Role: ${theme.role})`);
    });

    // The published theme can have role 'main' or 'live' in Shopify
    // Different API versions and contexts may return different values
    const liveTheme = themes.find((theme) => theme.role === 'main' || theme.role === 'live');

    if (liveTheme) {
      core.info(
        `Found live theme: ${liveTheme.name} (ID: ${liveTheme.id}, Role: ${liveTheme.role})`
      );
      return liveTheme;
    } else {
      core.warning('No live theme found in the store');
      core.warning(
        `Available themes have the following roles: ${themes.map((t) => t.role).join(', ')}`
      );

      // Provide more detailed information for debugging
      core.warning('Available themes:');
      themes.forEach((theme) => {
        core.warning(`  - ID: ${theme.id}, Name: "${theme.name}", Role: ${theme.role}`);
      });

      return null;
    }
  } catch (error) {
    core.error(`Failed to get live theme: ${error.message}`);
    throw error;
  }
}

/**
 * Get theme by ID
 * @param {string} token - Theme access token
 * @param {string} store - Store domain
 * @param {string} themeId - Theme ID
 * @returns {Promise<Object|null>} Theme object or null
 */
async function getThemeById(token, store, themeId) {
  if (!isValidThemeId(themeId)) {
    throw new Error(`Invalid theme ID format: ${themeId}`);
  }

  try {
    // First try using theme info for efficiency
    const themeInfo = await getThemeInfo(token, store, themeId);
    if (themeInfo) {
      return themeInfo;
    }

    // Fallback to listing all themes if info doesn't work
    const themes = await listThemes(token, store);
    const theme = themes.find((t) => t.id === parseInt(themeId, 10));

    if (theme) {
      core.info(`Found theme: ${theme.name} (ID: ${theme.id})`);
      return theme;
    } else {
      core.warning(`Theme with ID ${themeId} not found`);
      return null;
    }
  } catch (error) {
    core.error(`Failed to get theme by ID: ${error.message}`);
    throw error;
  }
}

/**
 * Ensure theme exists, throw if not
 * @param {string} token - Theme access token
 * @param {string} store - Store domain
 * @param {string} themeId - Theme ID
 * @returns {Promise<Object>} Theme object
 */
async function ensureThemeExists(token, store, themeId) {
  const theme = await getThemeById(token, store, themeId);

  if (!theme) {
    throw new Error(`Theme with ID ${themeId} does not exist in store ${store}`);
  }

  return theme;
}

/**
 * Pull theme files to local workspace
 * @param {string} token - Theme access token
 * @param {string} store - Store domain
 * @param {string} themeId - Theme ID
 * @param {string[]} globs - File globs to pull
 * @param {string} targetDir - Target directory
 * @returns {Promise<void>}
 */
async function pullThemeFiles(token, store, themeId, globs = [], targetDir = '.') {
  const storeDomain = normalizeStore(store);

  const args = ['theme', 'pull', '--store', storeDomain, '--theme', themeId, '--path', targetDir];

  // Add --only flags for specific globs
  if (globs.length > 0) {
    for (const glob of globs) {
      args.push('--only', glob);
    }
  }

  const options = {
    env: {
      ...process.env,
      SHOPIFY_CLI_THEME_TOKEN: token,
      SHOPIFY_FLAG_STORE: storeDomain,
    },
  };

  try {
    core.info(`Pulling theme files from theme ${themeId}...`);
    if (globs.length > 0) {
      core.info(`Globs: ${globs.join(', ')}`);
    }

    await withRetry(
      async () => {
        await exec.exec('shopify', args, options);
      },
      {
        retries: 3,
        initialDelay: 2000,
        shouldRetry: (error) =>
          // Retry on network errors or rate limits
          error.code === 'ECONNRESET' ||
          error.code === 'ETIMEDOUT' ||
          error.message?.includes('rate limit') ||
          error.message?.includes('Throttled') ||
          error.message?.includes('timeout'),
      }
    );

    core.info('✅ Theme files pulled successfully');
  } catch (error) {
    core.error(`Failed to pull theme files: ${error.message}`);
    throw error;
  }
}

/**
 * Push theme files to remote
 * @param {string} token - Theme access token
 * @param {string} store - Store domain
 * @param {string} themeId - Theme ID
 * @param {Object} options - Push options
 * @returns {Promise<void>}
 */
async function pushThemeFiles(token, store, themeId, options = {}) {
  const storeDomain = normalizeStore(store);

  const args = ['theme', 'push', '--store', storeDomain, '--theme', themeId];

  // Add ignore patterns
  if (options.ignore && options.ignore.length > 0) {
    for (const pattern of options.ignore) {
      args.push('--ignore', pattern);
    }
  }

  // Add only patterns
  if (options.only && options.only.length > 0) {
    for (const pattern of options.only) {
      args.push('--only', pattern);
    }
  }

  // Add nodelete flag
  if (options.nodelete) {
    args.push('--nodelete');
  }

  // Add allow-live flag if needed
  if (options.allowLive) {
    args.push('--allow-live');
  }

  // Non-interactive mode
  args.push('--json');

  // Add --force flag
  if (options.force) {
    args.push('--force');
  }

  const execOptions = {
    env: {
      ...process.env,
      SHOPIFY_CLI_THEME_TOKEN: token,
      SHOPIFY_FLAG_STORE: storeDomain,
    },
  };

  try {
    core.info(`Pushing theme files to theme ${themeId}...`);
    if (options.ignore && options.ignore.length > 0) {
      core.info(`Ignoring: ${options.ignore.join(', ')}`);
    }
    if (options.only && options.only.length > 0) {
      core.info(`Only: ${options.only.join(', ')}`);
    }

    await withRetry(
      async () => {
        await exec.exec('shopify', args, execOptions);
      },
      {
        retries: 3,
        initialDelay: 2000,
        shouldRetry: (error) =>
          // Retry on network errors, rate limits, or timeout
          error.code === 'ECONNRESET' ||
          error.code === 'ETIMEDOUT' ||
          error.message?.includes('rate limit') ||
          error.message?.includes('Throttled') ||
          error.message?.includes('timeout'),
      }
    );

    core.info('✅ Theme files pushed successfully');
  } catch (error) {
    core.error(`Failed to push theme files: ${error.message}`);
    throw error;
  }
}

/**
 * Get theme info using theme info command
 * @param {string} token - Theme access token
 * @param {string} store - Store domain
 * @param {string} themeId - Theme ID
 * @returns {Promise<Object|null>} Theme object or null
 */
async function getThemeInfo(token, store, themeId) {
  const storeDomain = normalizeStore(store);
  let output = '';

  const options = {
    listeners: {
      stdout: (data) => {
        output += data.toString();
      },
    },
    env: {
      ...process.env,
      SHOPIFY_CLI_THEME_TOKEN: token,
      SHOPIFY_FLAG_STORE: storeDomain,
    },
    silent: true,
  };

  try {
    await exec.exec(
      'shopify',
      ['theme', 'info', '--store', storeDomain, '--theme', themeId, '--json'],
      options
    );

    // Parse JSON output
    const themeInfo = JSON.parse(output);

    if (themeInfo && themeInfo.theme) {
      const theme = themeInfo.theme;
      core.info(`Found theme via info: ${theme.name} (ID: ${theme.id})`);
      return theme;
    }

    return null;
  } catch (error) {
    // Theme info might not exist or theme not found
    core.debug(`Theme info failed for ${themeId}: ${error.message}`);
    return null;
  }
}

/**
 * Package theme into a ZIP file
 * @param {string} themePath - Path to theme directory
 * @param {string} outputPath - Output ZIP file path (optional)
 * @returns {Promise<string>} Path to created ZIP file
 */
async function packageTheme(themePath = '.', outputPath = null) {
  let output = '';

  // Note: --output flag is no longer supported in newer Shopify CLI versions
  // The command now outputs to a default location
  const args = ['theme', 'package', '--path', themePath];

  const options = {
    listeners: {
      stdout: (data) => {
        output += data.toString();
      },
    },
  };

  try {
    core.info(`Packaging theme from ${themePath}...`);
    await exec.exec('shopify', args, options);

    // Extract ZIP file path from output
    // The output format is usually: "Theme packaged to <filename>"
    const zipPathMatch =
      output.match(/Theme packaged to:?\s+(.+\.zip)/i) || output.match(/(.+\.zip)/i);
    const defaultZipPath = zipPathMatch ? zipPathMatch[1].trim() : `theme.zip`;

    // If outputPath was specified, try to move the file to the desired location
    if (outputPath && outputPath !== defaultZipPath) {
      const fs = require('fs').promises;
      try {
        await fs.rename(defaultZipPath, outputPath);
        core.info(`✅ Theme packaged to: ${outputPath}`);
        return outputPath;
      } catch (moveError) {
        core.warning(`Could not move package to ${outputPath}: ${moveError.message}`);
        core.info(`✅ Theme packaged to: ${defaultZipPath}`);
        return defaultZipPath;
      }
    }

    core.info(`✅ Theme packaged to: ${defaultZipPath}`);
    return defaultZipPath;
  } catch (error) {
    core.error(`Failed to package theme: ${error.message}`);
    throw error;
  }
}

/**
 * Open theme and get URLs
 * @param {string} token - Theme access token
 * @param {string} store - Store domain
 * @param {string} themeId - Theme ID
 * @returns {Promise<Object>} Theme URLs
 */
async function openTheme(token, store, themeId) {
  const storeDomain = normalizeStore(store);
  let output = '';

  const options = {
    listeners: {
      stdout: (data) => {
        output += data.toString();
      },
    },
    env: {
      ...process.env,
      SHOPIFY_CLI_THEME_TOKEN: token,
      SHOPIFY_FLAG_STORE: storeDomain,
    },
  };

  try {
    await exec.exec(
      'shopify',
      ['theme', 'open', '--store', storeDomain, '--theme', themeId],
      options
    );

    // Parse URLs from output
    const previewMatch = output.match(/Preview: (.+)/i);
    const editorMatch = output.match(/Editor: (.+)/i);

    const urls = {
      preview: previewMatch
        ? previewMatch[1].trim()
        : `https://${storeDomain}/?preview_theme_id=${themeId}`,
      editor: editorMatch
        ? editorMatch[1].trim()
        : `https://${storeDomain}/admin/themes/${themeId}/editor`,
    };

    core.info(`Theme URLs - Preview: ${urls.preview}`);
    core.info(`Theme URLs - Editor: ${urls.editor}`);

    return urls;
  } catch (error) {
    // Fallback to constructed URLs if open fails
    core.debug(`Theme open failed, using fallback URLs: ${error.message}`);
    return {
      preview: `https://${storeDomain}/?preview_theme_id=${themeId}`,
      editor: `https://${storeDomain}/admin/themes/${themeId}/editor`,
    };
  }
}

module.exports = {
  installShopifyCLI,
  getShopifyCLIVersion,
  validateThemeToken,
  listThemes,
  getLiveTheme,
  getThemeById,
  getThemeInfo,
  ensureThemeExists,
  pullThemeFiles,
  pushThemeFiles,
  packageTheme,
  openTheme,
};
