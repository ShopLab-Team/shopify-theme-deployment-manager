const core = require('@actions/core');
const github = require('@actions/github');
const { getLatestReleaseVersion, extractVersionFromTag } = require('../github-release');

// Mock dependencies
jest.mock('@actions/core');
jest.mock('@actions/github');

describe('github-release', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Setup default GitHub context
    github.context = {
      repo: {
        owner: 'test-owner',
        repo: 'test-repo',
      },
    };
  });

  describe('getLatestReleaseVersion', () => {
    it('should get version from latest release', async () => {
      const mockOctokit = {
        rest: {
          repos: {
            getLatestRelease: jest.fn().mockResolvedValue({
              data: {
                tag_name: 'v1.2.3',
                name: 'Release 1.2.3',
              },
            }),
          },
        },
      };

      github.getOctokit = jest.fn().mockReturnValue(mockOctokit);

      const version = await getLatestReleaseVersion('test-token');

      expect(version).toBe('1.2.3');
      expect(mockOctokit.rest.repos.getLatestRelease).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
      });
    });

    it('should handle release tag without v prefix', async () => {
      const mockOctokit = {
        rest: {
          repos: {
            getLatestRelease: jest.fn().mockResolvedValue({
              data: {
                tag_name: '2.5.10',
              },
            }),
          },
        },
      };

      github.getOctokit = jest.fn().mockReturnValue(mockOctokit);

      const version = await getLatestReleaseVersion('test-token');

      expect(version).toBe('2.5.10');
    });

    it('should return null if no releases exist', async () => {
      const mockOctokit = {
        rest: {
          repos: {
            getLatestRelease: jest.fn().mockRejectedValue({
              status: 404,
              message: 'Not Found',
            }),
          },
        },
      };

      github.getOctokit = jest.fn().mockReturnValue(mockOctokit);

      const version = await getLatestReleaseVersion('test-token');

      expect(version).toBeNull();
      expect(core.info).toHaveBeenCalledWith('No releases found in repository');
    });

    it('should return null if token not provided', async () => {
      const version = await getLatestReleaseVersion(null);

      expect(version).toBeNull();
      expect(core.warning).toHaveBeenCalledWith(
        'GitHub token not available, cannot fetch release version'
      );
    });

    it('should handle API errors gracefully', async () => {
      const mockOctokit = {
        rest: {
          repos: {
            getLatestRelease: jest.fn().mockRejectedValue(new Error('API Error')),
          },
        },
      };

      github.getOctokit = jest.fn().mockReturnValue(mockOctokit);

      const version = await getLatestReleaseVersion('test-token');

      expect(version).toBeNull();
      expect(core.warning).toHaveBeenCalledWith('Failed to fetch latest release: API Error');
    });
  });

  describe('extractVersionFromTag', () => {
    it('should extract version from tag with v prefix', () => {
      expect(extractVersionFromTag('v1.2.3')).toBe('1.2.3');
      expect(extractVersionFromTag('v10.99.88')).toBe('10.99.88');
    });

    it('should handle tag without v prefix', () => {
      expect(extractVersionFromTag('1.2.3')).toBe('1.2.3');
      expect(extractVersionFromTag('2.5.10')).toBe('2.5.10');
    });

    it('should return null for invalid version tags', () => {
      expect(extractVersionFromTag('v1.2')).toBeNull();
      expect(extractVersionFromTag('release-2024')).toBeNull();
      expect(extractVersionFromTag('invalid')).toBeNull();
      expect(extractVersionFromTag('')).toBeNull();
      expect(extractVersionFromTag(null)).toBeNull();
    });

    it('should validate version format', () => {
      expect(extractVersionFromTag('v0.0.0')).toBe('0.0.0');
      expect(extractVersionFromTag('v99.99.99')).toBe('99.99.99');
    });
  });
});
