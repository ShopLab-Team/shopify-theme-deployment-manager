const core = require('@actions/core');
const { validateInputs } = require('./utils/validators');
const { getConfig } = require('./utils/config');
const { sanitizeConfig } = require('./utils/sanitize');
const { installShopifyCLI, validateThemeToken } = require('./utils/shopify-cli');
const { stagingDeploy } = require('./modes/staging');
const { productionDeploy } = require('./modes/production');
const { syncLive } = require('./modes/sync-live');

/**
 * Main entry point for the GitHub Action
 */
async function run() {
  let config;

  try {
    // Check for common input mistakes
    const invalidInputs = [
      'build.enabled',
      'backup.enabled',
      'versioning.enabled',
      'push.nodelete',
    ];
    for (const invalid of invalidInputs) {
      if (core.getInput(invalid)) {
        const correct = invalid.replace('.', '_');
        core.warning(
          `⚠️ Invalid input '${invalid}' detected. Did you mean '${correct}'? GitHub Actions inputs use underscores, not dots.`
        );
      }
    }

    // Get and validate inputs
    config = getConfig();

    // Sanitize inputs to prevent injection attacks
    config = sanitizeConfig(config);

    // Log mode and store for debugging
    core.startGroup('🚀 Starting Shopify Theme Deploy Action');
    core.info(`Mode: ${config.mode || 'NOT SET'}`);
    core.info(`Store: ${config.store || 'NOT SET'}`);
    core.info(`Dry Run: ${config.dryRun ? 'YES' : 'NO'}`);
    core.endGroup();

    // Validate inputs based on mode
    const validationErrors = validateInputs(config);
    if (validationErrors.length > 0) {
      throw new Error(`Input validation failed:\n${validationErrors.join('\n')}`);
    }

    // Install Shopify CLI if not in dry-run mode
    if (!config.dryRun) {
      await installShopifyCLI();

      // Validate theme token
      if (config.secrets.themeToken) {
        core.info('Validating theme access token...');
        await validateThemeToken(config.secrets.themeToken, config.store);
        core.info('✅ Theme access token validated');
      }
    }

    // Execute based on mode
    let result;
    switch (config.mode) {
      case 'staging':
        core.info('📦 Running staging deployment...');
        result = await stagingDeploy(config);
        break;

      case 'production':
        core.info('🚢 Running production deployment...');
        result = await productionDeploy(config);
        break;

      case 'sync-live':
        core.info('🔄 Running live theme sync...');
        result = await syncLive(config);
        break;

      default:
        throw new Error(`Invalid mode: ${config.mode}. Must be staging, production, or sync-live`);
    }

    // Set outputs
    if (result) {
      const outputs = [
        'themeId',
        'themeName',
        'previewUrl',
        'editorUrl',
        'version',
        'packagePath',
        'synced',
        'filesCount',
        'branch',
        'pullRequestUrl',
        'deploymentTime',
      ];
      const outputMap = {
        themeId: 'theme_id',
        themeName: 'theme_name',
        previewUrl: 'preview_url',
        editorUrl: 'editor_url',
        packagePath: 'package_path',
        filesCount: 'files_count',
        pullRequestUrl: 'pull_request_url',
        deploymentTime: 'deployment_time',
      };

      for (const key of outputs) {
        if (result[key]) {
          const outputKey = outputMap[key] || key;
          core.setOutput(outputKey, result[key]);
        }
      }
    }

    core.info('✅ Action completed successfully!');
  } catch (error) {
    core.setFailed(`Action failed: ${error.message}`);
    // Check for additional context from command execution errors
    if (error.stderr) {
      core.error(`Stderr: ${error.stderr}`);
    }
    if (error.stdout) {
      core.info(`Stdout: ${error.stdout}`);
    }
    if (error.stack) {
      core.debug(error.stack);
    }
  }
}

// Run the action if this is the main module
if (require.main === module) {
  run();
}

module.exports = { run };
