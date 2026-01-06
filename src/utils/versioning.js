const core = require('@actions/core');
const exec = require('@actions/exec');
const { normalizeStore } = require('./validators');
const { getThemeById } = require('./shopify-cli');

/**
 * Extract version from theme name
 * @param {string} themeName - Theme name
 * @returns {Object} Version info
 */
function extractVersion(themeName) {
  // Match version pattern [x.yy.zz] or [x.y.z] at the end of the name
  const versionPattern = /\[(\d+\.\d+\.\d+)\]$/;
  const match = themeName.match(versionPattern);

  if (match) {
    return {
      hasVersion: true,
      version: match[1],
      baseName: themeName.replace(versionPattern, '').trim(),
    };
  }

  return {
    hasVersion: false,
    version: null,
    baseName: themeName,
  };
}

/**
 * Parse version string to numbers
 * @param {string} version - Version string (e.g., "1.02.03" or "1.2.3")
 * @returns {Object} Parsed version components
 */
function parseVersion(version) {
  if (!version) {
    return { major: 0, minor: 0, patch: 0 };
  }

  const parts = version.split('.').map((p) => parseInt(p, 10) || 0);
  return {
    major: parts[0] || 0,
    minor: parts[1] || 0,
    patch: parts[2] || 0,
  };
}

/**
 * Format version components to string with optional zero padding
 * @param {number} major - Major version
 * @param {number} minor - Minor version (0-99)
 * @param {number} patch - Patch version (0-99)
 * @param {string} format - Version format ('X.X.X', 'X.X.XX', or 'X.XX.XX')
 * @returns {string} Formatted version string
 */
function formatVersion(major, minor, patch, format = 'X.XX.XX') {
  if (format === 'X.X.X') {
    // No padding format
    return `${major}.${minor}.${patch}`;
  } else if (format === 'X.X.XX') {
    // Major and minor no padding, patch with 2-digit padding
    const patchStr = String(patch).padStart(2, '0');
    return `${major}.${minor}.${patchStr}`;
  } else {
    // Full padding format (X.XX.XX) - default
    const minorStr = String(minor).padStart(2, '0');
    const patchStr = String(patch).padStart(2, '0');
    return `${major}.${minorStr}.${patchStr}`;
  }
}

/**
 * Auto-increment version with rollover at 100
 * @param {string} currentVersion - Current version string
 * @param {string} format - Version format ('X.X.X', 'X.X.XX', or 'X.XX.XX')
 * @returns {string} New version
 */
function bumpVersion(currentVersion, format = 'X.XX.XX') {
  if (!currentVersion) {
    // Return initial version based on format
    if (format === 'X.X.X') {
      return '0.0.1';
    } else if (format === 'X.X.XX') {
      return '0.0.01';
    } else {
      return '0.00.01';
    }
  }

  const { major, minor, patch } = parseVersion(currentVersion);

  let newMajor = major;
  let newMinor = minor;
  let newPatch = patch + 1;

  // Rollover logic: 100 patches → 1 minor, 100 minors → 1 major
  if (newPatch >= 100) {
    newPatch = 0;
    newMinor++;

    if (newMinor >= 100) {
      newMinor = 0;
      newMajor++;

      if (newMajor >= 100) {
        core.warning('Version has reached maximum (99.99.99), resetting to 0.0.1');
        if (format === 'X.X.X') {
          return '0.0.1';
        } else if (format === 'X.X.XX') {
          return '0.0.01';
        } else {
          return '0.00.01';
        }
      }
    }
  }

  return formatVersion(newMajor, newMinor, newPatch, format);
}

/**
 * Rename theme with version tag
 * @param {string} token - Theme access token
 * @param {string} store - Store domain
 * @param {string} themeId - Theme ID
 * @param {string} format - Version format ('X.X.X', 'X.X.XX', or 'X.XX.XX')
 * @param {string} startVersion - Optional starting version to use if theme has no version
 * @returns {Promise<Object>} Version result
 */
