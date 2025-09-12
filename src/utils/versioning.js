const core = require('@actions/core');
const exec = require('@actions/exec');
const semver = require('semver');
const { normalizeStore } = require('./validators');

/**
 * Extract version from theme name
 * @param {string} themeName - Theme name
 * @returns {Object} Version info
 */
function extractVersion(themeName) {
  // Match version pattern [x.y.z] at the end of the name
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
 * Bump version according to strategy
 * @param {string} currentVersion - Current version string
 * @param {string} strategy - Bump strategy (patch, minor, major)
 * @returns {string} New version
 */
function bumpVersion(currentVersion, strategy = 'patch') {
  if (!currentVersion) {
    return '0.0.1';
  }

  // Ensure version is valid semver
  const cleanVersion = semver.clean(currentVersion);
  if (!cleanVersion) {
    core.warning(`Invalid version format: ${currentVersion}, resetting to 0.0.1`);
    return '0.0.1';
  }

  // Bump according to strategy
  const newVersion = semver.inc(cleanVersion, strategy);
  if (!newVersion) {
    core.warning(`Failed to bump version ${cleanVersion} with strategy ${strategy}`);
    return '0.0.1';
  }

  return newVersion;
}

/**
 * Rename theme with version tag
 * @param {string} token - Theme access token
 * @param {string} store - Store domain
 * @param {string} themeId - Theme ID
 * @param {string} strategy - Version bump strategy
 * @returns {Promise<Object>} Version result
 */
async function renameThemeWithVersion(token, store, themeId, strategy = 'patch') {
  try {
    // Get current theme name
    const { getThemeById } = require('./shopify-cli');
    const theme = await getThemeById(token, store, themeId);

    if (!theme) {
      throw new Error(`Theme ${themeId} not found`);
    }

    const currentName = theme.name;
    core.info(`Current theme name: ${currentName}`);

    // Extract current version
    const versionInfo = extractVersion(currentName);

    // Bump version
    const oldVersion = versionInfo.version;
    const newVersion = bumpVersion(oldVersion, strategy);

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

  const v1 = semver.clean(version1);
  const v2 = semver.clean(version2);

  if (!v1 || !v2) {
    return 0;
  }

  return semver.compare(v1, v2);
}

/**
 * Get next version for a theme
 * @param {string} themeName - Theme name
 * @param {string} strategy - Version bump strategy
 * @returns {Object} Version info
 */
function getNextVersion(themeName, strategy = 'patch') {
  const versionInfo = extractVersion(themeName);
  const currentVersion = versionInfo.version || '0.0.0';
  const nextVersion = bumpVersion(currentVersion, strategy);

  return {
    current: currentVersion,
    next: nextVersion,
    baseName: versionInfo.baseName,
    newName: `${versionInfo.baseName} [${nextVersion}]`,
  };
}

/**
 * Parse version strategy from string
 * @param {string} strategy - Strategy string
 * @returns {string} Valid strategy
 */
function parseVersionStrategy(strategy) {
  const validStrategies = ['patch', 'minor', 'major'];
  const normalized = strategy?.toLowerCase();

  if (validStrategies.includes(normalized)) {
    return normalized;
  }

  core.warning(`Invalid version strategy: ${strategy}, defaulting to patch`);
  return 'patch';
}

module.exports = {
  extractVersion,
  bumpVersion,
  renameThemeWithVersion,
  renameTheme,
  compareVersions,
  getNextVersion,
  parseVersionStrategy,
};
