const core = require('@actions/core');
const exec = require('@actions/exec');
const { syncLive } = require('../sync-live');
const shopifyCli = require('../../utils/shopify-cli');
const slack = require('../../utils/slack');
const git = require('../../utils/git');

// Mock dependencies
jest.mock('@actions/core');
jest.mock('@actions/exec');
jest.mock('../../utils/shopify-cli');
jest.mock('../../utils/slack');
jest.mock('../../utils/git', () => ({
  configureGitUser: jest.fn(),
  getCurrentBranch: jest.fn(),
  getChangedFiles: jest.fn(),
  commitChanges: jest.fn(),
  pushChanges: jest.fn(),
  createPullRequest: jest.fn(),
  hasUncommittedChanges: jest.fn(),
  createOrCheckoutBranch: jest.fn(),
  pushToRemoteBranch: jest.fn(),
}));

describe('sync-live', () => {
  describe('syncLive', () => {
    let config;

    beforeEach(() => {
      jest.clearAllMocks();

      config = {
        mode: 'sync-live',
        store: 'test-store',
        dryRun: false,
        sync: {
          files: 'custom',
          onlyGlobs: ['templates/*.json', 'locales/*.json'],
          excludePattern: [],
          branch: 'remote_changes',
          targetBranch: 'staging',
          commitMessage: 'chore(sync): import live JSON changes',
          type: 'pr',
        },
        secrets: {
          themeToken: 'test-token',
          githubToken: 'github-token',
          slackWebhookUrl: 'https://hooks.slack.com/test',
        },
      };

      // Default mock implementations
      shopifyCli.getLiveTheme.mockResolvedValue({
        id: 123456789,
        name: 'Live Theme',
        role: 'main',
      });

      shopifyCli.pullThemeFiles.mockResolvedValue();

      git.getCurrentBranch.mockResolvedValue('main');
      git.hasUncommittedChanges.mockResolvedValue(true);
      git.getChangedFiles.mockResolvedValue(['templates/product.json', 'locales/en.default.json']);
      git.createOrCheckoutBranch.mockResolvedValue();
      git.pushToRemoteBranch.mockResolvedValue();
      git.createPullRequest.mockResolvedValue({
        html_url: 'https://github.com/owner/repo/pull/123',
        number: 123,
      });

      exec.exec.mockResolvedValue();
      slack.sendSlackNotification.mockResolvedValue();
    });

    it('should handle dry run mode', async () => {
      config.dryRun = true;

      const result = await syncLive(config);

      expect(result).toEqual({
        mode: 'sync-live',
        synced: true,
        filesSynced: ['[DRY RUN] Would sync specified files'],
        branch: 'remote_changes',
        pullRequest: '[DRY RUN] Would create PR',
      });

      expect(shopifyCli.getLiveTheme).not.toHaveBeenCalled();
      expect(shopifyCli.pullThemeFiles).not.toHaveBeenCalled();
    });

    it('should sync live theme with custom patterns and create PR', async () => {
      const result = await syncLive(config);

      expect(shopifyCli.getLiveTheme).toHaveBeenCalledWith('test-token', 'test-store');
      expect(shopifyCli.pullThemeFiles).toHaveBeenCalledWith(
        'test-token',
        'test-store',
        '123456789',
        ['templates/*.json', 'locales/*.json'],
        '.',
        []
      );

      expect(git.createOrCheckoutBranch).toHaveBeenCalledWith('remote_changes', 'main');
      expect(git.getChangedFiles).toHaveBeenCalledWith('staging'); // Should compare against target branch
      expect(exec.exec).toHaveBeenCalledWith('git', ['add', '.']);
      expect(exec.exec).toHaveBeenCalledWith('git', [
        'commit',
        '-m',
        'chore(sync): import live JSON changes',
      ]);

      expect(git.pushToRemoteBranch).toHaveBeenCalledWith('remote_changes');
      expect(git.createPullRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          token: 'github-token',
          branch: 'remote_changes',
          baseBranch: 'staging', // Now targets staging by default
        })
      );

      expect(result).toMatchObject({
        mode: 'sync-live',
        synced: true,
        filesSynced: ['templates/product.json', 'locales/en.default.json'],
        filesCount: 2,
        branch: 'remote_changes',
        pullRequest: 'https://github.com/owner/repo/pull/123',
      });
    });

    it('should handle direct push mode', async () => {
      config.sync.type = 'push';

      const result = await syncLive(config);

      expect(git.createOrCheckoutBranch).not.toHaveBeenCalled();
      expect(git.pushToRemoteBranch).toHaveBeenCalledWith('main');
      expect(git.createPullRequest).not.toHaveBeenCalled();

      expect(result).toMatchObject({
        mode: 'sync-live',
        synced: true,
        branch: 'main',
        pullRequest: null,
      });
    });

    it('should handle no changes scenario', async () => {
      git.hasUncommittedChanges.mockResolvedValue(false);

      const result = await syncLive(config);

      expect(shopifyCli.pullThemeFiles).toHaveBeenCalled();
      expect(exec.exec).toHaveBeenCalledWith('git', ['checkout', 'main']);
      expect(git.createPullRequest).not.toHaveBeenCalled();

      expect(result).toEqual({
        mode: 'sync-live',
        synced: false,
        message: 'No changes to sync',
        filesSynced: [],
      });
    });

    it('should handle missing live theme', async () => {
      shopifyCli.getLiveTheme.mockResolvedValue(null);

      await expect(syncLive(config)).rejects.toThrow('No live theme found to sync from');

      expect(slack.sendSlackNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'sync-live',
          success: false,
          error: 'No live theme found to sync from',
        })
      );
    });

    it('should skip Slack notification when webhook not configured', async () => {
      config.secrets.slackWebhookUrl = null;

      await syncLive(config);

      expect(slack.sendSlackNotification).not.toHaveBeenCalled();
    });

    it('should set GitHub action outputs', async () => {
      await syncLive(config);

      expect(core.setOutput).toHaveBeenCalledWith('synced', 'true');
      expect(core.setOutput).toHaveBeenCalledWith('files_count', '2');
      expect(core.setOutput).toHaveBeenCalledWith('branch', 'remote_changes');
      expect(core.setOutput).toHaveBeenCalledWith(
        'pull_request_url',
        'https://github.com/owner/repo/pull/123'
      );
    });

    it('should sync all files when files is all', async () => {
      config.sync.files = 'all';
      config.sync.onlyGlobs = [];
      config.sync.excludePattern = [];
      config.sync.commitMessage = 'chore(sync): import live theme changes';

      const result = await syncLive(config);

      expect(shopifyCli.getLiveTheme).toHaveBeenCalledWith('test-token', 'test-store');
      expect(shopifyCli.pullThemeFiles).toHaveBeenCalledWith(
        'test-token',
        'test-store',
        '123456789',
        [], // Empty array means sync all files
        '.',
        []
      );

      expect(result).toMatchObject({
        mode: 'sync-live',
        synced: true,
        filesSynced: ['templates/product.json', 'locales/en.default.json'],
      });
    });

    it('should sync only JSON files when files is json', async () => {
      config.sync.files = 'json';
      config.sync.onlyGlobs = [];

      const result = await syncLive(config);

      expect(shopifyCli.getLiveTheme).toHaveBeenCalledWith('test-token', 'test-store');
      expect(shopifyCli.pullThemeFiles).toHaveBeenCalledWith(
        'test-token',
        'test-store',
        '123456789',
        [
          'templates/*.json',
          'templates/**/*.json',
          'sections/*.json',
          'snippets/*.json',
          'blocks/*.json',
          'locales/*.json',
          'config/settings_data.json',
        ],
        '.',
        []
      );

      expect(result).toMatchObject({
        mode: 'sync-live',
        synced: true,
        filesSynced: ['templates/product.json', 'locales/en.default.json'],
      });
    });

    it('should handle sync errors gracefully', async () => {
      const error = new Error('Failed to pull theme files');
      shopifyCli.pullThemeFiles.mockRejectedValue(error);

      await expect(syncLive(config)).rejects.toThrow('Failed to pull theme files');

      expect(slack.sendSlackNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'sync-live',
          success: false,
          error: 'Failed to pull theme files',
        })
      );
    });

    it('should handle PR creation failure', async () => {
      const error = new Error('Failed to create PR');
      git.createPullRequest.mockRejectedValue(error);

      await expect(syncLive(config)).rejects.toThrow('Failed to create PR');
    });

    it('should use custom target branch for comparison', async () => {
      config.sync.targetBranch = 'develop';

      await syncLive(config);

      expect(git.getChangedFiles).toHaveBeenCalledWith('develop');
      expect(git.createPullRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          baseBranch: 'develop',
        })
      );
    });

    it('should handle negative patterns in custom sync globs', async () => {
      config.sync.files = 'custom';
      config.sync.onlyGlobs = [
        'assets/*.css',
        '!assets/tailwind-input.css',
        '!assets/compiled.css',
        'assets/*.js',
        '!assets/bundle.min.js',
      ];

      const result = await syncLive(config);

      expect(shopifyCli.pullThemeFiles).toHaveBeenCalledWith(
        'test-token',
        'test-store',
        '123456789',
        [
          'assets/*.css',
          '!assets/tailwind-input.css',
          '!assets/compiled.css',
          'assets/*.js',
          '!assets/bundle.min.js',
        ],
        '.',
        []
      );

      expect(result).toMatchObject({
        mode: 'sync-live',
        synced: true,
      });

      // Verify logging includes both include and exclude patterns
      expect(core.info).toHaveBeenCalledWith('Files: Custom - Using patterns');
      expect(core.info).toHaveBeenCalledWith('  Include: assets/*.css, assets/*.js');
      expect(core.info).toHaveBeenCalledWith(
        '  Exclude: assets/tailwind-input.css, assets/compiled.css, assets/bundle.min.js'
      );
    });

    it('should handle sync_exclude_pattern with sync_files: all', async () => {
      config.sync.files = 'all';
      config.sync.onlyGlobs = [];
      config.sync.excludePattern = [
        'assets/tailwind-input.css',
        'assets/compiled.css',
        'assets/*.min.js',
      ];

      const result = await syncLive(config);

      // Note: Exclusions are handled via .shopifyignore, not --ignore flags
      expect(shopifyCli.pullThemeFiles).toHaveBeenCalledWith(
        'test-token',
        'test-store',
        '123456789',
        [], // Empty array means sync all files
        '.',
        [] // Empty - exclusions handled by .shopifyignore
      );

      expect(result).toMatchObject({
        mode: 'sync-live',
        synced: true,
      });

      // Verify logging shows all files with exclusions
      expect(core.info).toHaveBeenCalledWith(
        'Files: All - Syncing all theme files with exclusions'
      );
      expect(core.info).toHaveBeenCalledWith(
        '  Exclude: assets/tailwind-input.css, assets/compiled.css, assets/*.min.js'
      );
      expect(core.info).toHaveBeenCalledWith('Created .shopifyignore with 3 exclusion patterns');
    });

    it('should handle sync_files: all without exclusions', async () => {
      config.sync.files = 'all';
      config.sync.onlyGlobs = [];
      config.sync.excludePattern = [];

      const result = await syncLive(config);

      expect(shopifyCli.pullThemeFiles).toHaveBeenCalledWith(
        'test-token',
        'test-store',
        '123456789',
        [], // Empty array means sync all files
        '.',
        [] // No exclusions
      );

      expect(result).toMatchObject({
        mode: 'sync-live',
        synced: true,
      });

      // Verify logging shows all files without exclusions
      expect(core.info).toHaveBeenCalledWith('Files: All - Syncing all theme files');
    });
  });
});
