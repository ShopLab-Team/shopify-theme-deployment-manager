const core = require('@actions/core');
const {
  getLiveTheme,
  getThemeById,
  ensureThemeExists,
  pullThemeFiles,
  pushThemeFiles,
} = require('../utils/shopify-cli');
const { normalizeStore } = require('../utils/validators');
const { buildAssets } = require('../utils/build');
const { sendSlackNotification } = require('../utils/slack');
const { sendMSTeamsNotification } = require('../utils/msteams');

/**
 * Execute staging deployment
 * @param {Object} config - Configuration object
 * @returns {Promise<Object>} Deployment result
 */
async function stagingDeploy(config) {
  try {
    core.info('Starting staging deployment...');

    // Dry run mode - just log what would happen
    if (config.dryRun) {
      core.startGroup('[DRY RUN] Staging deployment simulation');
      core.info(`Store: ${config.store}`);
      core.info(`Staging Theme ID: ${config.secrets.stagingThemeId ? '[SET]' : '[NOT SET]'}`);
      core.info(`Build enabled: ${config.build.enabled}`);
      core.info(`Build command: ${config.build.command}`);
      core.info(`JSON sync enabled: ${config.json.syncOnStaging}`);
      core.info(`JSON pull globs: ${config.json.pullGlobs.join(', ')}`);
      core.endGroup();

      return {
        themeId: 'dry-run-staging-id',
        themeName: 'STAGING [DRY RUN]',
        previewUrl: `https://${config.store}?preview_theme_id=dry-run`,
        editorUrl: `https://${config.store}/admin/themes/dry-run`,
      };
    }

    const startTime = Date.now();
    const storeDomain = normalizeStore(config.store);

    // Validate required inputs
    if (!config.secrets.stagingThemeId) {
      throw new Error('STAGING_THEME_ID is required for staging deployment');
    }

    // Step 1: Build assets if enabled
    if (config.build.enabled) {
      core.startGroup('📦 Building theme assets');
      await buildAssets(config.build);
      core.endGroup();
    }

    // Step 2: Verify staging theme exists
    core.startGroup('🔍 Verifying staging theme');
    const stagingTheme = await ensureThemeExists(
      config.secrets.themeToken,
      config.store,
      config.secrets.stagingThemeId
    );
    core.info(`Staging theme found: ${stagingTheme.name} (ID: ${stagingTheme.id})`);
    core.endGroup();

    // Step 3: Get source theme for JSON pull (production theme or live theme)
    let sourceTheme = null;

    if (config.json.syncOnStaging && config.json.pullGlobs.length > 0) {
      core.startGroup('🔄 Getting source theme for JSON pull');

      // First, check if production theme ID is provided
      if (config.secrets.productionThemeId) {
        core.info(`Using provided production theme ID: ${config.secrets.productionThemeId}`);
        try {
          // Verify the production theme exists
          sourceTheme = await getThemeById(
            config.secrets.themeToken,
            config.store,
            config.secrets.productionThemeId
          );
          if (sourceTheme) {
            core.info(`Production theme found: ${sourceTheme.name} (ID: ${sourceTheme.id})`);
          } else {
            core.warning(`Production theme ID ${config.secrets.productionThemeId} not found`);
          }
        } catch (error) {
          core.warning(`Failed to get production theme: ${error.message}`);
        }
      }

      // If no production theme ID or it wasn't found, try to find live theme
      if (!sourceTheme) {
        core.info('No production theme ID provided or not found, looking for live theme...');
        sourceTheme = await getLiveTheme(config.secrets.themeToken, config.store);
        if (!sourceTheme) {
          core.warning('No live theme found, skipping JSON pull');
        } else {
          core.info(`Live theme found: ${sourceTheme.name} (ID: ${sourceTheme.id})`);
        }
      }

      core.endGroup();
    } else if (!config.json.syncOnStaging) {
      core.info(
        '⏭️ Skipping JSON sync (disabled via SYNC_JSON_ON_STAGING or json_sync_on_staging)'
      );
    }

    // Step 4: Pull JSON from source theme
    if (sourceTheme && config.json.syncOnStaging && config.json.pullGlobs.length > 0) {
      core.startGroup('📥 Pulling JSON from source theme');
      // Ensure theme ID is passed as string
      const themeIdString = sourceTheme.id ? sourceTheme.id.toString() : sourceTheme.toString();
      await pullThemeFiles(
        config.secrets.themeToken,
        config.store,
        themeIdString,
        config.json.pullGlobs,
        '.'
      );
      core.info(
        `JSON files pulled from theme ${sourceTheme.name || sourceTheme} (ID: ${themeIdString})`
      );
      core.endGroup();
    }

    // Step 5: Push to staging theme
    core.startGroup('📤 Pushing to staging theme');
    const pushOptions = {
      ignore: config.push.extraIgnore || [],
      nodelete: config.push.nodelete,
      force: true,
    };

    await pushThemeFiles(
      config.secrets.themeToken,
      config.store,
      config.secrets.stagingThemeId,
      pushOptions
    );
    core.info('Theme files pushed to staging');
    core.endGroup();

    // Calculate deployment time
    const deploymentTime = Math.round((Date.now() - startTime) / 1000);

    // Prepare result
    const result = {
      themeId: stagingTheme.id.toString(),
      themeName: stagingTheme.name,
      previewUrl: `https://${storeDomain}?preview_theme_id=${stagingTheme.id}`,
      editorUrl: `https://${storeDomain}/admin/themes/${stagingTheme.id}/editor`,
      deploymentTime,
    };

    // Step 6: Send notifications if configured
    if (config.secrets.slackWebhookUrl) {
      core.startGroup('🔔 Sending Slack notification');
      await sendSlackNotification({
        webhookUrl: config.secrets.slackWebhookUrl,
        mode: 'staging',
        success: true,
        themeName: stagingTheme.name,
        themeId: stagingTheme.id.toString(),
        previewUrl: result.previewUrl,
        deploymentTime,
      });
      core.endGroup();
    }

    if (config.secrets.msTeamsWebhookUrl) {
      core.startGroup('🔔 Sending MS Teams notification');
      await sendMSTeamsNotification({
        webhookUrl: config.secrets.msTeamsWebhookUrl,
        mode: 'staging',
        success: true,
        themeName: stagingTheme.name,
        themeId: stagingTheme.id.toString(),
        previewUrl: result.previewUrl,
        deploymentTime,
      });
      core.endGroup();
    }

    // Set GitHub Action outputs
    core.setOutput('theme_id', result.themeId);
    core.setOutput('theme_name', result.themeName);
    core.setOutput('preview_url', result.previewUrl);
    core.setOutput('editor_url', result.editorUrl);
    core.setOutput('deployment_time', deploymentTime.toString());

    core.info(`✅ Staging deployment completed in ${deploymentTime}s`);
    return result;
  } catch (error) {
    core.error(`Staging deployment failed: ${error.message}`);

    // Send failure notifications if configured
    if (config.secrets.slackWebhookUrl) {
      await sendSlackNotification({
        webhookUrl: config.secrets.slackWebhookUrl,
        mode: 'staging',
        success: false,
        error: error.message,
      });
    }

    if (config.secrets.msTeamsWebhookUrl) {
      await sendMSTeamsNotification({
        webhookUrl: config.secrets.msTeamsWebhookUrl,
        mode: 'staging',
        success: false,
        error: error.message,
      });
    }

    throw error;
  }
}

module.exports = { stagingDeploy };
