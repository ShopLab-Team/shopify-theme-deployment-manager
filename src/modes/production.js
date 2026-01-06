const core = require('@actions/core');
const { getLiveTheme, getThemeById, pushThemeFiles, openTheme } = require('../utils/shopify-cli');
const { createBackup, cleanupBackups, ensureThemeCapacity } = require('../utils/backup');
const { normalizeStore } = require('../utils/validators');
const { buildAssets } = require('../utils/build');
const { sendSlackNotification } = require('../utils/slack');
const { sendMSTeamsNotification } = require('../utils/msteams');
const { renameThemeWithVersion } = require('../utils/versioning');
const { getLatestReleaseVersion } = require('../utils/github-release');

/**
 * Execute production deployment
 * @param {Object} config - Configuration object
 * @returns {Promise<Object>} Deployment result
 */
async function productionDeploy(config) {
  try {
    core.info('Starting production deployment...');

    // Dry run mode - just log what would happen
    if (config.dryRun) {
      core.info('[DRY RUN] Would perform production deployment with:');
      core.info(`  Store: ${config.store}`);
      core.info(
        `  Production Theme ID: ${config.secrets.productionThemeId ? '[SET]' : '[FALLBACK TO LIVE]'}`
      );
      core.info(`  Backup enabled: ${config.backup.enabled}`);
      core.info(`  Backup retention: ${config.backup.retention}`);
      core.info(`  Versioning enabled: ${config.versioning.enabled}`);
      core.info(`  Ignore JSON on prod: ${config.deploy.ignoreJsonOnProd}`);

      return {
        themeId: 'dry-run-production-id',
        themeName: 'PRODUCTION [0.0.1]',
        version: '0.0.1',
        previewUrl: `https://${config.store}`,
        editorUrl: `https://${config.store}/admin/themes/dry-run`,
      };
    }

    const startTime = Date.now();
    const storeDomain = normalizeStore(config.store);
    let backupTheme = null;

    // Step 1: Build assets if enabled
    if (config.build.enabled) {
      core.startGroup('📦 Building theme assets');
      await buildAssets(config.build);
      core.endGroup();
    }

    // Step 2: Create backup if enabled
    if (config.backup.enabled) {
      core.startGroup('💾 Creating backup');

      // Ensure we have capacity for a new theme
      await ensureThemeCapacity(config.secrets.themeToken, config.store, {
        prefix: config.backup.prefix,
      });

      // Create the backup
      backupTheme = await createBackup(config.secrets.themeToken, config.store, {
        prefix: config.backup.prefix,
        timezone: config.backup.timezone,
      });

      core.info(`Backup created: ${backupTheme.name} (ID: ${backupTheme.id})`);
      core.endGroup();

      // Step 3: Enforce retention policy
      core.startGroup('🗑️ Enforcing backup retention');
      const cleanupResult = await cleanupBackups(config.secrets.themeToken, config.store, {
        prefix: config.backup.prefix,
        retention: config.backup.retention,
      });

      if (cleanupResult.deleted.length > 0) {
        core.info(`Deleted ${cleanupResult.deleted.length} old backup(s)`);
      }
      core.info(`Current backups: ${cleanupResult.remaining.length}`);
      core.endGroup();
    }

    // Step 4: Select production target
    core.startGroup('🎯 Selecting production target');
    let productionTheme;

    if (config.secrets.productionThemeId) {
      // Use specified production theme
      productionTheme = await getThemeById(
        config.secrets.themeToken,
        config.store,
        config.secrets.productionThemeId
      );

      if (!productionTheme) {
        throw new Error(`Production theme ${config.secrets.productionThemeId} not found`);
      }

      core.info(
        `Using specified production theme: ${productionTheme.name} (ID: ${productionTheme.id})`
      );
    } else {
      // Fallback to live theme
      productionTheme = await getLiveTheme(config.secrets.themeToken, config.store);

      if (!productionTheme) {
        throw new Error('No live theme found and no production theme ID specified');
      }

      // Check if we're allowed to push to live
      if (!config.deploy.allowLivePush) {
        throw new Error(
          'Attempting to push to live theme but deploy.allow_live_push is false. ' +
            'Either specify PRODUCTION_THEME_ID or set deploy.allow_live_push to true.'
        );
      }

      core.info(
        `Using live theme as production target: ${productionTheme.name} (ID: ${productionTheme.id})`
      );
    }
    core.endGroup();

    // Step 5: Selective push to production
    core.startGroup('📤 Deploying to production');

    if (config.deploy.ignoreJsonOnProd) {
      // Phase A: Push everything except JSON files
      core.info('Phase A: Pushing code files (ignoring JSON)...');

      const ignorePatterns = [
        'templates/*.json',
        'templates/**/*.json',
        'sections/*.json',
        'snippets/*.json',
        'blocks/*.json',
        'config/settings_data.json',
        'locales/*.json',
      ];

      await pushThemeFiles(config.secrets.themeToken, config.store, productionTheme.id.toString(), {
        ignore: ignorePatterns,
        nodelete: config.push.nodelete,
        allowLive: true, // Always allow live push in production mode
        force: true,
      });

      // Phase B: Push only en.default.json and en.default.schema.json
      core.info('Phase B: Pushing default locale and schema...');

      await pushThemeFiles(config.secrets.themeToken, config.store, productionTheme.id.toString(), {
        only: ['locales/en.default.json', 'locales/en.default.schema.json'],
        nodelete: true,
        allowLive: true, // Always allow live push in production mode
        force: true,
      });
    } else {
      // Push everything
      core.info('Pushing all files to production...');

      await pushThemeFiles(config.secrets.themeToken, config.store, productionTheme.id.toString(), {
        nodelete: config.push.nodelete,
        allowLive: true, // Always allow live push in production mode
        force: true,
      });
    }

    core.info('Production deployment complete');
    core.endGroup();

    // Step 6: Version tagging
    let newVersion = null;
    if (config.versioning.enabled) {
      core.startGroup('🏷️ Updating version tag');

      let startVersion = config.versioning.start;
      let useReleaseVersionDirectly = false;

      // If using GitHub release as version source, get latest release version
      if (config.versioning.source === 'release') {
        core.info('Using GitHub release version as source');
        const releaseVersion = await getLatestReleaseVersion(config.secrets.githubToken);
        if (releaseVersion) {
          startVersion = releaseVersion;
          useReleaseVersionDirectly = true;
          core.info(`Latest GitHub release version: ${releaseVersion}`);
        } else {
          core.warning('No GitHub releases found, falling back to theme name version');
        }
      }

      const versionResult = await renameThemeWithVersion(
        config.secrets.themeToken,
        config.store,
        productionTheme.id.toString(),
        config.versioning.format,
        startVersion,
        useReleaseVersionDirectly
      );

      newVersion = versionResult.version;
      productionTheme.name = versionResult.name;

      core.info(`Theme renamed to: ${versionResult.name}`);
      core.info(`Version: ${versionResult.oldVersion || 'none'} → ${versionResult.version}`);

      core.endGroup();
    }

    // Calculate deployment time
    const deploymentTime = Math.round((Date.now() - startTime) / 1000);

    // Get proper theme URLs using theme open command
    let previewUrl, editorUrl;
    try {
      const urls = await openTheme(
        config.secrets.themeToken,
        config.store,
        productionTheme.id.toString()
      );
      previewUrl = urls.preview;
      editorUrl = urls.editor;
    } catch (error) {
      // Fallback to constructed URLs
      previewUrl =
        productionTheme.role === 'main' || productionTheme.role === 'live'
          ? `https://${storeDomain}`
          : `https://${storeDomain}?preview_theme_id=${productionTheme.id}`;
      editorUrl = `https://${storeDomain}/admin/themes/${productionTheme.id}/editor`;
    }

    // Note: Theme packaging removed - users can create releases in their own workflows if needed

    // Prepare result
    const result = {
      themeId: productionTheme.id.toString(),
      themeName: productionTheme.name,
      version: newVersion,
      previewUrl,
      editorUrl,
      backupId: backupTheme?.id,
      backupName: backupTheme?.name,
      deploymentTime,
    };

    // Step 7: Send notifications if configured
    if (config.secrets.slackWebhookUrl) {
      core.startGroup('🔔 Sending Slack notification');
      await sendSlackNotification({
        webhookUrl: config.secrets.slackWebhookUrl,
        mode: 'production',
        success: true,
        themeName: productionTheme.name,
        themeId: productionTheme.id.toString(),
        previewUrl: result.previewUrl,
        version: newVersion,
        deploymentTime,
      });
      core.endGroup();
    }

    if (config.secrets.msTeamsWebhookUrl) {
      core.startGroup('🔔 Sending MS Teams notification');
      await sendMSTeamsNotification({
        webhookUrl: config.secrets.msTeamsWebhookUrl,
        mode: 'production',
        success: true,
        themeName: productionTheme.name,
        themeId: productionTheme.id.toString(),
        previewUrl: result.previewUrl,
        version: newVersion,
        deploymentTime,
      });
      core.endGroup();
    }

    core.info(`✅ Production deployment completed in ${deploymentTime}s`);
    return result;
  } catch (error) {
    core.error(`Production deployment failed: ${error.message}`);

    // Send failure notifications if configured
    if (config.secrets.slackWebhookUrl) {
      await sendSlackNotification({
        webhookUrl: config.secrets.slackWebhookUrl,
        mode: 'production',
        success: false,
        error: error.message,
      });
    }

    if (config.secrets.msTeamsWebhookUrl) {
      await sendMSTeamsNotification({
        webhookUrl: config.secrets.msTeamsWebhookUrl,
        mode: 'production',
        success: false,
        error: error.message,
      });
    }

    throw error;
  }
}

module.exports = { productionDeploy };
