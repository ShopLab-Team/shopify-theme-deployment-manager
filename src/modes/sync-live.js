const core = require('@actions/core');
const exec = require('@actions/exec');
const { getLiveTheme, pullThemeFiles } = require('../utils/shopify-cli');
const { normalizeStore } = require('../utils/validators');
const { sendSlackNotification } = require('../utils/slack');
const {
  createPullRequest,
  pushToRemoteBranch,
  getCurrentBranch,
  hasUncommittedChanges,
  createOrCheckoutBranch,
  getChangedFiles,
} = require('../utils/git');
const fs = require('fs').promises;

/**
 * Sync live theme changes back to repository
 * @param {Object} config - Configuration object
 * @returns {Promise<Object>} Sync result
 */
async function syncLive(config) {
  try {
    core.info('Starting live theme sync...');

    // Dry run mode - just log what would happen
    if (config.dryRun) {
      core.startGroup('[DRY RUN] Live sync simulation');
      core.info(`Store: ${config.store}`);
      core.info(`Sync globs: ${config.sync.onlyGlobs.join(', ')}`);
      core.info(`Sync branch: ${config.sync.branch}`);
      core.info(`Sync output: ${config.sync.output}`);
      core.info(`Commit message: ${config.sync.commitMessage}`);
      core.endGroup();

      return {
        mode: 'sync-live',
        synced: true,
        filesSynced: ['[DRY RUN] Would sync specified files'],
        branch: config.sync.branch,
        pullRequest: config.sync.output === 'pr' ? '[DRY RUN] Would create PR' : null,
      };
    }

    const startTime = Date.now();
    const storeDomain = normalizeStore(config.store);
    let pullRequestUrl = null;

    // Step 1: Get live theme
    core.startGroup('🎯 Getting live theme');
    const liveTheme = await getLiveTheme(config.secrets.themeToken, config.store);

    if (!liveTheme) {
      throw new Error('No live theme found to sync from');
    }

    core.info(`Live theme: ${liveTheme.name} (ID: ${liveTheme.id})`);
    core.endGroup();

    // Step 2: Store current branch
    const originalBranch = await getCurrentBranch();
    core.info(`Current branch: ${originalBranch}`);

    // Step 3: Create or checkout sync branch (only for PR mode)
    if (config.sync.output === 'pr') {
      core.startGroup('🌿 Setting up sync branch');
      await createOrCheckoutBranch(config.sync.branch, originalBranch);
      core.endGroup();
    }

    core.startGroup('📝 Creating .shopifyignore to exclude non-theme files');
    const shopifyIgnoreContent = [
      '.git',
      '.github',
      '.vscode',
      '*.config.js',
      'package.json',
      'package-lock.json',
      'yarn.lock',
      'pnpm-lock.yaml',
      'node_modules',
      '.gitignore',
      'README.md',
      'LICENSE',
      '.env',
      'dist',
      'coverage',
    ].join('\n');
    await fs.writeFile('.shopifyignore', shopifyIgnoreContent);
    core.info('Created .shopifyignore file.');
    core.endGroup();

    // Step 4: Pull theme files
    core.startGroup('📥 Pulling files from live theme');
    await pullThemeFiles(
      config.secrets.themeToken,
      config.store,
      liveTheme.id.toString(),
      config.sync.onlyGlobs,
      '.'
    );
    core.info('Files pulled from live theme');
    core.endGroup();

    // Step 5: Check for changes
    core.startGroup('🔍 Checking for changes');
    const hasChanges = await hasUncommittedChanges();

    if (!hasChanges) {
      core.info('No changes detected - live theme is in sync');
      core.endGroup();

      // Switch back to original branch if we changed
      if (config.sync.output === 'pr' && originalBranch !== config.sync.branch) {
        await exec.exec('git', ['checkout', originalBranch]);
      }

      return {
        mode: 'sync-live',
        synced: false,
        message: 'No changes to sync',
        filesSynced: [],
      };
    }

    // Get list of changed files
    const changedFiles = await getChangedFiles(originalBranch);
    core.info(`Found ${changedFiles.length} changed files`);
    changedFiles.forEach((file) => core.info(`  - ${file}`));
    core.endGroup();

    // Step 6: Commit changes
    core.startGroup('💾 Committing changes');
    await exec.exec('git', ['add', '.']);
    await exec.exec('git', ['commit', '-m', config.sync.commitMessage]);
    core.info('Changes committed');
    core.endGroup();

    // Step 7: Push or create PR based on output mode
    if (config.sync.output === 'pr') {
      core.startGroup('🔀 Creating/updating pull request');

      // Push branch to remote_changes
      await pushToRemoteBranch(config.sync.branch);

      // Use configured target branch for PR (defaults to staging)
      const targetBranch = config.sync.targetBranch || 'staging';

      // Create or update pull request from remote_changes to target branch
      const pr = await createPullRequest({
        token: config.secrets.githubToken,
        branch: config.sync.branch,
        baseBranch: targetBranch,
        title: `🔄 ${config.sync.commitMessage}`,
        body: `## 📥 Live Theme Sync

This pull request contains changes pulled from the live Shopify theme.

### 📋 Changed Files
${changedFiles.map((f) => `- \`${f}\``).join('\n')}

### 🏪 Store Details
- **Store**: ${storeDomain}
- **Live Theme**: ${liveTheme.name} (ID: ${liveTheme.id})
- **Sync Time**: ${new Date().toISOString()}

### 🔧 Configuration
- **Sync Patterns**: ${config.sync.onlyGlobs.join(', ')}
- **Source Branch**: ${config.sync.branch}
- **Target Branch**: ${targetBranch}

---
*This PR was automatically generated by the Shopify Theme Deploy & Sync Action*`,
      });

      pullRequestUrl = pr.html_url;

      if (pr.number && pr.state === 'open') {
        core.info(`Pull request updated: ${pullRequestUrl}`);
      } else {
        core.info(`Pull request created: ${pullRequestUrl}`);
      }

      // Switch back to original branch
      await exec.exec('git', ['checkout', originalBranch]);
      core.endGroup();
    } else {
      // Direct push mode
      core.startGroup('📤 Pushing changes');
      await pushToRemoteBranch(originalBranch);
      core.info('Changes pushed directly to branch');
      core.endGroup();
    }

    // Calculate sync time
    const syncTime = Math.round((Date.now() - startTime) / 1000);

    // Prepare result
    const result = {
      mode: 'sync-live',
      synced: true,
      filesSynced: changedFiles,
      filesCount: changedFiles.length,
      branch: config.sync.output === 'pr' ? config.sync.branch : originalBranch,
      pullRequest: pullRequestUrl,
      syncTime,
      themeName: liveTheme.name,
      themeId: liveTheme.id.toString(),
    };

    // Step 8: Send Slack notification if configured
    if (config.secrets.slackWebhookUrl) {
      core.startGroup('🔔 Sending Slack notification');
      await sendSlackNotification({
        webhookUrl: config.secrets.slackWebhookUrl,
        mode: 'sync-live',
        success: true,
        themeName: liveTheme.name,
        themeId: liveTheme.id.toString(),
        filesCount: changedFiles.length,
        pullRequestUrl,
        syncTime,
      });
      core.endGroup();
    }

    // Set GitHub Action outputs
    core.setOutput('synced', 'true');
    core.setOutput('files_count', changedFiles.length.toString());
    core.setOutput('branch', result.branch);
    if (pullRequestUrl) {
      core.setOutput('pull_request_url', pullRequestUrl);
    }

    core.info(`✅ Live sync completed in ${syncTime}s`);
    return result;
  } catch (error) {
    core.error(`Live sync failed: ${error.message}`);

    // Send failure notification if configured
    if (config.secrets.slackWebhookUrl) {
      await sendSlackNotification({
        webhookUrl: config.secrets.slackWebhookUrl,
        mode: 'sync-live',
        success: false,
        error: error.message,
      });
    }

    throw error;
  }
}

module.exports = { syncLive };
