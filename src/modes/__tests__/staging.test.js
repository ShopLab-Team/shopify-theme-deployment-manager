// Mock all dependencies first before requiring
jest.mock('@actions/core');
jest.mock('@actions/exec');
jest.mock('../../utils/shopify-cli');
jest.mock('../../utils/build');
jest.mock('../../utils/slack');

const core = require('@actions/core');
const exec = require('@actions/exec');
const {
  getLiveTheme,
  getThemeById,
  ensureThemeExists,
  pullThemeFiles,
  pushThemeFiles,
} = require('../../utils/shopify-cli');
const { buildAssets } = require('../../utils/build');
const { sendSlackNotification } = require('../../utils/slack');
const { stagingDeploy } = require('../staging');

describe('staging', () => {
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

  describe('stagingDeploy', () => {
    const mockConfig = {
      mode: 'staging',
      store: 'test-store',
      themePath: '.',
      dryRun: false,
      build: {
        enabled: true,
        packageManager: 'npm',
        command: 'npm run build',
        cwd: '.',
      },
      json: {
        pullGlobs: ['templates/*.json', 'config/settings_data.json'],
        syncOnStaging: true,
      },
      push: {
        extraIgnore: [],
        nodelete: false,
      },
      secrets: {
        themeToken: 'test-token',
        stagingThemeId: '987654',
        slackWebhookUrl: 'https://hooks.slack.com/test',
      },
    };

    it('should handle dry run mode', async () => {
      const dryRunConfig = { ...mockConfig, dryRun: true };

      const result = await stagingDeploy(dryRunConfig);

      expect(result).toEqual({
        themeId: 'dry-run-staging-id',
        themeName: 'STAGING [DRY RUN]',
        previewUrl: 'https://test-store?preview_theme_id=dry-run',
        editorUrl: 'https://test-store/admin/themes/dry-run',
      });

      expect(core.info).toHaveBeenCalledWith('Starting staging deployment...');
      expect(buildAssets).not.toHaveBeenCalled();
      expect(pushThemeFiles).not.toHaveBeenCalled();
    });

    it('should perform staging deployment with build and JSON pull', async () => {
      const mockStagingTheme = {
        id: 987654,
        name: 'STAGING',
        preview_url: 'https://test-store.myshopify.com?preview_theme_id=987654',
      };
      const mockLiveTheme = { id: 123456, name: 'Live Theme' };

      ensureThemeExists.mockResolvedValue(mockStagingTheme);
      getLiveTheme.mockResolvedValue(mockLiveTheme);
      buildAssets.mockResolvedValue();
      pullThemeFiles.mockResolvedValue();
      pushThemeFiles.mockResolvedValue({
        uploadedFiles: 25,
        theme: mockStagingTheme,
      });
      sendSlackNotification.mockResolvedValue();

      const result = await stagingDeploy(mockConfig);

      expect(buildAssets).toHaveBeenCalledWith(mockConfig.build);
      expect(ensureThemeExists).toHaveBeenCalledWith('test-token', 'test-store', '987654');
      expect(getLiveTheme).toHaveBeenCalledWith('test-token', 'test-store');
      expect(pullThemeFiles).toHaveBeenCalledWith(
        'test-token',
        'test-store',
        '123456',
        mockConfig.json.pullGlobs,
        '.'
      );
      expect(pushThemeFiles).toHaveBeenCalledWith(
        'test-token',
        'test-store',
        '987654',
        expect.objectContaining({
          ignore: [],
          nodelete: false,
        }),
        '.'
      );
      expect(sendSlackNotification).toHaveBeenCalled();

      expect(result).toMatchObject({
        themeId: '987654',
        themeName: 'STAGING',
      });
    });

    it('should skip build when disabled', async () => {
      const configNoBuild = {
        ...mockConfig,
        build: { ...mockConfig.build, enabled: false },
      };

      const mockStagingTheme = { id: 987654, name: 'STAGING' };
      const mockLiveTheme = { id: 123456, name: 'Live Theme' };

      ensureThemeExists.mockResolvedValue(mockStagingTheme);
      getLiveTheme.mockResolvedValue(mockLiveTheme);
      pullThemeFiles.mockResolvedValue();
      pushThemeFiles.mockResolvedValue({ uploadedFiles: 20, theme: mockStagingTheme });

      await stagingDeploy(configNoBuild);

      expect(buildAssets).not.toHaveBeenCalled();
      expect(pullThemeFiles).toHaveBeenCalled();
      expect(pushThemeFiles).toHaveBeenCalled();
    });

    it('should skip JSON pull when disabled', async () => {
      const configNoPull = {
        ...mockConfig,
        json: { ...mockConfig.json, pullGlobs: [] }, // Empty globs to skip pull
      };

      const mockStagingTheme = { id: 987654, name: 'STAGING' };
      const mockLiveTheme = { id: 123456, name: 'Live Theme' };

      ensureThemeExists.mockResolvedValue(mockStagingTheme);
      getLiveTheme.mockResolvedValue(mockLiveTheme);
      buildAssets.mockResolvedValue();
      pushThemeFiles.mockResolvedValue({ uploadedFiles: 20, theme: mockStagingTheme });

      await stagingDeploy(configNoPull);

      expect(buildAssets).toHaveBeenCalled();
      expect(getLiveTheme).not.toHaveBeenCalled(); // Not called when no globs
      expect(pullThemeFiles).not.toHaveBeenCalled(); // Not called when no globs
      expect(pushThemeFiles).toHaveBeenCalled();
    });

    it('should skip JSON pull when syncOnStaging is false', async () => {
      const configNoSync = {
        ...mockConfig,
        json: { ...mockConfig.json, syncOnStaging: false },
      };

      const mockStagingTheme = { id: 987654, name: 'STAGING' };
      const mockLiveTheme = { id: 123456, name: 'Live Theme' };

      ensureThemeExists.mockResolvedValue(mockStagingTheme);
      getLiveTheme.mockResolvedValue(mockLiveTheme);
      buildAssets.mockResolvedValue();
      pushThemeFiles.mockResolvedValue({ uploadedFiles: 20, theme: mockStagingTheme });

      await stagingDeploy(configNoSync);

      expect(buildAssets).toHaveBeenCalled();
      expect(getLiveTheme).not.toHaveBeenCalled(); // Not called when syncOnStaging is false
      expect(pullThemeFiles).not.toHaveBeenCalled(); // Not called when syncOnStaging is false
      expect(pushThemeFiles).toHaveBeenCalled();
    });

    it('should handle missing staging theme ID', async () => {
      const configNoStagingId = {
        ...mockConfig,
        secrets: { ...mockConfig.secrets, stagingThemeId: null },
      };

      await expect(stagingDeploy(configNoStagingId)).rejects.toThrow(
        'STAGING_THEME_ID is required for staging deployment'
      );

      expect(buildAssets).not.toHaveBeenCalled();
      expect(pushThemeFiles).not.toHaveBeenCalled();
    });

    it('should handle theme not found error', async () => {
      ensureThemeExists.mockRejectedValue(new Error('Theme 987654 not found'));

      await expect(stagingDeploy(mockConfig)).rejects.toThrow('Theme 987654 not found');

      expect(sendSlackNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Theme 987654 not found',
        })
      );
    });

    it('should handle build failure', async () => {
      buildAssets.mockRejectedValue(new Error('Build failed'));

      await expect(stagingDeploy(mockConfig)).rejects.toThrow('Build failed');

      expect(pushThemeFiles).not.toHaveBeenCalled();
      expect(sendSlackNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Build failed',
        })
      );
    });

    it('should apply extra ignore patterns', async () => {
      const configWithIgnore = {
        ...mockConfig,
        push: {
          ...mockConfig.push,
          extraIgnore: ['assets/*.map', 'node_modules/**'],
        },
      };

      const mockStagingTheme = { id: 987654, name: 'STAGING' };
      const mockLiveTheme = { id: 123456, name: 'Live Theme' };

      ensureThemeExists.mockResolvedValue(mockStagingTheme);
      getLiveTheme.mockResolvedValue(mockLiveTheme);
      buildAssets.mockResolvedValue();
      pullThemeFiles.mockResolvedValue();
      pushThemeFiles.mockResolvedValue({ uploadedFiles: 20, theme: mockStagingTheme });

      await stagingDeploy(configWithIgnore);

      expect(pushThemeFiles).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          ignore: ['assets/*.map', 'node_modules/**'],
        }),
        '.'
      );
    });

    it('should apply nodelete option', async () => {
      const configWithNodelete = {
        ...mockConfig,
        push: {
          ...mockConfig.push,
          nodelete: true,
        },
      };

      const mockStagingTheme = { id: 987654, name: 'STAGING' };
      const mockLiveTheme = { id: 123456, name: 'Live Theme' };

      ensureThemeExists.mockResolvedValue(mockStagingTheme);
      getLiveTheme.mockResolvedValue(mockLiveTheme);
      buildAssets.mockResolvedValue();
      pullThemeFiles.mockResolvedValue();
      pushThemeFiles.mockResolvedValue({ uploadedFiles: 20, theme: mockStagingTheme });

      await stagingDeploy(configWithNodelete);

      expect(pushThemeFiles).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          nodelete: true,
        }),
        '.'
      );
    });

    it('should skip slack notification when webhook not configured', async () => {
      const configNoSlack = {
        ...mockConfig,
        secrets: { ...mockConfig.secrets, slackWebhookUrl: null },
      };

      const mockStagingTheme = { id: 987654, name: 'STAGING' };
      const mockLiveTheme = { id: 123456, name: 'Live Theme' };

      ensureThemeExists.mockResolvedValue(mockStagingTheme);
      getLiveTheme.mockResolvedValue(mockLiveTheme);
      buildAssets.mockResolvedValue();
      pullThemeFiles.mockResolvedValue();
      pushThemeFiles.mockResolvedValue({ uploadedFiles: 20, theme: mockStagingTheme });

      await stagingDeploy(configNoSlack);

      expect(sendSlackNotification).not.toHaveBeenCalled();
    });

    it('should handle empty JSON pull globs', async () => {
      const configEmptyGlobs = {
        ...mockConfig,
        json: {
          ...mockConfig.json,
          pullGlobs: [],
        },
      };

      const mockStagingTheme = { id: 987654, name: 'STAGING' };
      const mockLiveTheme = { id: 123456, name: 'Live Theme' };

      ensureThemeExists.mockResolvedValue(mockStagingTheme);
      getLiveTheme.mockResolvedValue(mockLiveTheme);
      buildAssets.mockResolvedValue();
      pushThemeFiles.mockResolvedValue({ uploadedFiles: 20, theme: mockStagingTheme });

      await stagingDeploy(configEmptyGlobs);

      // pullThemeFiles should NOT be called when globs array is empty
      expect(pullThemeFiles).not.toHaveBeenCalled();
      expect(pushThemeFiles).toHaveBeenCalled();
    });

    it('should set GitHub action outputs', async () => {
      const mockStagingTheme = {
        id: 987654,
        name: 'STAGING',
        preview_url: 'https://test-store.myshopify.com?preview_theme_id=987654',
      };
      const mockLiveTheme = { id: 123456, name: 'Live Theme' };

      ensureThemeExists.mockResolvedValue(mockStagingTheme);
      getLiveTheme.mockResolvedValue(mockLiveTheme);
      buildAssets.mockResolvedValue();
      pullThemeFiles.mockResolvedValue();
      pushThemeFiles.mockResolvedValue({
        uploadedFiles: 25,
        theme: mockStagingTheme,
      });
      sendSlackNotification.mockResolvedValue();

      await stagingDeploy(mockConfig);

      expect(core.setOutput).toHaveBeenCalledWith('theme_id', '987654');
      expect(core.setOutput).toHaveBeenCalledWith('theme_name', 'STAGING');
      expect(core.setOutput).toHaveBeenCalledWith(
        'preview_url',
        expect.stringContaining('preview_theme_id=987654')
      );
      expect(core.setOutput).toHaveBeenCalledWith(
        'editor_url',
        expect.stringContaining('/admin/themes/987654')
      );
    });

    it('should use production theme ID for JSON pull when provided', async () => {
      const configWithProdId = {
        ...mockConfig,
        secrets: {
          ...mockConfig.secrets,
          productionThemeId: '555666', // Add production theme ID
        },
      };

      const mockStagingTheme = { id: 987654, name: 'STAGING' };
      const mockProductionTheme = { id: 555666, name: 'Production Theme' };

      ensureThemeExists.mockResolvedValue(mockStagingTheme);
      getThemeById.mockResolvedValue(mockProductionTheme);
      buildAssets.mockResolvedValue();
      pullThemeFiles.mockResolvedValue();
      pushThemeFiles.mockResolvedValue({ uploadedFiles: 25, theme: mockStagingTheme });

      await stagingDeploy(configWithProdId);

      // Should call getThemeById with production theme ID
      expect(getThemeById).toHaveBeenCalledWith('test-token', 'test-store', '555666');

      // Should NOT call getLiveTheme since we have a production theme ID
      expect(getLiveTheme).not.toHaveBeenCalled();

      // Should pull from production theme
      expect(pullThemeFiles).toHaveBeenCalledWith(
        'test-token',
        'test-store',
        '555666', // Should use production theme ID as string
        ['templates/*.json', 'config/settings_data.json'],
        '.'
      );
    });

    it('should fallback to live theme when production theme ID not found', async () => {
      const configWithProdId = {
        ...mockConfig,
        secrets: {
          ...mockConfig.secrets,
          productionThemeId: '999999', // Non-existent production theme ID
        },
      };

      const mockStagingTheme = { id: 987654, name: 'STAGING' };
      const mockLiveTheme = { id: 123456, name: 'Live Theme' };

      ensureThemeExists.mockResolvedValue(mockStagingTheme);
      getThemeById.mockResolvedValue(null); // Production theme not found
      getLiveTheme.mockResolvedValue(mockLiveTheme);
      buildAssets.mockResolvedValue();
      pullThemeFiles.mockResolvedValue();
      pushThemeFiles.mockResolvedValue({ uploadedFiles: 25, theme: mockStagingTheme });

      await stagingDeploy(configWithProdId);

      // Should try to get production theme first
      expect(getThemeById).toHaveBeenCalledWith('test-token', 'test-store', '999999');

      // Should fallback to getting live theme
      expect(getLiveTheme).toHaveBeenCalledWith('test-token', 'test-store');

      // Should pull from live theme
      expect(pullThemeFiles).toHaveBeenCalledWith(
        'test-token',
        'test-store',
        '123456', // Should use live theme ID
        ['templates/*.json', 'config/settings_data.json'],
        '.'
      );
    });
  });
});
