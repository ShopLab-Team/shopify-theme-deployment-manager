const core = require('@actions/core');

/**
 * Parse multiline string input into array
 * @param {string} input - Multiline string input
 * @returns {string[]} Array of non-empty lines
 */
function parseMultilineInput(input) {
  if (!input) return [];
  return input
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Parse boolean input
 * @param {string|boolean} input - String or boolean value
 * @returns {boolean} Parsed boolean
 */
function parseBoolean(input) {
  if (typeof input === 'boolean') {
    return input;
  }
  if (typeof input === 'string') {
    return input.toLowerCase() === 'true';
  }
  return false;
}

/**
 * Get configuration from action inputs
 * @returns {Object} Configuration object
 */
function getConfig() {
  // Get all inputs with INPUT_ prefix from environment
  const getInput = (name) => process.env[`INPUT_${name.toUpperCase()}`] || '';

  const config = {
    // Core configuration
    mode: getInput('mode'),
    // Store can be provided as input or secret (secret takes precedence)
    store: process.env.SHOPIFY_STORE_URL || getInput('store'),
    dryRun: parseBoolean(getInput('dry_run')),

    // Branch configuration
    branch: {
      staging: getInput('branch_staging') || 'staging',
      production: parseMultilineInput(getInput('branch_production') || 'main,master'),
    },

    // Build configuration
    build: {
      enabled: parseBoolean(getInput('build_enabled')),
      nodeVersion: getInput('build_node_version') || '20.x',
      packageManager: getInput('build_package_manager') || 'npm',
      command: getInput('build_command') || 'npm ci && npm run build',
      cwd: getInput('build_cwd') || '.',
    },

    // JSON configuration
    json: {
      pullGlobs: parseMultilineInput(
        getInput('json_pull_globs') ||
          'templates/*.json\ntemplates/customers/*.json\nsections/*.json\nsnippets/*.json\nlocales/*.json\nconfig/settings_data.json'
      ),
      syncOnStaging: parseBoolean(
        process.env.SYNC_JSON_ON_STAGING !== undefined
          ? process.env.SYNC_JSON_ON_STAGING
          : getInput('json_sync_on_staging') !== ''
            ? getInput('json_sync_on_staging')
            : 'true'
      ),
    },

    // Push configuration
    push: {
      extraIgnore: parseMultilineInput(getInput('push_extra_ignore')),
      nodelete: parseBoolean(getInput('push_nodelete')),
    },

    // Backup configuration
    backup: {
      enabled: parseBoolean(getInput('backup_enabled')),
      retention: Math.max(0, parseInt(getInput('backup_retention') || '3', 10) || 3),
      prefix: getInput('backup_prefix') || 'BACKUP_',
      timezone: getInput('backup_timezone') || 'Asia/Manila',
    },

    // Deploy configuration
    deploy: {
      ignoreJsonOnProd: parseBoolean(getInput('deploy_ignore_json_on_prod')),
      allowLivePush: parseBoolean(getInput('deploy_allow_live_push')),
    },

    // Versioning configuration
    versioning: {
      enabled: parseBoolean(getInput('versioning_enabled')),
      strategy: getInput('versioning_strategy') || 'patch',
    },

    // Sync configuration
    sync: {
      onlyGlobs: parseMultilineInput(
        getInput('sync_only_globs') ||
          'templates/*.json\ntemplates/customers/*.json\nsections/*.json\nsnippets/*.json\nlocales/*.json\nconfig/settings_data.json'
      ),
      branch: getInput('sync_branch') || 'remote_changes',
      targetBranch: getInput('sync_target_branch') || 'staging',
      commitMessage: getInput('sync_commit_message') || 'chore(sync): import live JSON changes',
      output: getInput('sync_output') || 'pr',
    },

    // Secrets (from environment variables)
    secrets: {
      themeToken: process.env.SHOPIFY_CLI_THEME_TOKEN,
      stagingThemeId: process.env.STAGING_THEME_ID,
      productionThemeId: process.env.PRODUCTION_THEME_ID,
      slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
      githubToken: process.env.GITHUB_TOKEN,
    },
  };

  // Log configuration (redact secrets)
  if (!config.dryRun) {
    core.debug('Configuration loaded:');
    core.debug(
      JSON.stringify(
        {
          ...config,
          secrets: {
            themeToken: config.secrets.themeToken ? '[REDACTED]' : undefined,
            stagingThemeId: config.secrets.stagingThemeId ? '[REDACTED]' : undefined,
            productionThemeId: config.secrets.productionThemeId ? '[REDACTED]' : undefined,
            slackWebhookUrl: config.secrets.slackWebhookUrl ? '[REDACTED]' : undefined,
            githubToken: config.secrets.githubToken ? '[REDACTED]' : undefined,
          },
        },
        null,
        2
      )
    );
  }

  return config;
}

module.exports = {
  getConfig,
  parseMultilineInput,
  parseBoolean,
};
