const core = require('@actions/core');
const fs = require('fs').promises;

/**
 * Read version from version file
 * @param {string} filePath - Path to version file (default: './version')
 * @returns {Promise<string|null>} Version string or null if file doesn't exist
 */
async function readVersionFile(filePath = './version') {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const version = content.trim();
    core.debug(`Read version from ${filePath}: ${version}`);
    return version;
  } catch (error) {
    if (error.code === 'ENOENT') {
      core.debug(`Version file not found: ${filePath}`);
      return null;
    }
    throw error;
  }
}

/**
 * Write version to version file
 * @param {string} version - Version string to write
 * @param {string} filePath - Path to version file (default: './version')
 * @returns {Promise<void>}
 */
async function writeVersionFile(version, filePath = './version') {
  try {
    await fs.writeFile(filePath, version, 'utf-8');
    core.info(`✅ Version file updated: ${filePath} → ${version}`);
  } catch (error) {
    core.error(`Failed to write version file: ${error.message}`);
    throw error;
  }
}

/**
 * Check if version file exists
 * @param {string} filePath - Path to version file (default: './version')
 * @returns {Promise<boolean>} True if file exists
 */
async function versionFileExists(filePath = './version') {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  readVersionFile,
  writeVersionFile,
  versionFileExists,
};
