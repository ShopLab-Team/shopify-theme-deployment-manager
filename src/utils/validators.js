/**
 * Validate configuration based on mode
 * @param {Object} config - Configuration object
 * @returns {string[]} Array of validation errors
 */
function validateInputs(config) {
  const errors = [];

  // Common validations
  if (!config.mode) {
    errors.push('Mode is required');
  }

  if (!config.store) {
    errors.push('Store is required. Provide it as "store" input or SHOPIFY_STORE_URL secret');
  }

  // Mode-specific validations
  switch (config.mode) {
    case 'staging':
      if (!config.secrets.themeToken) {
        errors.push('SHOPIFY_CLI_THEME_TOKEN is required for staging mode');
      }
      if (!config.secrets.stagingThemeId) {
        errors.push('STAGING_THEME_ID is required for staging mode');
      }
      break;

    case 'production':
      if (!config.secrets.themeToken) {
        errors.push('SHOPIFY_CLI_THEME_TOKEN is required for production mode');
      }
      if (config.backup.retention < 0) {
        errors.push('Backup retention must be a positive number');
      }
      break;

    case 'sync-live':
      if (!config.secrets.themeToken) {
        errors.push('SHOPIFY_CLI_THEME_TOKEN is required for sync-live mode');
      }
      if (!config.secrets.githubToken && config.sync.type === 'pr') {
        errors.push('GITHUB_TOKEN is required when sync type is set to PR');
      }
      if (!['pr', 'push'].includes(config.sync.type)) {
        errors.push('Sync type must be pr or push');
      }
      break;

    default:
      errors.push(`Invalid mode: ${config.mode}. Must be staging, production, or sync-live`);
  }

  // Validate package manager
  if (!['npm', 'yarn', 'pnpm'].includes(config.build.packageManager)) {
    errors.push('Package manager must be npm, yarn, or pnpm');
  }

  // Validate Node version format
  if (config.build.enabled && config.build.nodeVersion) {
    const nodeVersionPattern = /^(\d+)(\.(\d+|x))?(\.(\d+|x))?$/;
    if (!nodeVersionPattern.test(config.build.nodeVersion)) {
      errors.push(
        `Invalid Node version format: ${config.build.nodeVersion}. Use format like '20', '20.x', or '20.10.0'`
      );
    }
  }

  // Validate store format if provided
  if (config.store && !isValidStore(config.store)) {
    errors.push(
      `Invalid store format: ${config.store}. Must be alphanumeric with hyphens, 3-60 characters`
    );
  }

  return errors;
}

/**
 * Validate Shopify store URL format
 * @param {string} store - Store URL or prefix
 * @returns {boolean} True if valid
 */
function isValidStore(store) {
  if (!store || typeof store !== 'string') {
    return false;
  }

  // Store name must be 3-60 chars, alphanumeric with hyphens
  // Accept either full domain or just the prefix
  const storePattern = /^[a-z0-9][a-z0-9-]{1,58}[a-z0-9](\.myshopify\.com)?$/i;
  return storePattern.test(store);
}

/**
 * Normalize store URL to full domain
 * @param {string} store - Store URL or prefix
 * @returns {string} Full store domain
 */
function normalizeStore(store) {
  if (store.endsWith('.myshopify.com')) {
    return store;
  }
  return `${store}.myshopify.com`;
}

/**
 * Validate theme ID format
 * @param {string} themeId - Theme ID
 * @returns {boolean} True if valid
 */
function isValidThemeId(themeId) {
  // Shopify theme IDs are numeric strings
  return /^\d+$/.test(themeId);
}

module.exports = {
  validateInputs,
  isValidStore,
  normalizeStore,
  isValidThemeId,
};
