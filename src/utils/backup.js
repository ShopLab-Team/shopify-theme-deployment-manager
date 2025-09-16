const core = require('@actions/core');
const exec = require('@actions/exec');
const { format, utcToZonedTime } = require('date-fns-tz');
const { normalizeStore } = require('./validators');
const { pollUntil } = require('./retry');
const { getLiveTheme, listThemes, getThemeById } = require('./shopify-cli');

/**
 * Create a backup of the current live theme
 * @param {string} token - Theme access token
 * @param {string} store - Store domain
 * @param {Object} options - Backup options
 * @returns {Promise<Object>} Created backup theme
 */
async function createBackup(token, store, options = {}) {
  const { prefix = 'BACKUP_', timezone = 'Asia/Manila' } = options;

  try {
    core.info('Creating backup of current live theme...');

    // Get current timestamp in specified timezone
    const now = new Date();
    const zonedDate = utcToZonedTime(now, timezone);
    const timestamp = format(zonedDate, 'dd-MM-yy-HH:mm');
    const backupName = `${prefix}${timestamp}`;

    core.info(`Backup name: ${backupName}`);
    core.info(`Timezone: ${timezone}`);

    // Get live theme to duplicate
    const liveTheme = await getLiveTheme(token, store);

    if (!liveTheme) {
      throw new Error('No live theme found to backup');
    }

    core.info(`Duplicating live theme: ${liveTheme.name} (ID: ${liveTheme.id})`);

    // Duplicate the theme
    const backupTheme = await duplicateTheme(token, store, liveTheme.id, backupName);

    // Wait for processing to complete
    await waitForThemeProcessing(token, store, backupTheme.id);

    core.info(`✅ Backup created: ${backupTheme.name} (ID: ${backupTheme.id})`);
    return backupTheme;
  } catch (error) {
    core.error(`Failed to create backup: ${error.message}`);
    throw error;
  }
}

/**
 * Duplicate a theme
 * @param {string} token - Theme access token
 * @param {string} store - Store domain
 * @param {string} sourceThemeId - Source theme ID
 * @param {string} name - New theme name
 * @returns {Promise<Object>} Duplicated theme
 */