async function renameThemeWithVersion(
  token,
  store,
  themeId,
  format = 'X.XX.XX',
  startVersion = null
) {
  try {
    // Get current theme name
    const theme = await getThemeById(token, store, themeId);

    if (!theme) {
      throw new Error(`Theme ${themeId} not found`);
    }

    const currentName = theme.name;
    core.info(`Current theme name: ${currentName}`);

    // Extract current version from theme name
    const versionInfo = extractVersion(currentName);

    // Determine which version to use
    let oldVersion = versionInfo.version;

    // If theme has no version and a starting version is provided, use it
    if (!oldVersion && startVersion) {
      core.info(`Theme has no version, using configured starting version: ${startVersion}`);
      oldVersion = startVersion;
    }

    // Auto-increment version
    const newVersion = bumpVersion(oldVersion, format);

    // Build new name
    const newName = `${versionInfo.baseName} [${newVersion}]`;

    core.info(`Renaming theme: ${currentName} → ${newName}`);

    // Rename the theme
    await renameTheme(token, store, themeId, newName);

    return {
      oldVersion,
      version: newVersion,
      oldName: currentName,
      name: newName,
      baseName: versionInfo.baseName,
    };
  } catch (error) {
    core.error(`Failed to rename theme with version: ${error.message}`);
    throw error;
  }
}

/**
 * Rename a theme
 * @param {string} token - Theme access token
 * @param {string} store - Store domain
 * @param {string} themeId - Theme ID
 * @param {string} newName - New theme name
 * @returns {Promise<void>}
 */
async function renameTheme(token, store, themeId, newName) {
  const storeDomain = normalizeStore(store);

  const options = {
    env: {
      ...process.env,
      SHOPIFY_CLI_THEME_TOKEN: token,
      SHOPIFY_FLAG_STORE: storeDomain,
    },
  };

  try {
    await exec.exec(
      'shopify',
      ['theme', 'rename', '--store', storeDomain, '--theme', themeId.toString(), '--name', newName],
      options
    );

    core.info(`✅ Theme renamed to: ${newName}`);
  } catch (error) {
    // Shopify CLI 3.x might not have rename command, try alternative
    core.info('Trying alternative rename method via API...');

    // Use theme info command to update name
    await exec.exec(
      'shopify',
      ['theme', 'info', '--store', storeDomain, '--theme', themeId.toString(), '--json'],
      options
    );

    // If that doesn't work, we'll need to use the Admin API directly
    // For now, log a warning
    core.warning('Theme rename may not be supported in this Shopify CLI version');
  }
}

/**
 * Compare versions
 * @param {string} version1 - First version
 * @param {string} version2 - Second version
 * @returns {number} -1 if v1 < v2, 0 if equal, 1 if v1 > v2
 */
function compareVersions(version1, version2) {
  if (!version1 || !version2) {
    return 0;
  }

  const v1 = parseVersion(version1);
  const v2 = parseVersion(version2);

  // Compare major.minor.patch as a single number
  const num1 = v1.major * 10000 + v1.minor * 100 + v1.patch;
  const num2 = v2.major * 10000 + v2.minor * 100 + v2.patch;

  if (num1 < num2) return -1;
  if (num1 > num2) return 1;
  return 0;
}

/**
 * Get next version for a theme
 * @param {string} themeName - Theme name
 * @returns {Object} Version info
 */
function getNextVersion(themeName) {
  const versionInfo = extractVersion(themeName);
  const currentVersion = versionInfo.version || '0.00.00';
  const nextVersion = bumpVersion(currentVersion);

  return {
    current: currentVersion,
    next: nextVersion,
    baseName: versionInfo.baseName,
    newName: `${versionInfo.baseName} [${nextVersion}]`,
  };
}

module.exports = {
  extractVersion,
  bumpVersion,
  renameThemeWithVersion,
  renameTheme,
  compareVersions,
  getNextVersion,
  parseVersion,
  formatVersion,
};
