const exec = require('@actions/exec');
const core = require('@actions/core');
const {
  getShopifyCLIVersion,
  validateThemeToken,
  listThemes,
  getLiveTheme,
  getThemeById,
  ensureThemeExists,
  pullThemeFiles,
  pushThemeFiles,
} = require('../shopify-cli');

// Mock dependencies
jest.mock('@actions/exec');
jest.mock('@actions/core');

describe('shopify-cli', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    core.info = jest.fn();
    core.warning = jest.fn();
    core.error = jest.fn();
  });

  describe('getShopifyCLIVersion', () => {
    it('should return version string', async () => {
      const mockVersion = '3.50.0';
      exec.exec.mockImplementation((cmd, args, options) => {
        if (options && options.listeners && options.listeners.stdout) {
          options.listeners.stdout(Buffer.from(mockVersion));
        }
        return Promise.resolve(0);
      });

      const version = await getShopifyCLIVersion();
      expect(version).toBe(mockVersion);
      expect(exec.exec).toHaveBeenCalledWith('shopify', ['version'], expect.any(Object));
    });

    it('should throw error if CLI not found', async () => {
      exec.exec.mockRejectedValue(new Error('Command not found'));

      await expect(getShopifyCLIVersion()).rejects.toThrow('Shopify CLI not found');
    });
  });

  describe('validateThemeToken', () => {
    it('should validate token successfully', async () => {
      exec.exec.mockResolvedValue(0);

      const result = await validateThemeToken('test-token', 'test-store');
      expect(result).toBe(true);
      expect(exec.exec).toHaveBeenCalledWith(
        'shopify',
        ['theme', 'list', '--store', 'test-store.myshopify.com', '--json'],
        expect.objectContaining({
          env: expect.objectContaining({
            SHOPIFY_CLI_THEME_TOKEN: 'test-token',
            SHOPIFY_FLAG_STORE: 'test-store.myshopify.com',
          }),
        })
      );
    });

    it('should throw error if token is missing', async () => {
      await expect(validateThemeToken('', 'test-store')).rejects.toThrow(
        'SHOPIFY_CLI_THEME_TOKEN is not set'
      );
    });

    it('should throw error if token is invalid', async () => {
      exec.exec.mockRejectedValue(new Error('Unauthorized'));

      await expect(validateThemeToken('bad-token', 'test-store')).rejects.toThrow(
        'Invalid theme access token'
      );
    });
  });

  describe('listThemes', () => {
    const mockThemes = [
      { id: 123456789, name: 'Dawn', role: 'main' },
      { id: 987654321, name: 'Staging', role: 'unpublished' },
    ];

    it('should return array of themes', async () => {
      exec.exec.mockImplementation((cmd, args, options) => {
        if (options && options.listeners && options.listeners.stdout) {
          options.listeners.stdout(Buffer.from(JSON.stringify(mockThemes)));
        }
        return Promise.resolve(0);
      });

      const themes = await listThemes('test-token', 'test-store');
      expect(themes).toEqual(mockThemes);
      expect(core.info).toHaveBeenCalledWith('Found 2 themes in store test-store.myshopify.com');
    });

    it('should handle empty theme list', async () => {
      exec.exec.mockImplementation((cmd, args, options) => {
        if (options && options.listeners && options.listeners.stdout) {
          options.listeners.stdout(Buffer.from('[]'));
        }
        return Promise.resolve(0);
      });

      const themes = await listThemes('test-token', 'test-store');
      expect(themes).toEqual([]);
      expect(core.info).toHaveBeenCalledWith('Found 0 themes in store test-store.myshopify.com');
    });
  });

  describe('getLiveTheme', () => {
    it('should return live theme', async () => {
      const mockThemes = [
        { id: 123456789, name: 'Dawn', role: 'main' },
        { id: 987654321, name: 'Staging', role: 'unpublished' },
      ];

      exec.exec.mockImplementation((cmd, args, options) => {
        if (options && options.listeners && options.listeners.stdout) {
          options.listeners.stdout(Buffer.from(JSON.stringify(mockThemes)));
        }
        return Promise.resolve(0);
      });

      const liveTheme = await getLiveTheme('test-token', 'test-store');
      expect(liveTheme).toEqual(mockThemes[0]);
      expect(core.info).toHaveBeenCalledWith('Found live theme: Dawn (ID: 123456789, Role: main)');
    });

    it('should return theme with role "live"', async () => {
      const mockThemes = [
        { id: 123456789, name: 'Production', role: 'live' },
        { id: 987654321, name: 'Staging', role: 'unpublished' },
      ];

      exec.exec.mockImplementation((cmd, args, options) => {
        if (options && options.listeners && options.listeners.stdout) {
          options.listeners.stdout(Buffer.from(JSON.stringify(mockThemes)));
        }
        return Promise.resolve(0);
      });

      const liveTheme = await getLiveTheme('test-token', 'test-store');
      expect(liveTheme).toEqual(mockThemes[0]);
      expect(core.info).toHaveBeenCalledWith(
        'Found live theme: Production (ID: 123456789, Role: live)'
      );
    });

    it('should return null if no live theme', async () => {
      const mockThemes = [{ id: 987654321, name: 'Staging', role: 'unpublished' }];

      exec.exec.mockImplementation((cmd, args, options) => {
        if (options && options.listeners && options.listeners.stdout) {
          options.listeners.stdout(Buffer.from(JSON.stringify(mockThemes)));
        }
        return Promise.resolve(0);
      });

      const liveTheme = await getLiveTheme('test-token', 'test-store');
      expect(liveTheme).toBeNull();
      expect(core.warning).toHaveBeenCalledWith('No live theme found in the store');
    });
  });

  describe('getThemeById', () => {
    const mockThemes = [
      { id: 123456789, name: 'Dawn', role: 'main' },
      { id: 987654321, name: 'Staging', role: 'unpublished' },
    ];

    beforeEach(() => {
      exec.exec.mockImplementation((cmd, args, options) => {
        if (options && options.listeners && options.listeners.stdout) {
          options.listeners.stdout(Buffer.from(JSON.stringify(mockThemes)));
        }
        return Promise.resolve(0);
      });
    });

    it('should return theme by ID', async () => {
      const theme = await getThemeById('test-token', 'test-store', '987654321');
      expect(theme).toEqual(mockThemes[1]);
      expect(core.info).toHaveBeenCalledWith('Found theme: Staging (ID: 987654321)');
    });

    it('should return null if theme not found', async () => {
      const theme = await getThemeById('test-token', 'test-store', '111111111');
      expect(theme).toBeNull();
      expect(core.warning).toHaveBeenCalledWith('Theme with ID 111111111 not found');
    });

    it('should throw error for invalid theme ID format', async () => {
      await expect(getThemeById('test-token', 'test-store', 'invalid-id')).rejects.toThrow(
        'Invalid theme ID format'
      );
    });
  });

  describe('ensureThemeExists', () => {
    const mockThemes = [{ id: 123456789, name: 'Dawn', role: 'main' }];

    it('should return theme if exists', async () => {
      exec.exec.mockImplementation((cmd, args, options) => {
        if (options && options.listeners && options.listeners.stdout) {
          options.listeners.stdout(Buffer.from(JSON.stringify(mockThemes)));
        }
        return Promise.resolve(0);
      });

      const theme = await ensureThemeExists('test-token', 'test-store', '123456789');
      expect(theme).toEqual(mockThemes[0]);
    });

    it('should throw error if theme does not exist', async () => {
      exec.exec.mockImplementation((cmd, args, options) => {
        if (options && options.listeners && options.listeners.stdout) {
          options.listeners.stdout(Buffer.from('[]'));
        }
        return Promise.resolve(0);
      });

      await expect(ensureThemeExists('test-token', 'test-store', '999999999')).rejects.toThrow(
        'Theme with ID 999999999 does not exist'
      );
    });
  });

  describe('pullThemeFiles', () => {
    it('should pull all files when no globs specified', async () => {
      exec.exec.mockResolvedValue(0);

      await pullThemeFiles('test-token', 'test-store', '123456789');

      expect(exec.exec).toHaveBeenCalledWith(
        'shopify',
        [
          'theme',
          'pull',
          '--store',
          'test-store.myshopify.com',
          '--theme',
          '123456789',
          '--path',
          '.',
        ],
        expect.objectContaining({
          env: expect.objectContaining({
            SHOPIFY_CLI_THEME_TOKEN: 'test-token',
          }),
        })
      );
    });

    it('should pull specific files with globs', async () => {
      exec.exec.mockResolvedValue(0);
      const globs = ['templates/*.json', 'config/settings_data.json'];

      await pullThemeFiles('test-token', 'test-store', '123456789', globs, './theme');

      expect(exec.exec).toHaveBeenCalledWith(
        'shopify',
        [
          'theme',
          'pull',
          '--store',
          'test-store.myshopify.com',
          '--theme',
          '123456789',
          '--path',
          './theme',
          '--only',
          'templates/*.json',
          '--only',
          'config/settings_data.json',
        ],
        expect.any(Object)
      );
    });

    it('should handle negative patterns (exclusions)', async () => {
      exec.exec.mockResolvedValue(0);
      const globs = [
        'assets/*.css',
        '!assets/tailwind-input.css',
        '!assets/compiled.css',
        'assets/*.js',
        '!assets/bundle.min.js',
      ];

      await pullThemeFiles('test-token', 'test-store', '123456789', globs, '.');

      expect(exec.exec).toHaveBeenCalledWith(
        'shopify',
        [
          'theme',
          'pull',
          '--store',
          'test-store.myshopify.com',
          '--theme',
          '123456789',
          '--path',
          '.',
          '--only',
          'assets/*.css',
          '--only',
          'assets/*.js',
          '--ignore',
          'assets/tailwind-input.css',
          '--ignore',
          'assets/compiled.css',
          '--ignore',
          'assets/bundle.min.js',
        ],
        expect.any(Object)
      );
    });

    it('should support additional ignore patterns parameter', async () => {
      exec.exec.mockResolvedValue(0);
      const globs = ['templates/*.json'];
      const ignorePatterns = ['*.map', 'node_modules/**'];

      await pullThemeFiles('test-token', 'test-store', '123456789', globs, '.', ignorePatterns);

      expect(exec.exec).toHaveBeenCalledWith(
        'shopify',
        [
          'theme',
          'pull',
          '--store',
          'test-store.myshopify.com',
          '--theme',
          '123456789',
          '--path',
          '.',
          '--only',
          'templates/*.json',
          '--ignore',
          '*.map',
          '--ignore',
          'node_modules/**',
        ],
        expect.any(Object)
      );
    });

    it('should combine negative patterns from globs with additional ignore patterns', async () => {
      exec.exec.mockResolvedValue(0);
      const globs = ['assets/*.css', '!assets/compiled.css'];
      const ignorePatterns = ['*.map'];

      await pullThemeFiles('test-token', 'test-store', '123456789', globs, '.', ignorePatterns);

      expect(exec.exec).toHaveBeenCalledWith(
        'shopify',
        [
          'theme',
          'pull',
          '--store',
          'test-store.myshopify.com',
          '--theme',
          '123456789',
          '--path',
          '.',
          '--only',
          'assets/*.css',
          '--ignore',
          'assets/compiled.css',
          '--ignore',
          '*.map',
        ],
        expect.any(Object)
      );
    });
  });

  describe('pushThemeFiles', () => {
    it('should push with default options', async () => {
      exec.exec.mockResolvedValue(0);

      await pushThemeFiles('test-token', 'test-store', '123456789');

      expect(exec.exec).toHaveBeenCalledWith(
        'shopify',
        ['theme', 'push', '--store', 'test-store.myshopify.com', '--theme', '123456789', '--json'],
        expect.any(Object)
      );
    });

    it('should push with ignore patterns', async () => {
      exec.exec.mockResolvedValue(0);
      const options = {
        ignore: ['config/settings_data.json', 'templates/*.json'],
      };

      await pushThemeFiles('test-token', 'test-store', '123456789', options);

      expect(exec.exec).toHaveBeenCalledWith(
        'shopify',
        expect.arrayContaining([
          'theme',
          'push',
          '--store',
          'test-store.myshopify.com',
          '--theme',
          '123456789',
          '--ignore',
          'config/settings_data.json',
          '--ignore',
          'templates/*.json',
          '--json',
        ]),
        expect.any(Object)
      );
    });

    it('should push with only patterns and nodelete', async () => {
      exec.exec.mockResolvedValue(0);
      const options = {
        only: ['locales/en.default.json', 'locales/en.default.schema.json'],
        nodelete: true,
        allowLive: true,
      };

      await pushThemeFiles('test-token', 'test-store', '123456789', options);

      expect(exec.exec).toHaveBeenCalledWith(
        'shopify',
        expect.arrayContaining([
          'theme',
          'push',
          '--store',
          'test-store.myshopify.com',
          '--theme',
          '123456789',
          '--only',
          'locales/en.default.json',
          '--only',
          'locales/en.default.schema.json',
          '--nodelete',
          '--allow-live',
          '--json',
        ]),
        expect.any(Object)
      );
    });
  });
});
