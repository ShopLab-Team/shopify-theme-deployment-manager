const core = require('@actions/core');
const axios = require('axios');
const github = require('@actions/github');

/**
 * Send MS Teams notification
 * @param {Object} options - Notification options
 * @returns {Promise<void>}
 */
async function sendMSTeamsNotification(options) {
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
      core.warning('MS Teams webhook URL not configured, skipping notification');
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
    const message = buildMSTeamsMessage({
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

    // Send to MS Teams
    const response = await axios.post(webhookUrl, message, {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });

    if (response.status === 200) {
      core.info('✅ MS Teams notification sent successfully');
    } else {
      core.warning(`MS Teams notification returned status: ${response.status}`);
    }
  } catch (error) {
    // Don't fail the workflow if MS Teams notification fails
    core.warning(`Failed to send MS Teams notification: ${error.message}`);
  }
}

/**
 * Build MS Teams message payload (Adaptive Card format)
 * @param {Object} params - Message parameters
 * @returns {Object} MS Teams message payload
 */
function buildMSTeamsMessage(params) {
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

  // Determine emoji and status text based on success
  const emoji = success ? '✅' : '❌';
  const statusText = success ? 'Success' : 'Failed';

  // Mode-specific title
  const titles = {
    staging: 'Staging Deployment',
    production: 'Production Deployment',
    'sync-live': 'Live Theme Sync',
  };
  const title = titles[mode] || 'Theme Deployment';

  // Build facts (key-value pairs)
  const facts = [
    {
      title: 'Status',
      value: `${emoji} ${statusText}`,
    },
    {
      title: 'Repository',
      value: repository,
    },
    {
      title: 'Branch',
      value: branch,
    },
    {
      title: 'Commit',
      value: commit,
    },
    {
      title: 'Triggered By',
      value: actor,
    },
  ];

  // Add success-specific facts
  if (success) {
    if (themeName) {
      facts.push({
        title: 'Theme',
        value: `${themeName} (ID: ${themeId})`,
      });
    }

    if (version) {
      facts.push({
        title: 'Version',
        value: version,
      });
    }

    if (deploymentTime) {
      facts.push({
        title: 'Duration',
        value: `${deploymentTime}s`,
      });
    }
  } else if (error) {
    facts.push({
      title: 'Error',
      value: error,
    });
  }

  // Build actions (buttons)
  const actions = [];

  if (previewUrl) {
    actions.push({
      type: 'Action.OpenUrl',
      title: '🔍 Preview Theme',
      url: previewUrl,
    });
  }

  if (editorUrl) {
    actions.push({
      type: 'Action.OpenUrl',
      title: '✏️ Theme Editor',
      url: editorUrl,
    });
  }

  if (workflowUrl) {
    actions.push({
      type: 'Action.OpenUrl',
      title: '📋 View Workflow',
      url: workflowUrl,
    });
  }

  // Build Adaptive Card
  return {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: {
          type: 'AdaptiveCard',
          body: [
            {
              type: 'TextBlock',
              size: 'Large',
              weight: 'Bolder',
              text: `${emoji} ${title}`,
              wrap: true,
            },
            {
              type: 'FactSet',
              facts: facts,
            },
          ],
          actions: actions.length > 0 ? actions : undefined,
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          version: '1.4',
          msteams: {
            width: 'Full',
          },
        },
      },
    ],
  };
}

module.exports = {
  sendMSTeamsNotification,
  buildMSTeamsMessage,
};
