const exec = require('@actions/exec');
const core = require('@actions/core');
const {
  extractVersion,
  bumpVersion,
  renameThemeWithVersion,
  compareVersions,
  getNextVersion,
  parseVersion,
  formatVersion,
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
    it('should auto-increment patch version', () => {
      expect(bumpVersion('1.02.03')).toBe('1.02.04');
      expect(bumpVersion('0.00.09')).toBe('0.00.10');
      expect(bumpVersion('0.00.98')).toBe('0.00.99');
    });

    it('should rollover patch to minor at 100', () => {
      expect(bumpVersion('0.00.99')).toBe('0.01.00');
      expect(bumpVersion('1.05.99')).toBe('1.06.00');
    });

    it('should rollover minor to major at 100', () => {
      expect(bumpVersion('0.99.99')).toBe('1.00.00');
      expect(bumpVersion('1.99.99')).toBe('2.00.00');
    });

    it('should handle edge case at maximum', () => {
      expect(bumpVersion('99.99.99')).toBe('0.00.01');
      expect(core.warning).toHaveBeenCalledWith(
        'Version has reached maximum (99.99.99), resetting to 0.0.1'
      );
    });

    it('should return 0.00.01 for null version', () => {
      expect(bumpVersion(null)).toBe('0.00.01');
      expect(bumpVersion('')).toBe('0.00.01');
    });

    it('should handle unpadded versions', () => {
      expect(bumpVersion('1.2.3')).toBe('1.02.04');
      expect(bumpVersion('0.0.9')).toBe('0.00.10');
    });

    it('should support X.X.X format without padding', () => {
      expect(bumpVersion('1.2.3', 'X.X.X')).toBe('1.2.4');
      expect(bumpVersion('0.0.9', 'X.X.X')).toBe('0.0.10');
      expect(bumpVersion('0.0.99', 'X.X.X')).toBe('0.1.0');
      expect(bumpVersion('0.99.99', 'X.X.X')).toBe('1.0.0');
    });

    it('should support X.XX.XX format with padding', () => {
      expect(bumpVersion('1.2.3', 'X.XX.XX')).toBe('1.02.04');
      expect(bumpVersion('0.0.9', 'X.XX.XX')).toBe('0.00.10');
      expect(bumpVersion('0.0.99', 'X.XX.XX')).toBe('0.01.00');
      expect(bumpVersion('0.99.99', 'X.XX.XX')).toBe('1.00.00');
    });

    it('should return correct initial version based on format', () => {
      expect(bumpVersion(null, 'X.X.X')).toBe('0.0.1');
      expect(bumpVersion(null, 'X.X.XX')).toBe('0.0.01');
      expect(bumpVersion(null, 'X.XX.XX')).toBe('0.00.01');
      expect(bumpVersion('', 'X.X.X')).toBe('0.0.1');
      expect(bumpVersion('', 'X.X.XX')).toBe('0.0.01');
      expect(bumpVersion('', 'X.XX.XX')).toBe('0.00.01');
    });

    it('should support X.X.XX format with patch padding only', () => {
      expect(bumpVersion('1.2.3', 'X.X.XX')).toBe('1.2.04');
      expect(bumpVersion('0.0.9', 'X.X.XX')).toBe('0.0.10');
      expect(bumpVersion('0.0.99', 'X.X.XX')).toBe('0.1.00');
      expect(bumpVersion('0.99.99', 'X.X.XX')).toBe('1.0.00');
      expect(bumpVersion('10.5.98', 'X.X.XX')).toBe('10.5.99');
      expect(bumpVersion('10.5.99', 'X.X.XX')).toBe('10.6.00');
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

      const result = await renameThemeWithVersion('test-token', 'test-store', '123456');

      expect(result).toEqual({
        oldVersion: '1.0.0',
        version: '1.00.01',
        oldName: 'PRODUCTION [1.0.0]',
        name: 'PRODUCTION [1.00.01]',
        baseName: 'PRODUCTION',
      });

      expect(exec.exec).toHaveBeenCalledWith(
        'shopify',
        expect.arrayContaining(['theme', 'rename', '--name', 'PRODUCTION [1.00.01]']),
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

      const result = await renameThemeWithVersion('test-token', 'test-store', '123456');

      expect(result).toEqual({
        oldVersion: null,
        version: '0.00.01',
        oldName: 'PRODUCTION',
        name: 'PRODUCTION [0.00.01]',
        baseName: 'PRODUCTION',
      });
    });

    it('should use starting version when theme has no version', async () => {
      const mockTheme = {
        id: 123456,
        name: 'PRODUCTION',
      };

      getThemeById.mockResolvedValue(mockTheme);
      exec.exec.mockResolvedValue(0);

      // Pass starting version
      const result = await renameThemeWithVersion(
        'test-token',
        'test-store',
        '123456',
        'X.XX.XX',
        '3.00.00'
      );

      expect(result).toEqual({
        oldVersion: '3.00.00',
        version: '3.00.01',
        oldName: 'PRODUCTION',
        name: 'PRODUCTION [3.00.01]',
        baseName: 'PRODUCTION',
      });
    });

    it('should ignore starting version if theme already has version', async () => {
      const mockTheme = {
        id: 123456,
        name: 'PRODUCTION [1.05.10]',
      };

      getThemeById.mockResolvedValue(mockTheme);
      exec.exec.mockResolvedValue(0);

      // Pass starting version, but theme already has version
      const result = await renameThemeWithVersion(
        'test-token',
        'test-store',
        '123456',
        'X.XX.XX',
        '3.00.00'
      );

      // Should use theme's existing version, not starting version
      expect(result).toEqual({
        oldVersion: '1.05.10',
        version: '1.05.11',
        oldName: 'PRODUCTION [1.05.10]',
        name: 'PRODUCTION [1.05.11]',
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
      expect(compareVersions('invalid', '1.0.0')).toBe(-1); // 'invalid' becomes 0.0.0, which is less than 1.0.0
      expect(compareVersions('1.0.0', 'invalid')).toBe(1); // 1.0.0 is greater than 0.0.0
      expect(compareVersions(null, '1.0.0')).toBe(0); // null returns 0
    });
  });

  describe('getNextVersion', () => {
    it('should get next version for themed name', () => {
      const result = getNextVersion('PRODUCTION [1.02.03]');
      expect(result).toEqual({
        current: '1.02.03',
        next: '1.02.04',
        baseName: 'PRODUCTION',
        newName: 'PRODUCTION [1.02.04]',
      });
    });

    it('should handle name without version', () => {
      const result = getNextVersion('PRODUCTION');
      expect(result).toEqual({
        current: '0.00.00',
        next: '0.00.01',
        baseName: 'PRODUCTION',
        newName: 'PRODUCTION [0.00.01]',
      });
    });
  });

  describe('parseVersion', () => {
    it('should parse version string correctly', () => {
      expect(parseVersion('1.02.03')).toEqual({ major: 1, minor: 2, patch: 3 });
      expect(parseVersion('10.99.50')).toEqual({ major: 10, minor: 99, patch: 50 });
      expect(parseVersion('0.0.0')).toEqual({ major: 0, minor: 0, patch: 0 });
    });

    it('should handle null or empty versions', () => {
      expect(parseVersion(null)).toEqual({ major: 0, minor: 0, patch: 0 });
      expect(parseVersion('')).toEqual({ major: 0, minor: 0, patch: 0 });
    });

    it('should handle malformed versions', () => {
      expect(parseVersion('1.2')).toEqual({ major: 1, minor: 2, patch: 0 });
      expect(parseVersion('1')).toEqual({ major: 1, minor: 0, patch: 0 });
    });
  });

  describe('formatVersion', () => {
    it('should format version with zero padding for X.XX.XX format', () => {
      expect(formatVersion(1, 2, 3)).toBe('1.02.03');
      expect(formatVersion(0, 0, 1)).toBe('0.00.01');
      expect(formatVersion(10, 99, 88)).toBe('10.99.88');
      expect(formatVersion(1, 2, 3, 'X.XX.XX')).toBe('1.02.03');
    });

    it('should format version without padding for X.X.X format', () => {
      expect(formatVersion(1, 2, 3, 'X.X.X')).toBe('1.2.3');
      expect(formatVersion(0, 0, 0, 'X.X.X')).toBe('0.0.0');
      expect(formatVersion(99, 99, 99, 'X.X.X')).toBe('99.99.99');
      expect(formatVersion(1, 0, 10, 'X.X.X')).toBe('1.0.10');
      expect(formatVersion(10, 20, 30, 'X.X.X')).toBe('10.20.30');
    });

    it('should format version with patch padding only for X.X.XX format', () => {
      expect(formatVersion(1, 2, 3, 'X.X.XX')).toBe('1.2.03');
      expect(formatVersion(0, 0, 1, 'X.X.XX')).toBe('0.0.01');
      expect(formatVersion(10, 99, 88, 'X.X.XX')).toBe('10.99.88');
      expect(formatVersion(5, 0, 5, 'X.X.XX')).toBe('5.0.05');
      expect(formatVersion(1, 10, 99, 'X.X.XX')).toBe('1.10.99');
    });
  });
});
