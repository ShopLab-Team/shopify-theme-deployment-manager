const core = require('@actions/core');
const axios = require('axios');
const github = require('@actions/github');
const { sendMSTeamsNotification, buildMSTeamsMessage } = require('../msteams');

// Mock dependencies
jest.mock('@actions/core');
jest.mock('axios');
jest.mock('@actions/github', () => ({
  context: {
    repo: { owner: 'owner', repo: 'repo' },
    ref: 'refs/heads/main',
    sha: 'abc123def456',
    actor: 'testuser',
    serverUrl: 'https://github.com',
    runId: '12345',
  },
}));

describe('msteams', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    axios.post.mockResolvedValue({ status: 200 });
  });

  describe('sendMSTeamsNotification', () => {
    it('should send successful staging notification', async () => {
      await sendMSTeamsNotification({
        webhookUrl: 'https://outlook.office.com/webhook/test',
        mode: 'staging',
        success: true,
        themeName: 'STAGING',
        themeId: '123456',
        previewUrl: 'https://store.myshopify.com?preview_theme_id=123456',
        deploymentTime: 45,
      });

      expect(axios.post).toHaveBeenCalledWith(
        'https://outlook.office.com/webhook/test',
        expect.objectContaining({
          type: 'message',
          attachments: expect.arrayContaining([
            expect.objectContaining({
              contentType: 'application/vnd.microsoft.card.adaptive',
            }),
          ]),
        }),
        expect.objectContaining({
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000,
        })
      );

      expect(core.info).toHaveBeenCalledWith('✅ MS Teams notification sent successfully');
    });

    it('should send failed production notification', async () => {
      await sendMSTeamsNotification({
        webhookUrl: 'https://outlook.office.com/webhook/test',
        mode: 'production',
        success: false,
        error: 'Deployment failed: theme not found',
      });

      expect(axios.post).toHaveBeenCalled();
      const payload = axios.post.mock.calls[0][1];
      expect(payload.attachments[0].content.body[1].facts).toContainEqual(
        expect.objectContaining({
          title: 'Error',
          value: 'Deployment failed: theme not found',
        })
      );
    });

    it('should handle missing webhook URL', async () => {
      await sendMSTeamsNotification({
        webhookUrl: null,
        mode: 'staging',
        success: true,
      });

      expect(axios.post).not.toHaveBeenCalled();
      expect(core.warning).toHaveBeenCalledWith(
        'MS Teams webhook URL not configured, skipping notification'
      );
    });

    it('should handle MS Teams API errors gracefully', async () => {
      axios.post.mockRejectedValue(new Error('Network error'));

      await sendMSTeamsNotification({
        webhookUrl: 'https://outlook.office.com/webhook/test',
        mode: 'staging',
        success: true,
      });

      expect(core.warning).toHaveBeenCalledWith(
        'Failed to send MS Teams notification: Network error'
      );
    });

    it('should include version in production notifications', async () => {
      await sendMSTeamsNotification({
        webhookUrl: 'https://outlook.office.com/webhook/test',
        mode: 'production',
        success: true,
        themeName: 'PRODUCTION',
        themeId: '789012',
        version: '1.02.03',
        deploymentTime: 60,
      });

      const payload = axios.post.mock.calls[0][1];
      expect(payload.attachments[0].content.body[1].facts).toContainEqual(
        expect.objectContaining({
          title: 'Version',
          value: '1.02.03',
        })
      );
    });
  });

  describe('buildMSTeamsMessage', () => {
    it('should build message with all fields', async () => {
      const message = buildMSTeamsMessage({
        mode: 'staging',
        success: true,
        repository: 'owner/repo',
        branch: 'main',
        commit: 'abc123d',
        actor: 'testuser',
        themeName: 'STAGING',
        themeId: '123456',
        previewUrl: 'https://store.myshopify.com?preview_theme_id=123456',
        editorUrl: 'https://store.myshopify.com/admin/themes/123456/editor',
        deploymentTime: 45,
        workflowUrl: 'https://github.com/owner/repo/actions/runs/12345',
      });

      expect(message.type).toBe('message');
      expect(message.attachments).toHaveLength(1);
      expect(message.attachments[0].contentType).toBe('application/vnd.microsoft.card.adaptive');

      const content = message.attachments[0].content;
      expect(content.type).toBe('AdaptiveCard');
      expect(content.body[0].text).toContain('✅');
      expect(content.body[0].text).toContain('Staging Deployment');
      expect(content.actions).toHaveLength(3);
    });

    it('should build sync-live mode message', async () => {
      const message = buildMSTeamsMessage({
        mode: 'sync-live',
        success: true,
        repository: 'owner/repo',
        branch: 'main',
        commit: 'abc123d',
        actor: 'testuser',
        themeName: 'LIVE',
        themeId: '654321',
        workflowUrl: 'https://github.com/owner/repo/actions/runs/12345',
      });

      const content = message.attachments[0].content;
      expect(content.body[0].text).toContain('Live Theme Sync');
    });

    it('should handle missing optional fields', async () => {
      const message = buildMSTeamsMessage({
        mode: 'production',
        success: false,
        repository: 'owner/repo',
        branch: 'main',
        commit: 'abc123d',
        actor: 'testuser',
        error: 'Something went wrong',
      });

      const content = message.attachments[0].content;
      expect(content.body[0].text).toContain('❌');
      expect(content.body[1].facts).toContainEqual(
        expect.objectContaining({
          title: 'Error',
          value: 'Something went wrong',
        })
      );
    });
  });
});
