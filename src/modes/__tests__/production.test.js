// Mock all dependencies first before requiring
jest.mock('@actions/core');
jest.mock('../../utils/shopify-cli');
jest.mock('../../utils/backup');
jest.mock('../../utils/build');
jest.mock('../../utils/slack');
jest.mock('../../utils/versioning');

const core = require('@actions/core');
const { getLiveTheme, getThemeById, pushThemeFiles } = require('../../utils/shopify-cli');
const { createBackup, cleanupBackups, ensureThemeCapacity } = require('../../utils/backup');
const { buildAssets } = require('../../utils/build');
const { sendSlackNotification } = require('../../utils/slack');
const { renameThemeWithVersion } = require('../../utils/versioning');
const { productionDeploy } = require('../production');

describe('production', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    core.info = jest.fn();
    core.warning = jest.fn();
    core.error = jest.fn();
    core.startGroup = jest.fn();
    core.endGroup = jest.fn();
    core.setOutput = jest.fn();
    core.setFailed = jest.fn();
  });

  describe('productionDeploy', () => {
    const mockConfig = {
      mode: 'production',
      store: 'test-store',
      dryRun: false,
      backup: {
        enabled: true,
        prefix: 'BACKUP_',
        retention: 3,
        timezone: 'UTC',
      },
      versioning: {
        enabled: true,
        strategy: 'patch',
      },
      deploy: {
        ignoreJsonOnProd: true,
        allowLivePush: true,
      },
      push: {
        nodelete: false,
        extraIgnore: [],
      },
      build: {
        enabled: false,
      },
      secrets: {
        themeToken: 'test-token',
        productionThemeId: '123456',
        slackWebhookUrl: 'https://hooks.slack.com/test',
      },
    };

    it('should handle dry run mode', async () => {
      const dryRunConfig = { ...mockConfig, dryRun: true };

      const result = await productionDeploy(dryRunConfig);

      expect(result).toEqual({
        themeId: 'dry-run-production-id',
        themeName: 'PRODUCTION [0.0.1]',
        version: '0.0.1',
        previewUrl: 'https://test-store',
        editorUrl: 'https://test-store/admin/themes/dry-run',
      });

      expect(core.info).toHaveBeenCalledWith('[DRY RUN] Would perform production deployment with:');
      expect(createBackup).not.toHaveBeenCalled();
      expect(pushThemeFiles).not.toHaveBeenCalled();
    });

    it('should perform production deployment with backup', async () => {
      const mockLiveTheme = { id: 789012, name: 'Live Theme' };
      const mockProductionTheme = { id: 123456, name: 'PRODUCTION [1.0.0]' };
      const mockBackupTheme = { id: 999999, name: 'BACKUP_01-01-24-12:00' };

      getLiveTheme.mockResolvedValue(mockLiveTheme);
      getThemeById.mockResolvedValue(mockProductionTheme);
      createBackup.mockResolvedValue(mockBackupTheme);
      cleanupBackups.mockResolvedValue({ deleted: [], remaining: [] });
      ensureThemeCapacity.mockResolvedValue();
      pushThemeFiles.mockResolvedValue({ uploadedFiles: 10 });
      renameThemeWithVersion.mockResolvedValue({
        version: '1.0.1',
        name: 'PRODUCTION [1.0.1]',
      });
      sendSlackNotification.mockResolvedValue();

      const result = await productionDeploy(mockConfig);

      expect(ensureThemeCapacity).toHaveBeenCalled();
      expect(createBackup).toHaveBeenCalled();
      expect(cleanupBackups).toHaveBeenCalled();
      expect(pushThemeFiles).toHaveBeenCalledTimes(2); // Phase A and Phase B
      expect(renameThemeWithVersion).toHaveBeenCalled();
      expect(sendSlackNotification).toHaveBeenCalled();

      expect(result).toMatchObject({
        themeId: '123456',
        themeName: 'PRODUCTION [1.0.1]',
        version: '1.0.1',
        backupId: mockBackupTheme.id,
        backupName: mockBackupTheme.name,
      });
    });

    it('should fallback to live theme when production theme ID not set', async () => {
      const configNoProductionId = {
        ...mockConfig,
        secrets: { ...mockConfig.secrets, productionThemeId: null },
      };

      const mockLiveTheme = { id: 789012, name: 'Live Theme' };
      getLiveTheme.mockResolvedValue(mockLiveTheme);
      createBackup.mockResolvedValue({ id: 999999 });
      cleanupBackups.mockResolvedValue({ deleted: [], remaining: [] });
      ensureThemeCapacity.mockResolvedValue();
      pushThemeFiles.mockResolvedValue({ uploadedFiles: 10 });
      renameThemeWithVersion.mockResolvedValue({
        version: '1.0.0',
        name: 'Live Theme [1.0.0]',
      });

      const result = await productionDeploy(configNoProductionId);

      expect(getLiveTheme).toHaveBeenCalled();
      expect(result.themeId).toBe('789012');
    });

    it('should handle deployment without backup', async () => {
      const configNoBackup = {
        ...mockConfig,
        backup: { ...mockConfig.backup, enabled: false },
      };

      const mockProductionTheme = { id: 123456, name: 'PRODUCTION' };
      getThemeById.mockResolvedValue(mockProductionTheme);
      pushThemeFiles.mockResolvedValue({ uploadedFiles: 10 });
      renameThemeWithVersion.mockResolvedValue({
        version: '1.0.0',
        name: 'PRODUCTION [1.0.0]',
      });

      const result = await productionDeploy(configNoBackup);

      expect(createBackup).not.toHaveBeenCalled();
      expect(cleanupBackups).not.toHaveBeenCalled();
      expect(pushThemeFiles).toHaveBeenCalled();
      expect(result.backupId).toBeUndefined();
      expect(result.backupName).toBeUndefined();
    });

    it('should handle deployment without versioning', async () => {
      const configNoVersioning = {
        ...mockConfig,
        versioning: { ...mockConfig.versioning, enabled: false },
      };

      const mockProductionTheme = { id: 123456, name: 'PRODUCTION' };
      getThemeById.mockResolvedValue(mockProductionTheme);
      createBackup.mockResolvedValue({ id: 999999 });
      cleanupBackups.mockResolvedValue({ deleted: [], remaining: [] });
      ensureThemeCapacity.mockResolvedValue();
      pushThemeFiles.mockResolvedValue({ uploadedFiles: 10 });

      const result = await productionDeploy(configNoVersioning);

      expect(renameThemeWithVersion).not.toHaveBeenCalled();
      expect(result.version).toBeNull();
      expect(result.themeName).toBe('PRODUCTION');
    });

    it('should handle build step when enabled', async () => {
      const configWithBuild = {
        ...mockConfig,
        build: {
          enabled: true,
          packageManager: 'npm',
          command: 'npm run build',
        },
      };

      const mockProductionTheme = { id: 123456, name: 'PRODUCTION' };
      getThemeById.mockResolvedValue(mockProductionTheme);
      buildAssets.mockResolvedValue();
      createBackup.mockResolvedValue({ id: 999999 });
      cleanupBackups.mockResolvedValue({ deleted: [], remaining: [] });
      ensureThemeCapacity.mockResolvedValue();
      pushThemeFiles.mockResolvedValue({ uploadedFiles: 10 });
      renameThemeWithVersion.mockResolvedValue({
        version: '1.0.0',
        name: 'PRODUCTION [1.0.0]',
      });

      await productionDeploy(configWithBuild);

      expect(buildAssets).toHaveBeenCalledWith(configWithBuild.build);
    });

    it('should handle deployment errors gracefully', async () => {
      const error = new Error('Theme not found');
      getThemeById.mockRejectedValue(error);

      await expect(productionDeploy(mockConfig)).rejects.toThrow('Theme not found');

      expect(sendSlackNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Theme not found',
        })
      );
    });

    it('should respect ignoreJsonOnProd setting for Phase A', async () => {
      const mockProductionTheme = { id: 123456, name: 'PRODUCTION' };
      getThemeById.mockResolvedValue(mockProductionTheme);
      createBackup.mockResolvedValue({ id: 999999 });
      cleanupBackups.mockResolvedValue({ deleted: [], remaining: [] });
      ensureThemeCapacity.mockResolvedValue();
      pushThemeFiles.mockResolvedValue({ uploadedFiles: 10 });
      renameThemeWithVersion.mockResolvedValue({
        version: '1.0.0',
        name: 'PRODUCTION [1.0.0]',
      });

      await productionDeploy(mockConfig);

      // First call should have ignore patterns for JSON files
      expect(pushThemeFiles).toHaveBeenNthCalledWith(
        1,
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          ignore: expect.arrayContaining([
            'templates/*.json',
            'sections/*.json',
            'config/settings_data.json',
          ]),
        })
      );

      // Second call should only push locales/en.default.json and locales/en.default.schema.json
      expect(pushThemeFiles).toHaveBeenNthCalledWith(
        2,
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          only: ['locales/en.default.json', 'locales/en.default.schema.json'],
        })
      );
    });

    it('should prevent live push when allowLivePush is false', async () => {
      const configNoLivePush = {
        ...mockConfig,
        deploy: { ...mockConfig.deploy, allowLivePush: false },
        secrets: { ...mockConfig.secrets, productionThemeId: null },
      };

      const mockLiveTheme = { id: 789012, name: 'Live Theme', role: 'main' };
      getLiveTheme.mockResolvedValue(mockLiveTheme);

      await expect(productionDeploy(configNoLivePush)).rejects.toThrow(
        'Attempting to push to live theme but deploy.allow_live_push is false'
      );
    });

    it('should skip slack notification when webhook not configured', async () => {
      const configNoSlack = {
        ...mockConfig,
        secrets: { ...mockConfig.secrets, slackWebhookUrl: null },
      };

      const mockProductionTheme = { id: 123456, name: 'PRODUCTION' };
      getThemeById.mockResolvedValue(mockProductionTheme);
      createBackup.mockResolvedValue({ id: 999999 });
      cleanupBackups.mockResolvedValue({ deleted: [], remaining: [] });
      ensureThemeCapacity.mockResolvedValue();
      pushThemeFiles.mockResolvedValue({ uploadedFiles: 10 });
      renameThemeWithVersion.mockResolvedValue({
        version: '1.0.0',
        name: 'PRODUCTION [1.0.0]',
      });

      await productionDeploy(configNoSlack);

      expect(sendSlackNotification).not.toHaveBeenCalled();
    });
  });
});
