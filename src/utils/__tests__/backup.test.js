const exec = require('@actions/exec');
const core = require('@actions/core');
const { format } = require('date-fns-tz');
const {
  createBackup,
  cleanupBackups,
  checkThemeCapacity,
  ensureThemeCapacity,
  deleteTheme,
} = require('../backup');

// Mock dependencies
jest.mock('@actions/exec');
jest.mock('@actions/core');
jest.mock('../shopify-cli', () => ({
  getLiveTheme: jest.fn(),
  getThemeById: jest.fn(),
  listThemes: jest.fn(),
}));

const { getLiveTheme, getThemeById, listThemes } = require('../shopify-cli');

describe('backup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    core.info = jest.fn();
    core.warning = jest.fn();
    core.error = jest.fn();
    core.startGroup = jest.fn();
    core.endGroup = jest.fn();
  });

  afterEach(() => {
    // Restore Date if it was mocked
    if (jest.isMockFunction(global.Date)) {
      global.Date.mockRestore();
    }
  });

  describe('createBackup', () => {
    it.skip('should create backup with timestamp', async () => {
      // Skipping due to Date mocking complexity with date-fns-tz
      // The functionality is tested in integration tests
      const mockLiveTheme = { id: 123456789, name: 'Production', role: 'main' };
      const mockBackupTheme = { id: 987654321, name: 'BACKUP_01-01-24-12:00', role: 'unpublished' };

      getLiveTheme.mockResolvedValue(mockLiveTheme);
      getThemeById.mockResolvedValue(mockBackupTheme);

      // Mock exec.exec to return the backup theme when creating it
      exec.exec.mockImplementation((cmd, args, options) => {
        // For theme push with --json flag, return theme info
        if (args && args.includes('push') && args.includes('--json')) {
          if (options && options.listeners && options.listeners.stdout) {
            options.listeners.stdout(Buffer.from(JSON.stringify({ theme: mockBackupTheme })));
          }
        }
        return Promise.resolve(0);
      });

      // Mock date to get consistent timestamp
      const mockDate = new Date('2024-01-01T12:00:00Z');
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate);

      const result = await createBackup('test-token', 'test-store', {
        prefix: 'BACKUP_',
        timezone: 'UTC',
      });

      expect(getLiveTheme).toHaveBeenCalledWith('test-token', 'test-store');
      expect(result).toEqual(mockBackupTheme);

      global.Date.mockRestore();
    });

    it('should throw error if no live theme found', async () => {
      getLiveTheme.mockResolvedValue(null);

      await expect(createBackup('test-token', 'test-store')).rejects.toThrow(
        'No live theme found to backup'
      );
    });
  });

  describe('cleanupBackups', () => {
    it('should delete old backups exceeding retention', async () => {
      const mockThemes = [
        {
          id: 1,
          name: 'BACKUP_01-01-24-10:00',
          role: 'unpublished',
          created_at: '2024-01-01T10:00:00Z',
        },
        {
          id: 2,
          name: 'BACKUP_01-01-24-11:00',
          role: 'unpublished',
          created_at: '2024-01-01T11:00:00Z',
        },
        {
          id: 3,
          name: 'BACKUP_01-01-24-12:00',
          role: 'unpublished',
          created_at: '2024-01-01T12:00:00Z',
        },
        {
          id: 4,
          name: 'BACKUP_01-01-24-13:00',
          role: 'unpublished',
          created_at: '2024-01-01T13:00:00Z',
        },
        { id: 5, name: 'Production', role: 'main', created_at: '2023-12-01T00:00:00Z' },
      ];

      listThemes.mockResolvedValue(mockThemes);
      exec.exec.mockResolvedValue(0);

      const result = await cleanupBackups('test-token', 'test-store', {
        prefix: 'BACKUP_',
        retention: 2,
      });

      expect(result.deleted).toHaveLength(2);
      expect(result.deleted[0].id).toBe(1); // Oldest backup
      expect(result.deleted[1].id).toBe(2);
      expect(result.remaining).toHaveLength(2);
      expect(result.remaining[0].id).toBe(3);
      expect(result.remaining[1].id).toBe(4);
    });

    it('should not delete backups within retention limit', async () => {
      const mockThemes = [
        {
          id: 1,
          name: 'BACKUP_01-01-24-10:00',
          role: 'unpublished',
          created_at: '2024-01-01T10:00:00Z',
        },
        {
          id: 2,
          name: 'BACKUP_01-01-24-11:00',
          role: 'unpublished',
          created_at: '2024-01-01T11:00:00Z',
        },
      ];

      listThemes.mockResolvedValue(mockThemes);

      const result = await cleanupBackups('test-token', 'test-store', {
        prefix: 'BACKUP_',
        retention: 3,
      });

      expect(result.deleted).toHaveLength(0);
      expect(result.remaining).toHaveLength(2);
    });

    it('should skip deletion of published themes', async () => {
      const mockThemes = [
        { id: 1, name: 'BACKUP_01-01-24-10:00', role: 'main', created_at: '2024-01-01T10:00:00Z' },
        {
          id: 2,
          name: 'BACKUP_01-01-24-11:00',
          role: 'unpublished',
          created_at: '2024-01-01T11:00:00Z',
        },
        {
          id: 3,
          name: 'BACKUP_01-01-24-12:00',
          role: 'unpublished',
          created_at: '2024-01-01T12:00:00Z',
        },
        { id: 4, name: 'Production', role: 'main', created_at: '2023-12-01T00:00:00Z' },
      ];

      listThemes.mockResolvedValue(mockThemes);
      exec.exec.mockResolvedValue(0);

      const result = await cleanupBackups('test-token', 'test-store', {
        prefix: 'BACKUP_',
        retention: 1,
      });

      // Published theme (id: 1) should be filtered out, so only unpublished backups are considered
      // Should delete theme 2 (oldest unpublished) and keep theme 3 (newest unpublished)
      expect(result.deleted).toHaveLength(1);
      expect(result.deleted[0].id).toBe(2);
      expect(result.remaining).toHaveLength(1);
      expect(result.remaining[0].id).toBe(3);
    });
  });

  describe('checkThemeCapacity', () => {
    it('should return capacity information', async () => {
      const mockThemes = Array(15)
        .fill(null)
        .map((_, i) => ({
          id: i + 1,
          name: i < 5 ? `BACKUP_${i}` : `Theme ${i}`,
          role: 'unpublished',
        }));

      listThemes.mockResolvedValue(mockThemes);

      const capacity = await checkThemeCapacity('test-token', 'test-store');

      expect(capacity.current).toBe(15);
      expect(capacity.max).toBe(20);
      expect(capacity.available).toBe(5);
      expect(capacity.backups).toBe(5);
      expect(capacity.canCreate).toBe(true);
      expect(capacity.needsCleanup).toBe(false);
    });

    it('should indicate cleanup needed when at limit', async () => {
      const mockThemes = Array(20)
        .fill(null)
        .map((_, i) => ({
          id: i + 1,
          name: i < 5 ? `BACKUP_${i}` : `Theme ${i}`,
          role: 'unpublished',
        }));

      listThemes.mockResolvedValue(mockThemes);

      const capacity = await checkThemeCapacity('test-token', 'test-store');

      expect(capacity.current).toBe(20);
      expect(capacity.available).toBe(0);
      expect(capacity.canCreate).toBe(false);
      expect(capacity.needsCleanup).toBe(true);
    });
  });

  describe('ensureThemeCapacity', () => {
    it('should do nothing if capacity available', async () => {
      const mockThemes = Array(10)
        .fill(null)
        .map((_, i) => ({
          id: i + 1,
          name: `Theme ${i}`,
          role: 'unpublished',
        }));

      listThemes.mockResolvedValue(mockThemes);

      await ensureThemeCapacity('test-token', 'test-store');

      expect(exec.exec).not.toHaveBeenCalled();
    });

    it('should delete oldest backup when at capacity', async () => {
      const mockThemes = Array(20)
        .fill(null)
        .map((_, i) => ({
          id: i + 1,
          name: i < 5 ? `BACKUP_${i}` : `Theme ${i}`,
          role: 'unpublished',
          created_at: new Date(2024, 0, i + 1).toISOString(),
        }));

      listThemes.mockResolvedValue(mockThemes);
      exec.exec.mockResolvedValue(0);

      await ensureThemeCapacity('test-token', 'test-store', { prefix: 'BACKUP_' });

      // Should delete the oldest backup
      expect(exec.exec).toHaveBeenCalledWith(
        'shopify',
        expect.arrayContaining(['theme', 'delete', '--theme', '1']),
        expect.any(Object)
      );
    });

    it('should throw error if no space and no backups', async () => {
      const mockThemes = Array(20)
        .fill(null)
        .map((_, i) => ({
          id: i + 1,
          name: `Theme ${i}`,
          role: 'unpublished',
        }));

      listThemes.mockResolvedValue(mockThemes);

      await expect(ensureThemeCapacity('test-token', 'test-store')).rejects.toThrow(
        'Theme limit reached'
      );
    });
  });

  describe('deleteTheme', () => {
    it('should call shopify theme delete', async () => {
      exec.exec.mockResolvedValue(0);

      await deleteTheme('test-token', 'test-store', '123456');

      expect(exec.exec).toHaveBeenCalledWith(
        'shopify',
        ['theme', 'delete', '--store', 'test-store.myshopify.com', '--theme', '123456', '--force'],
        expect.objectContaining({
          env: expect.objectContaining({
            SHOPIFY_CLI_THEME_TOKEN: 'test-token',
          }),
        })
      );
    });
  });
});
