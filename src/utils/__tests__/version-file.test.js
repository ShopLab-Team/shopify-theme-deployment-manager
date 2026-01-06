const core = require('@actions/core');
const fs = require('fs').promises;
const { readVersionFile, writeVersionFile, versionFileExists } = require('../version-file');

// Mock dependencies
jest.mock('@actions/core');

describe('version-file', () => {
  const testVersionFile = './test-version-temp';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(async () => {
    // Clean up test file if it exists
    try {
      await fs.unlink(testVersionFile);
    } catch {
      // Ignore if file doesn't exist
    }
  });

  describe('readVersionFile', () => {
    it('should read version from file', async () => {
      await fs.writeFile(testVersionFile, '1.2.3\n', 'utf-8');

      const version = await readVersionFile(testVersionFile);

      expect(version).toBe('1.2.3');
    });

    it('should return null if file does not exist', async () => {
      const version = await readVersionFile('./non-existent-file');

      expect(version).toBeNull();
      expect(core.debug).toHaveBeenCalledWith('Version file not found: ./non-existent-file');
    });

    it('should trim whitespace from version', async () => {
      await fs.writeFile(testVersionFile, '  1.02.03  \n', 'utf-8');

      const version = await readVersionFile(testVersionFile);

      expect(version).toBe('1.02.03');
    });
  });

  describe('writeVersionFile', () => {
    it('should write version to file', async () => {
      await writeVersionFile('1.2.3', testVersionFile);

      const content = await fs.readFile(testVersionFile, 'utf-8');
      expect(content).toBe('1.2.3');
      expect(core.info).toHaveBeenCalledWith(`✅ Version file updated: ${testVersionFile} → 1.2.3`);
    });

    it('should overwrite existing version', async () => {
      await fs.writeFile(testVersionFile, '1.0.0', 'utf-8');

      await writeVersionFile('1.02.03', testVersionFile);

      const content = await fs.readFile(testVersionFile, 'utf-8');
      expect(content).toBe('1.02.03');
    });
  });

  describe('versionFileExists', () => {
    it('should return true if file exists', async () => {
      await fs.writeFile(testVersionFile, '1.0.0', 'utf-8');

      const exists = await versionFileExists(testVersionFile);

      expect(exists).toBe(true);
    });

    it('should return false if file does not exist', async () => {
      const exists = await versionFileExists('./non-existent-file');

      expect(exists).toBe(false);
    });
  });
});
