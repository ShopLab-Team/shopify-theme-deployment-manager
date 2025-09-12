const core = require('@actions/core');
const axios = require('axios');
const github = require('@actions/github');

/**
 * Send Slack notification
 * @param {Object} options - Notification options
 * @returns {Promise<void>}
 */
async function sendSlackNotification(options) {
  try {
    const {
      webhookUrl,
      mode,
      success,
      themeName,
      themeId,
      previewUrl,
      editorUrl,
      version,
      deploymentTime,
      error,
    } = options;

    if (!webhookUrl) {
      core.warning('Slack webhook URL not configured, skipping notification');
      return;
    }

    // Get GitHub context
    const context = github.context;
    const repository = `${context.repo.owner}/${context.repo.repo}`;
    const branch = context.ref ? context.ref.replace('refs/heads/', '') : 'unknown';
    const commit = context.sha ? context.sha.substring(0, 7) : 'unknown';
    const actor = context.actor || 'unknown';
    const workflowUrl = `${context.serverUrl}/${repository}/actions/runs/${context.runId}`;

    // Build message based on mode and status
    const message = buildSlackMessage({
      mode,
      success,
      repository,
      branch,
      commit,
      actor,
      themeName,
      themeId,
      previewUrl,
      editorUrl,
      version,
      deploymentTime,
      error,
      workflowUrl,
    });

    // Send to Slack
    const response = await axios.post(webhookUrl, message, {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });

    if (response.status === 200) {
      core.info('✅ Slack notification sent successfully');
    } else {
      core.warning(`Slack notification returned status: ${response.status}`);
    }
  } catch (error) {
    // Don't fail the workflow if Slack notification fails
    core.warning(`Failed to send Slack notification: ${error.message}`);
  }
}

/**
 * Build Slack message payload
 * @param {Object} params - Message parameters
 * @returns {Object} Slack message payload
 */
function buildSlackMessage(params) {
  const {
    mode,
    success,
    repository,
    branch,
    commit,
    actor,
    themeName,
    themeId,
    previewUrl,
    editorUrl,
    version,
    deploymentTime,
    error,
    workflowUrl,
  } = params;

  // Determine emoji and color based on status
  const emoji = success ? '✅' : '❌';
  const color = success ? 'good' : 'danger';
  const statusText = success ? 'Success' : 'Failed';

  // Mode-specific title
  const titles = {
    staging: 'Staging Deployment',
    production: 'Production Deployment',
    'sync-live': 'Live Theme Sync',
  };
  const title = titles[mode] || 'Theme Deployment';

  // Build fields
  const fields = [
    {
      title: 'Status',
      value: `${emoji} ${statusText}`,
      short: true,
    },
    {
      title: 'Repository',
      value: `<https://github.com/${repository}|${repository}>`,
      short: true,
    },
    {
      title: 'Branch',
      value: branch,
      short: true,
    },
    {
      title: 'Commit',
      value: commit,
      short: true,
    },
    {
      title: 'Triggered By',
      value: actor,
      short: true,
    },
  ];

  // Add success-specific fields
  if (success) {
    if (themeName) {
      fields.push({
        title: 'Theme',
        value: `${themeName} (ID: ${themeId})`,
        short: true,
      });
    }

    if (version) {
      fields.push({
        title: 'Version',
        value: version,
        short: true,
      });
    }

    if (deploymentTime) {
      fields.push({
        title: 'Duration',
        value: `${deploymentTime}s`,
        short: true,
      });
    }
  } else if (error) {
    fields.push({
      title: 'Error',
      value: error,
      short: false,
    });
  }

  // Build actions (buttons)
  const actions = [];

  if (previewUrl) {
    actions.push({
      type: 'button',
      text: '🔍 Preview Theme',
      url: previewUrl,
    });
  }

  if (editorUrl) {
    actions.push({
      type: 'button',
      text: '✏️ Theme Editor',
      url: editorUrl,
    });
  }

  if (workflowUrl) {
    actions.push({
      type: 'button',
      text: '📋 View Workflow',
      url: workflowUrl,
    });
  }

  // Build the complete message
  const attachment = {
    color,
    title: `${emoji} ${title} ${statusText}`,
    fields,
    footer: 'Shopify Theme Deploy Action',
    footer_icon:
      'https://cdn.shopify.com/shopifycloud/brochure/assets/brand-assets/shopify-logo-primary-logo-456baa801ee66a0a435671082365958316831c9960c480451dd0330bcdae304f.svg',
    ts: Math.floor(Date.now() / 1000),
  };

  // Add actions if any
  if (actions.length > 0) {
    attachment.actions = actions;
  }

  return {
    attachments: [attachment],
  };
}

/**
 * Build simple text notification
 * @param {string} message - Message text
 * @returns {Object} Simple Slack message
 */
function buildSimpleMessage(message) {
  return {
    text: message,
  };
}

module.exports = {
  sendSlackNotification,
  buildSlackMessage,
  buildSimpleMessage,
};
