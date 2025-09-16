const core = require('@actions/core');
const exec = require('@actions/exec');
const github = require('@actions/github');

/**
 * Configure Git user for commits
 * @returns {Promise<void>}
 */
async function configureGitUser() {
  const name = 'github-actions[bot]';
  const email = 'github-actions[bot]@users.noreply.github.com';
  await exec.exec('git', ['config', 'user.name', name]);
  await exec.exec('git', ['config', 'user.email', email]);
  core.info(`Configured git user as ${name}`);
}

/**
 * Create a pull request
 * @param {Object} options - PR options
 * @returns {Promise<Object>} Created PR
 */
async function createPullRequest(options) {
  const { token, branch, baseBranch, title, body } = options;

  // Validate required parameters
  if (!token) throw new Error('GitHub token is required for creating PR');
  if (!branch) throw new Error('Branch name is required for creating PR');
  if (!baseBranch) throw new Error('Base branch is required for creating PR');
  if (!title) throw new Error('PR title is required');

  try {
    const octokit = github.getOctokit(token);
    const context = github.context;

    // Check if PR already exists
    const { data: existingPRs } = await octokit.rest.pulls.list({
      owner: context.repo.owner,
      repo: context.repo.repo,
      head: `${context.repo.owner}:${branch}`,
      base: baseBranch,
      state: 'open',
    });

    if (existingPRs.length > 0) {
      core.info(`Pull request already exists: ${existingPRs[0].html_url}`);

      // Update the existing PR
      await octokit.rest.pulls.update({
        owner: context.repo.owner,
        repo: context.repo.repo,
        pull_number: existingPRs[0].number,
        title,
        body,
      });

      return existingPRs[0];
    }

    // Create new PR
    const { data: pr } = await octokit.rest.pulls.create({
      owner: context.repo.owner,
      repo: context.repo.repo,
      title,
      body,
      head: branch,
      base: baseBranch,
    });

    // Add labels if available
    try {
      await octokit.rest.issues.addLabels({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: pr.number,
        labels: ['theme-sync', 'automated'],
      });
    } catch (error) {
      core.debug(`Failed to add labels: ${error.message}`);
    }

    return pr;
  } catch (error) {
    core.error(`Failed to create pull request: ${error.message}`);
    throw error;
  }
}

/**
 * Push current branch to remote
 * @param {string} branch - Branch name
 * @returns {Promise<void>}
 */
async function pushToRemoteBranch(branch) {
  try {
    await exec.exec('git', ['push', 'origin', branch, '--force-with-lease']);
    core.info(`Branch ${branch} pushed to remote`);
  } catch (error) {
    // Try without force-with-lease if it fails
    await exec.exec('git', ['push', 'origin', branch]);
    core.info(`Branch ${branch} pushed to remote`);
  }
}

/**
 * Check if branch exists
 * @param {string} branch - Branch name
 * @returns {Promise<boolean>} True if branch exists
 */
async function branchExists(branch) {
  try {
    await exec.exec('git', ['rev-parse', '--verify', branch], {
      silent: true,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get current branch name
 * @returns {Promise<string>} Current branch name
 */
async function getCurrentBranch() {
  let branch = '';

  await exec.exec('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    listeners: {
      stdout: (data) => {
        branch = data.toString().trim();
      },
    },
    silent: true,
  });

  return branch;
}

/**
 * Check if there are uncommitted changes
 * @returns {Promise<boolean>} True if there are changes
 */
async function hasUncommittedChanges() {
  let output = '';

  await exec.exec('git', ['status', '--porcelain'], {
    listeners: {
      stdout: (data) => {
        output += data.toString();
      },
    },
    silent: true,
  });

  return output.trim().length > 0;
}

/**
 * Fetch from remote
 * @param {string} remote - Remote name (default: origin)
 * @returns {Promise<void>}
 */
async function fetchFromRemote(remote = 'origin') {
  await exec.exec('git', ['fetch', remote]);
}

/**
 * Create or checkout branch
 * @param {string} branch - Branch name
 * @param {string} baseBranch - Base branch to create from
 * @returns {Promise<void>}
 */
async function createOrCheckoutBranch(branch, baseBranch = 'main') {
  try {
    // First, check if the branch exists on remote
    let remoteExists = false;
    let output = '';
    try {
      await exec.exec('git', ['ls-remote', '--heads', 'origin', branch], {
        silent: true,
        ignoreReturnCode: true,
        listeners: {
          stdout: (data) => {
            output += data.toString();
          },
        },
      });
      // Check if the output contains the branch name
      if (output.trim() && output.includes(branch)) {
        remoteExists = true;
      }
    } catch {
      // Remote check failed, assume doesn't exist
      remoteExists = false;
    }

    if (remoteExists) {
      // Fetch and checkout the remote branch
      try {
        await exec.exec('git', ['fetch', 'origin', branch]);
        await exec.exec('git', ['checkout', '-B', branch, `origin/${branch}`]);
        core.info(`Checked out existing remote branch: ${branch}`);
        return;
      } catch (error) {
        core.warning(`Failed to fetch remote branch ${branch}, will create new: ${error.message}`);
        // Continue to create new branch
      }
    }

    // Check if branch exists locally
    let localExists = false;
    try {
      await exec.exec('git', ['rev-parse', '--verify', branch], {
        silent: true,
        ignoreReturnCode: true,
      });
      localExists = true;
    } catch {
      localExists = false;
    }

    if (localExists) {
      // Local branch exists, check it out
      await exec.exec('git', ['checkout', branch]);
      core.info(`Checked out existing local branch: ${branch}`);
    } else {
      // Create new branch from base
      await exec.exec('git', ['checkout', '-b', branch, baseBranch]);
      core.info(`Created new branch: ${branch} from ${baseBranch}`);
    }
  } catch (error) {
    // If all else fails, force create new branch
    core.warning(`Failed to checkout branch ${branch}: ${error.message}`);
    await exec.exec('git', ['checkout', '-B', branch, baseBranch]);
    core.info(`Force created branch: ${branch} from ${baseBranch}`);
  }
}

/**
 * Get list of changed files
 * @param {string} baseBranch - Base branch to compare against
 * @returns {Promise<string[]>} Array of changed file paths
 */
async function getChangedFiles(baseBranch = 'main') {
  let output = '';

  await exec.exec('git', ['diff', '--name-only', baseBranch], {
    listeners: {
      stdout: (data) => {
        output += data.toString();
      },
    },
    silent: true,
  });

  return output
    .trim()
    .split('\n')
    .filter((line) => line.length > 0);
}

module.exports = {
  configureGitUser,
  createPullRequest,
  pushToRemoteBranch,
  branchExists,
  getCurrentBranch,
  hasUncommittedChanges,
  fetchFromRemote,
  createOrCheckoutBranch,
  getChangedFiles,
};
