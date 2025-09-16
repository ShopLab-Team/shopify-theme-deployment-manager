const core = require('@actions/core');
const exec = require('@actions/exec');
const fs = require('fs').promises;
const path = require('path');
const { checkTheme } = require('./shopify-cli');

/**
 * Build theme assets
 * @param {Object} buildConfig - Build configuration
 * @returns {Promise<void>}
 */
async function buildAssets(buildConfig) {
  try {
    const { enabled, packageManager, command, cwd = '.' } = buildConfig;

    if (!enabled) {
      core.info('Build step disabled, skipping...');
      return;
    }

    // Validate inputs
    if (!command || typeof command !== 'string') {
      throw new Error('Build command is required when build is enabled');
    }

    core.info(`Building theme assets with ${packageManager}...`);
    core.info(`Working directory: ${cwd}`);
    core.info(`Build command: ${command}`);

    // Change to working directory if specified
    const originalCwd = process.cwd();
    if (cwd !== '.') {
      process.chdir(cwd);
      core.info(`Changed working directory to: ${process.cwd()}`);
    }

    try {
      // Enable Corepack for Yarn/PNPM if needed
      if (packageManager === 'yarn' || packageManager === 'pnpm') {
        core.info(`Enabling Corepack for ${packageManager}...`);
        await exec.exec('corepack', ['enable']);
      }

      // Check if package.json exists
      const packageJsonPath = path.join(process.cwd(), 'package.json');
      try {
        await fs.access(packageJsonPath);
      } catch {
        core.warning('No package.json found, skipping build step');
        return;
      }

      // Parse and execute build command
      const commands = command.split('&&').map((cmd) => cmd.trim());

      for (const cmd of commands) {
        core.info(`Executing: ${cmd}`);

        // Parse command and arguments
        const parts = cmd.split(' ');
        const executable = parts[0];
        const args = parts.slice(1);

        // Execute command
        await exec.exec(executable, args, {
          cwd: process.cwd(),
        });
      }

      core.info('✅ Build completed successfully');

      // Run theme check if enabled (optional)
      if (buildConfig.themeCheck) {
        core.info('Running theme check...');
        const checkResult = await checkTheme(process.cwd(), {
          autoCorrect: buildConfig.themeCheckAutoCorrect || false,
          json: true,
        });

        if (!checkResult.success) {
          if (buildConfig.themeCheckFailOnError) {
            throw new Error('Theme check found errors. Fix them before deploying.');
          } else {
            core.warning('Theme check found issues but continuing deployment.');
          }
        } else {
          core.info('✅ Theme check passed');
        }
      }
    } finally {
      // Restore original working directory
      if (cwd !== '.') {
        process.chdir(originalCwd);
        core.info(`Restored working directory to: ${process.cwd()}`);
      }
    }
  } catch (error) {
    core.error(`Build failed: ${error.message}`);
    throw error;
  }
}

/**
 * Check if build is needed based on file changes
 * @param {string[]} changedFiles - List of changed files
 * @returns {boolean} True if build is needed
 */
function isBuildNeeded(changedFiles) {
  const buildTriggerPatterns = [
    /\.js$/,
    /\.ts$/,
    /\.jsx$/,
    /\.tsx$/,
    /\.scss$/,
    /\.sass$/,
    /\.less$/,
    /\.css$/,
    /package\.json$/,
    /package-lock\.json$/,
    /yarn\.lock$/,
    /pnpm-lock\.yaml$/,
  ];

  return changedFiles.some((file) => buildTriggerPatterns.some((pattern) => pattern.test(file)));
}

/**
 * Get package manager from lock file
 * @param {string} cwd - Working directory
 * @returns {Promise<string>} Package manager name
 */
async function detectPackageManager(cwd = '.') {
  try {
    // Check for lock files
    const lockFiles = {
      'pnpm-lock.yaml': 'pnpm',
      'yarn.lock': 'yarn',
      'package-lock.json': 'npm',
    };

    for (const [lockFile, manager] of Object.entries(lockFiles)) {
      try {
        await fs.access(path.join(cwd, lockFile));
        core.info(`Detected ${manager} from ${lockFile}`);
        return manager;
      } catch {
        // File doesn't exist, continue checking
      }
    }

    // Default to npm if no lock file found
    core.info('No lock file found, defaulting to npm');
    return 'npm';
  } catch (error) {
    core.warning(`Failed to detect package manager: ${error.message}`);
    return 'npm';
  }
}

module.exports = {
  buildAssets,
  isBuildNeeded,
  detectPackageManager,
};
