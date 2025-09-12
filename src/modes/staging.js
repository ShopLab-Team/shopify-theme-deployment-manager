const core = require('@actions/core');
const {
  getLiveTheme,
  ensureThemeExists,
  pullThemeFiles,
  pushThemeFiles,
} = require('../utils/shopify-cli');
const { normalizeStore } = require('../utils/validators');
const { buildAssets } = require('../utils/build');
const { sendSlackNotification } = require('../utils/slack');

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

    // Step 3: Get live theme for JSON pull
    core.startGroup('🔄 Getting live theme');
    const liveTheme = await getLiveTheme(config.secrets.themeToken, config.store);
    if (!liveTheme) {
      core.warning('No live theme found, skipping JSON pull');
    }
    core.endGroup();

    // Step 4: Pull JSON from live theme
    if (liveTheme && config.json.pullGlobs.length > 0) {
      core.startGroup('📥 Pulling JSON from live theme');
      await pullThemeFiles(
        config.secrets.themeToken,
        config.store,
        liveTheme.id.toString(),
        config.json.pullGlobs,
        '.'
      );
      core.info('JSON files pulled from live theme');
      core.endGroup();
    }

    // Step 5: Push to staging theme
    core.startGroup('📤 Pushing to staging theme');
    const pushOptions = {
      ignore: config.push.extraIgnore || [],
      nodelete: config.push.nodelete,
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

    // Step 6: Send Slack notification if configured
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

    // Send failure notification if configured
    if (config.secrets.slackWebhookUrl) {
      await sendSlackNotification({
        webhookUrl: config.secrets.slackWebhookUrl,
        mode: 'staging',
        success: false,
        error: error.message,
      });
    }

    throw error;
  }
}

module.exports = { stagingDeploy };
