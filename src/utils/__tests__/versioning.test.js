const exec = require('@actions/exec');
const core = require('@actions/core');
const {
  extractVersion,
  bumpVersion,
  renameThemeWithVersion,
  compareVersions,
  getNextVersion,
  parseVersionStrategy,
} = require('../versioning');

// Mock dependencies
jest.mock('@actions/exec');
jest.mock('@actions/core');
jest.mock('../shopify-cli', () => ({
  getThemeById: jest.fn(),
}));

const { getThemeById } = require('../shopify-cli');

describe('versioning', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    core.info = jest.fn();
    core.warning = jest.fn();
    core.error = jest.fn();
  });

  describe('extractVersion', () => {
    it('should extract version from theme name', () => {
      const result = extractVersion('PRODUCTION [1.2.3]');
      expect(result).toEqual({
        hasVersion: true,
        version: '1.2.3',
        baseName: 'PRODUCTION',
      });
    });

    it('should handle name without version', () => {
      const result = extractVersion('PRODUCTION');
      expect(result).toEqual({
        hasVersion: false,
        version: null,
        baseName: 'PRODUCTION',
      });
    });

    it('should handle complex names with version', () => {
      const result = extractVersion('My Production Theme [10.5.2]');
      expect(result).toEqual({
        hasVersion: true,
        version: '10.5.2',
        baseName: 'My Production Theme',
      });
    });

    it('should ignore version-like text not at the end', () => {
      const result = extractVersion('[1.0.0] PRODUCTION');
      expect(result).toEqual({
        hasVersion: false,
        version: null,
        baseName: '[1.0.0] PRODUCTION',
      });
    });
  });

  describe('bumpVersion', () => {
    it('should bump patch version', () => {
      expect(bumpVersion('1.2.3', 'patch')).toBe('1.2.4');
    });

    it('should bump minor version', () => {
      expect(bumpVersion('1.2.3', 'minor')).toBe('1.3.0');
    });

    it('should bump major version', () => {
      expect(bumpVersion('1.2.3', 'major')).toBe('2.0.0');
    });

    it('should return 0.0.1 for null version', () => {
      expect(bumpVersion(null, 'patch')).toBe('0.0.1');
      expect(bumpVersion('', 'patch')).toBe('0.0.1');
    });

    it('should handle invalid version format', () => {
      expect(bumpVersion('invalid', 'patch')).toBe('0.0.1');
      expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('Invalid version format'));
    });

    it('should handle pre-release versions', () => {
      expect(bumpVersion('1.2.3-beta.1', 'patch')).toBe('1.2.3');
    });
  });

  describe('renameThemeWithVersion', () => {
    it('should rename theme with new version', async () => {
      const mockTheme = {
        id: 123456,
        name: 'PRODUCTION [1.0.0]',
      };

      getThemeById.mockResolvedValue(mockTheme);
      exec.exec.mockResolvedValue(0);

      const result = await renameThemeWithVersion('test-token', 'test-store', '123456', 'minor');

      expect(result).toEqual({
        oldVersion: '1.0.0',
        version: '1.1.0',
        oldName: 'PRODUCTION [1.0.0]',
        name: 'PRODUCTION [1.1.0]',
        baseName: 'PRODUCTION',
      });

      expect(exec.exec).toHaveBeenCalledWith(
        'shopify',
        expect.arrayContaining(['theme', 'rename', '--name', 'PRODUCTION [1.1.0]']),
        expect.any(Object)
      );
    });

    it('should add initial version if none exists', async () => {
      const mockTheme = {
        id: 123456,
        name: 'PRODUCTION',
      };

      getThemeById.mockResolvedValue(mockTheme);
      exec.exec.mockResolvedValue(0);

      const result = await renameThemeWithVersion('test-token', 'test-store', '123456', 'patch');

      expect(result).toEqual({
        oldVersion: null,
        version: '0.0.1',
        oldName: 'PRODUCTION',
        name: 'PRODUCTION [0.0.1]',
        baseName: 'PRODUCTION',
      });
    });

    it('should throw error if theme not found', async () => {
      getThemeById.mockResolvedValue(null);

      await expect(renameThemeWithVersion('test-token', 'test-store', '999999')).rejects.toThrow(
        'Theme 999999 not found'
      );
    });
  });

  describe('compareVersions', () => {
    it('should compare versions correctly', () => {
      expect(compareVersions('1.0.0', '2.0.0')).toBe(-1);
      expect(compareVersions('2.0.0', '1.0.0')).toBe(1);
      expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
      expect(compareVersions('1.2.3', '1.2.4')).toBe(-1);
      expect(compareVersions('1.3.0', '1.2.9')).toBe(1);
    });

    it('should handle invalid versions', () => {
      expect(compareVersions('invalid', '1.0.0')).toBe(0);
      expect(compareVersions('1.0.0', 'invalid')).toBe(0);
      expect(compareVersions(null, '1.0.0')).toBe(0);
    });
  });

  describe('getNextVersion', () => {
    it('should get next version for themed name', () => {
      const result = getNextVersion('PRODUCTION [1.2.3]', 'minor');
      expect(result).toEqual({
        current: '1.2.3',
        next: '1.3.0',
        baseName: 'PRODUCTION',
        newName: 'PRODUCTION [1.3.0]',
      });
    });

    it('should handle name without version', () => {
      const result = getNextVersion('PRODUCTION', 'patch');
      expect(result).toEqual({
        current: '0.0.0',
        next: '0.0.1',
        baseName: 'PRODUCTION',
        newName: 'PRODUCTION [0.0.1]',
      });
    });
  });

  describe('parseVersionStrategy', () => {
    it('should parse valid strategies', () => {
      expect(parseVersionStrategy('patch')).toBe('patch');
      expect(parseVersionStrategy('minor')).toBe('minor');
      expect(parseVersionStrategy('major')).toBe('major');
      expect(parseVersionStrategy('PATCH')).toBe('patch');
      expect(parseVersionStrategy('Minor')).toBe('minor');
    });

    it('should default to patch for invalid strategies', () => {
      expect(parseVersionStrategy('invalid')).toBe('patch');
      expect(parseVersionStrategy(null)).toBe('patch');
      expect(parseVersionStrategy('')).toBe('patch');
      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining('Invalid version strategy')
      );
    });
  });
});
