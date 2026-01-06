const core = require('@actions/core');
const github = require('@actions/github');

/**
 * Get the latest GitHub release tag version
 * @param {string} token - GitHub token
 * @returns {Promise<string|null>} Version from latest release tag, or null if no releases
 */
async function getLatestReleaseVersion(token) {
  try {
    if (!token) {
      core.warning('GitHub token not available, cannot fetch release version');
      return null;
    }

    const octokit = github.getOctokit(token);
    const context = github.context;

    core.info('Fetching latest GitHub release...');

    // Get the latest release
    const { data: release } = await octokit.rest.repos.getLatestRelease({
      owner: context.repo.owner,
      repo: context.repo.repo,
    });

    if (!release || !release.tag_name) {
      core.warning('No releases found in repository');
      return null;
    }

    // Extract version from tag (remove 'v' prefix if present)
    let version = release.tag_name;
    if (version.startsWith('v')) {
      version = version.substring(1);
    }

    core.info(`Latest release: ${release.tag_name} (version: ${version})`);
    return version;
  } catch (error) {
    if (error.status === 404) {
      core.info('No releases found in repository');
      return null;
    }
    core.warning(`Failed to fetch latest release: ${error.message}`);
    return null;
  }
}

/**
 * Extract version from tag name
 * @param {string} tagName - Git tag name (e.g., 'v1.2.3' or '1.2.3')
 * @returns {string|null} Version string or null
 */
function extractVersionFromTag(tagName) {
  if (!tagName) return null;

  // Remove 'v' prefix if present
  const version = tagName.startsWith('v') ? tagName.substring(1) : tagName;

  // Validate it's a version string (x.y.z format)
  const versionPattern = /^\d+\.\d+\.\d+$/;
  if (versionPattern.test(version)) {
    return version;
  }

  return null;
}

module.exports = {
  getLatestReleaseVersion,
  extractVersionFromTag,
};
