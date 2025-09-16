const axios = require('axios');
const github = require('@actions/github');
const core = require('@actions/core');
const { sendSlackNotification, buildSlackMessage } = require('../slack');

// Mock dependencies
jest.mock('axios');
jest.mock('@actions/github', () => ({
  context: {
    repo: { owner: 'test-org', repo: 'test-repo' },
    ref: 'refs/heads/main',
    sha: 'abc123def456789',
    actor: 'test-user',
    serverUrl: 'https://github.com',
    runId: '123456789',
  },
}));
jest.mock('@actions/core');

describe('slack', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    core.info = jest.fn();
    core.warning = jest.fn();
    axios.post.mockResolvedValue({ status: 200 });
  });

  describe('sendSlackNotification', () => {
    it('should send successful staging notification', async () => {
      const options = {
        webhookUrl: 'https://hooks.slack.com/test',
        mode: 'staging',
        success: true,
        themeName: 'STAGING',
        themeId: '123456',
        previewUrl: 'https://test.myshopify.com?preview_theme_id=123456',
        editorUrl: 'https://test.myshopify.com/admin/themes/123456/editor',
        deploymentTime: 45,
      };

      await sendSlackNotification(options);

      expect(axios.post).toHaveBeenCalledWith(
        'https://hooks.slack.com/test',
        expect.objectContaining({
          attachments: expect.arrayContaining([
            expect.objectContaining({
              color: 'good',
              title: expect.stringContaining('Staging Deployment Success'),
              fields: expect.arrayContaining([
                expect.objectContaining({ title: 'Status', value: '✅ Success' }),
                expect.objectContaining({ title: 'Theme', value: 'STAGING (ID: 123456)' }),
                expect.objectContaining({ title: 'Duration', value: '45s' }),
              ]),
            }),
          ]),
        }),
        expect.objectContaining({
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000,
        })
      );

      expect(core.info).toHaveBeenCalledWith('✅ Slack notification sent successfully');
    });

    it('should send failed production notification', async () => {
      const options = {
        webhookUrl: 'https://hooks.slack.com/test',
        mode: 'production',
        success: false,
        error: 'Theme not found',
      };

      await sendSlackNotification(options);

      expect(axios.post).toHaveBeenCalledWith(
        'https://hooks.slack.com/test',
        expect.objectContaining({
          attachments: expect.arrayContaining([
            expect.objectContaining({
              color: 'danger',
              title: expect.stringContaining('Production Deployment Failed'),
              fields: expect.arrayContaining([
                expect.objectContaining({ title: 'Status', value: '❌ Failed' }),
                expect.objectContaining({ title: 'Error', value: 'Theme not found' }),
              ]),
            }),
          ]),
        }),
        expect.any(Object)
      );
    });

    it('should handle missing webhook URL', async () => {
      const options = {
        mode: 'staging',
        success: true,
      };

      await sendSlackNotification(options);

      expect(axios.post).not.toHaveBeenCalled();
      expect(core.warning).toHaveBeenCalledWith(
        'Slack webhook URL not configured, skipping notification'
      );
    });

    it('should handle Slack API errors gracefully', async () => {
      axios.post.mockRejectedValue(new Error('Network error'));

      const options = {
        webhookUrl: 'https://hooks.slack.com/test',
        mode: 'staging',
        success: true,
      };

      await sendSlackNotification(options);

      expect(core.warning).toHaveBeenCalledWith('Failed to send Slack notification: Network error');
    });

    it('should include version in production notifications', async () => {
      const options = {
        webhookUrl: 'https://hooks.slack.com/test',
        mode: 'production',
        success: true,
        themeName: 'PRODUCTION [1.2.3]',
        themeId: '789012',
        version: '1.2.3',
        deploymentTime: 120,
      };

      await sendSlackNotification(options);

      expect(axios.post).toHaveBeenCalledWith(
        'https://hooks.slack.com/test',
        expect.objectContaining({
          attachments: expect.arrayContaining([
            expect.objectContaining({
              fields: expect.arrayContaining([
                expect.objectContaining({ title: 'Version', value: '1.2.3' }),
              ]),
            }),
          ]),
        }),
        expect.any(Object)
      );
    });
  });

  describe('buildSlackMessage', () => {
    it('should build message with all fields', () => {
      const params = {
        mode: 'staging',
        success: true,
        repository: 'test-org/test-repo',
        branch: 'staging',
        commit: 'abc123d',
        actor: 'test-user',
        themeName: 'STAGING',
        themeId: '123456',
        previewUrl: 'https://test.myshopify.com?preview_theme_id=123456',
        editorUrl: 'https://test.myshopify.com/admin/themes/123456/editor',
        deploymentTime: 45,
        workflowUrl: 'https://github.com/test-org/test-repo/actions/runs/123456789',
      };

      const message = buildSlackMessage(params);

      expect(message.attachments).toHaveLength(1);
      expect(message.attachments[0]).toMatchObject({
        color: 'good',
        title: '✅ Staging Deployment Success',
        footer: 'Shopify Theme Deploy Action',
        fields: expect.arrayContaining([
          { title: 'Status', value: '✅ Success', short: true },
          { title: 'Branch', value: 'staging', short: true },
          { title: 'Theme', value: 'STAGING (ID: 123456)', short: true },
          { title: 'Duration', value: '45s', short: true },
        ]),
      });

      expect(message.attachments[0].actions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ text: '🔍 Preview Theme', url: params.previewUrl }),
          expect.objectContaining({ text: '✏️ Theme Editor', url: params.editorUrl }),
          expect.objectContaining({ text: '📋 View Workflow', url: params.workflowUrl }),
        ])
      );
    });

    it('should build sync-live mode message', () => {
      const params = {
        mode: 'sync-live',
        success: true,
        repository: 'test-org/test-repo',
        branch: 'remote_changes',
        commit: 'def456',
        actor: 'github-actions',
        workflowUrl: 'https://github.com/test-org/test-repo/actions/runs/987654321',
      };

      const message = buildSlackMessage(params);

      expect(message.attachments[0].title).toBe('✅ Live Theme Sync Success');
    });

    it('should handle missing optional fields', () => {
      const params = {
        mode: 'staging',
        success: false,
        repository: 'test-org/test-repo',
        branch: 'main',
        commit: 'abc123',
        actor: 'test-user',
        error: 'Build failed',
      };

      const message = buildSlackMessage(params);

      expect(message.attachments[0].color).toBe('danger');
      expect(message.attachments[0].fields).toContainEqual({
        title: 'Error',
        value: 'Build failed',
        short: false,
      });
      if (message.attachments[0].actions) {
        expect(message.attachments[0].actions).toEqual(
          expect.arrayContaining([expect.objectContaining({ text: '📋 View Workflow' })])
        );
      }
    });
  });
});