async function duplicateTheme(token, store, sourceThemeId, name) {
  const storeDomain = normalizeStore(store);
  const fs = require('fs').promises;
  const path = require('path');
  const tempDir = path.join(process.cwd(), '.theme-backup-temp');

  try {
    // Step 1: Create temp directory
    core.info('Creating temporary directory for theme backup...');
    await fs.mkdir(tempDir, { recursive: true });

    // Step 2: Download the source theme
    core.info(`Downloading theme ${sourceThemeId} to temporary directory...`);
    await exec.exec(
      'shopify',
      [
        'theme',
        'pull',
        '--store',
        storeDomain,
        '--theme',
        sourceThemeId,
        '--path',
        tempDir,
        '--force', // Overwrite any existing files
      ],
      {
        env: {
          ...process.env,
          SHOPIFY_CLI_THEME_TOKEN: token,
          SHOPIFY_FLAG_STORE: storeDomain,
        },
      }
    );

    // Step 3: Create new theme by pushing the downloaded files
    core.info(`Creating new theme: ${name}...`);
    let output = '';
    await exec.exec(
      'shopify',
      [
        'theme',
        'push',
        '--store',
        storeDomain,
        '--unpublished',
        '--theme',
        name,
        '--path',
        tempDir,
        '--force',
        '--json',
      ],
      {
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
      }
    );

    // Parse the output to get new theme info
    let newTheme;
    try {
      const result = JSON.parse(output);
      if (result.theme) {
        newTheme = result.theme;
      }
    } catch (parseError) {
      core.debug(`Failed to parse JSON output: ${parseError.message}`);
    }

    // If we couldn't get theme from output, find it by name
    if (!newTheme) {
      const themes = await listThemes(token, store);
      newTheme = themes.find((t) => t.name === name);

      if (!newTheme) {
        throw new Error('Failed to find newly created backup theme');
      }
    }

    core.info(`✅ Successfully created backup theme: ${name} (ID: ${newTheme.id})`);
    return newTheme;
  } catch (error) {
    core.error(`Failed to duplicate theme: ${error.message}`);
    throw error;
  } finally {
    // Step 4: Clean up temp directory
    try {
      core.info('Cleaning up temporary directory...');
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (cleanupError) {
      core.warning(`Failed to clean up temp directory: ${cleanupError.message}`);
    }
  }
}

/**
 * Wait for theme processing to complete
 * @param {string} token - Theme access token
 * @param {string} store - Store domain
 * @param {string} themeId - Theme ID
 * @param {number} timeout - Timeout in seconds
 * @returns {Promise<void>}
 */
async function waitForThemeProcessing(token, store, themeId, timeout = 300) {
  await pollUntil(
    async () => {
      const theme = await getThemeById(token, store, themeId);
      return theme && !theme.processing;
    },
    {
      interval: 5000, // Check every 5 seconds
      timeout: timeout * 1000,
      message: `Waiting for theme ${themeId} to finish processing`,
    }
  );
}

/**
 * Clean up old backups based on retention policy
 * @param {string} token - Theme access token
 * @param {string} store - Store domain
 * @param {Object} options - Cleanup options
 * @returns {Promise<Object>} Cleanup result
 */
async function cleanupBackups(token, store, options = {}) {
  const { prefix = 'BACKUP_', retention = 3 } = options;

  try {
    core.info(`Enforcing backup retention policy (keep ${retention} backups)...`);

    // List all themes
    const themes = await listThemes(token, store);

    // Filter backup themes
    const backupThemes = themes.filter(
      (theme) => theme.name.startsWith(prefix) && theme.role !== 'main'
    );

    core.info(`Found ${backupThemes.length} backup themes`);

    if (backupThemes.length <= retention) {
      core.info(`Current backups (${backupThemes.length}) within retention limit (${retention})`);
      return {
        deleted: [],
        remaining: backupThemes,
      };
    }

    // Sort by created_at (oldest first)
    backupThemes.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    // Determine which themes to delete
    const toDelete = backupThemes.slice(0, backupThemes.length - retention);
    const toKeep = backupThemes.slice(backupThemes.length - retention);

    core.info(`Deleting ${toDelete.length} old backup(s)...`);

    const deleted = [];
    for (const theme of toDelete) {
      // Double-check theme is safe to delete
      if (theme.role === 'main') {
        core.warning(`Skipping deletion of ${theme.name} - it's the published theme!`);
        continue;
      }

      core.info(`Deleting backup: ${theme.name} (ID: ${theme.id})`);

      try {
        await deleteTheme(token, store, theme.id);
        deleted.push(theme);
      } catch (error) {
        core.warning(`Failed to delete ${theme.name}: ${error.message}`);
      }
    }

    core.info(`✅ Deleted ${deleted.length} backup(s), keeping ${toKeep.length}`);

    return {
      deleted,
      remaining: toKeep,
    };
  } catch (error) {
    core.error(`Failed to cleanup backups: ${error.message}`);
    throw error;
  }
}

/**
 * Delete a theme
 * @param {string} token - Theme access token
 * @param {string} store - Store domain
 * @param {string} themeId - Theme ID to delete
 * @returns {Promise<void>}
 */
async function deleteTheme(token, store, themeId) {
  const storeDomain = normalizeStore(store);

  const options = {
    env: {
      ...process.env,
      SHOPIFY_CLI_THEME_TOKEN: token,
      SHOPIFY_FLAG_STORE: storeDomain,
    },
  };

  await exec.exec(
    'shopify',
    ['theme', 'delete', '--store', storeDomain, '--theme', themeId.toString(), '--force'],
    options
  );
}

/**
 * Check if theme limit would be exceeded
 * @param {string} token - Theme access token
 * @param {string} store - Store domain
 * @param {Object} options - Options
 * @returns {Promise<Object>} Theme capacity info
 */
async function checkThemeCapacity(token, store, options = {}) {
  const { maxThemes = 20, prefix = 'BACKUP_' } = options;

  try {
    const themes = await listThemes(token, store);

    const currentCount = themes.length;
    const backupCount = themes.filter((t) => t.name.startsWith(prefix)).length;
    const availableSlots = maxThemes - currentCount;

    core.info(`Theme capacity: ${currentCount}/${maxThemes} (${availableSlots} available)`);
    core.info(`Current backups: ${backupCount}`);

    return {
      current: currentCount,
      max: maxThemes,
      available: availableSlots,
      backups: backupCount,
      canCreate: availableSlots > 0,
      needsCleanup: availableSlots <= 0 && backupCount > 0,
    };
  } catch (error) {
    core.error(`Failed to check theme capacity: ${error.message}`);
    throw error;
  }
}

/**
 * Ensure sufficient theme capacity
 * @param {string} token - Theme access token
 * @param {string} store - Store domain
 * @param {Object} options - Options
 * @returns {Promise<void>}
 */
async function ensureThemeCapacity(token, store, options = {}) {
  const capacity = await checkThemeCapacity(token, store, options);

  if (capacity.canCreate) {
    core.info('Sufficient theme capacity available');
    return;
  }

  if (!capacity.needsCleanup) {
    throw new Error(
      `Theme limit reached (${capacity.current}/${capacity.max}) and no backups to clean up. ` +
        `Please manually delete unused themes.`
    );
  }

  core.info('Theme limit reached, cleaning up old backups...');

  // Try to free up one slot by deleting oldest backup
  const themes = await listThemes(token, store);
  const backups = themes
    .filter((t) => t.name.startsWith(options.prefix || 'BACKUP_') && t.role !== 'main')
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  if (backups.length > 0) {
    const oldest = backups[0];
    core.info(`Deleting oldest backup: ${oldest.name}`);
    await deleteTheme(token, store, oldest.id);
    core.info('✅ Made space for new backup');
  } else {
    throw new Error('No deletable backups found to make space');
  }
}

module.exports = {
  createBackup,
  duplicateTheme,
  waitForThemeProcessing,
  cleanupBackups,
  deleteTheme,
  checkThemeCapacity,
  ensureThemeCapacity,
};
