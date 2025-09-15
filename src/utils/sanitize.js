const core = require('@actions/core');

/**
 * Sanitize string input to prevent injection attacks
 * @param {string} input - Input string to sanitize
 * @param {string} name - Name of the input for logging
 * @returns {string} Sanitized string
 */
function sanitizeInput(input, name = 'input') {
  if (!input) return '';

  // Convert to string if not already
  const str = String(input);

  // Check for potential command injection patterns
  const dangerousPatterns = [
    /[;&|`$(){}[\]<>]/g, // Shell metacharacters
    /\.\.\//g, // Directory traversal
    /^-/, // Command flags that could be misinterpreted
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(str)) {
      core.warning(`Potentially dangerous pattern detected in ${name}: ${pattern}`);
    }
  }

  // Remove null bytes
  let sanitized = str.replace(/\0/g, '');

  // Escape quotes for shell safety
  sanitized = sanitized.replace(/'/g, "'\\''");

  // Limit length to prevent DOS
  const maxLength = 1000;
  if (sanitized.length > maxLength) {
    core.warning(`Input ${name} truncated from ${sanitized.length} to ${maxLength} characters`);
    sanitized = sanitized.substring(0, maxLength);
  }

  return sanitized;
}

/**
 * Sanitize file path to prevent directory traversal
 * @param {string} path - File path to sanitize
 * @returns {string} Sanitized path
 */
function sanitizePath(path) {
  if (!path) return '';

  // Remove any directory traversal attempts
  let sanitized = path.replace(/\.\.\//g, '');
  sanitized = sanitized.replace(/\.\.$/g, '');

  // Remove leading slashes to prevent absolute paths
  sanitized = sanitized.replace(/^\/+/, '');

  // Remove null bytes
  sanitized = sanitized.replace(/\0/g, '');

  // Validate characters (alphanumeric, dash, underscore, slash, dot)
  if (!/^[a-zA-Z0-9\-_/.]+$/.test(sanitized)) {
    core.warning(`Path contains invalid characters: ${path}`);
    // Remove invalid characters
    sanitized = sanitized.replace(/[^a-zA-Z0-9\-_/.]/g, '');
  }

  return sanitized;
}

/**
 * Sanitize theme ID to ensure it's numeric
 * @param {string} themeId - Theme ID to sanitize
 * @returns {string|null} Sanitized theme ID or null if invalid
 */
function sanitizeThemeId(themeId) {
  if (!themeId) return null;

  // Convert to string and trim
  const str = String(themeId).trim();

  // Check if it's a valid number
  if (!/^\d+$/.test(str)) {
    core.warning(`Invalid theme ID format: ${themeId}`);
    return null;
  }

  // Ensure it's within reasonable bounds
  const id = parseInt(str, 10);
  if (id < 1 || id > Number.MAX_SAFE_INTEGER) {
    core.warning(`Theme ID out of valid range: ${themeId}`);
    return null;
  }

  return str;
}

/**
 * Sanitize store URL/domain
 * @param {string} store - Store URL or domain
 * @returns {string|null} Sanitized store domain or null if invalid
 */
function sanitizeStore(store) {
  if (!store) return null;

  // Remove protocol if present
  let sanitized = store.replace(/^https?:\/\//i, '');

  // Remove trailing slashes
  sanitized = sanitized.replace(/\/+$/, '');

  // Remove any path components
  sanitized = sanitized.split('/')[0];

  // Validate domain format
  const domainRegex = /^[a-z0-9-]+\.myshopify\.com$|^[a-z0-9-]+$/i;
  if (!domainRegex.test(sanitized)) {
    core.warning(`Invalid store format: ${store}`);
    return null;
  }

  // Ensure .myshopify.com suffix
  if (!sanitized.includes('.myshopify.com')) {
    sanitized = `${sanitized}.myshopify.com`;
  }

  return sanitized.toLowerCase();
}

/**
 * Sanitize webhook URL
 * @param {string} url - Webhook URL
 * @returns {string|null} Sanitized URL or null if invalid
 */
function sanitizeWebhookUrl(url) {
  if (!url) return null;

  try {
    const parsed = new URL(url);

    // Only allow HTTPS
    if (parsed.protocol !== 'https:') {
      core.warning('Webhook URL must use HTTPS');
      return null;
    }

    // Validate known webhook domains
    const allowedDomains = [
      'hooks.slack.com',
      'discord.com',
      'webhook.site', // For testing
    ];

    const isAllowed = allowedDomains.some(
      (domain) => parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`)
    );

    if (!isAllowed) {
      core.warning(`Webhook domain not in allowlist: ${parsed.hostname}`);
      // Still return it but warn
    }

    return url;
  } catch (error) {
    core.warning(`Invalid webhook URL: ${error.message}`);
    return null;
  }
}

/**
 * Sanitize glob patterns
 * @param {string[]} patterns - Array of glob patterns
 * @returns {string[]} Sanitized patterns
 */
function sanitizeGlobPatterns(patterns) {
  if (!Array.isArray(patterns)) return [];

  return patterns
    .filter(Boolean)
    .map((pattern) => {
      // Remove any shell metacharacters that could cause issues
      let sanitized = pattern.replace(/[;&|`$(){}[\]<>]/g, '');

      // Ensure pattern doesn't try to escape working directory
      sanitized = sanitized.replace(/^\.\.\//, '');

      // Limit pattern length
      if (sanitized.length > 200) {
        sanitized = sanitized.substring(0, 200);
      }

      return sanitized;
    })
    .filter((pattern) => pattern.length > 0);
}

/**
 * Validate and sanitize all config inputs
 * @param {Object} config - Configuration object
 * @returns {Object} Sanitized configuration
 */
function sanitizeConfig(config) {
  const sanitized = { ...config };

  // Sanitize mode
  if (config.mode && !['staging', 'production', 'sync-live'].includes(config.mode)) {
    throw new Error(`Invalid mode: ${config.mode}`);
  }

  // Sanitize store
  if (config.store) {
    const store = sanitizeStore(config.store);
    if (!store) {
      throw new Error(`Invalid store format: ${config.store}`);
    }
    sanitized.store = store;
  }

  // Sanitize theme IDs
  if (config.secrets) {
    if (config.secrets.stagingThemeId) {
      sanitized.secrets.stagingThemeId = sanitizeThemeId(config.secrets.stagingThemeId);
    }
    if (config.secrets.productionThemeId) {
      sanitized.secrets.productionThemeId = sanitizeThemeId(config.secrets.productionThemeId);
    }
    if (config.secrets.slackWebhookUrl) {
      sanitized.secrets.slackWebhookUrl = sanitizeWebhookUrl(config.secrets.slackWebhookUrl);
    }
  }

  // Sanitize paths
  if (config.build && config.build.cwd) {
    sanitized.build.cwd = sanitizePath(config.build.cwd);
  }

  // Sanitize glob patterns
  if (config.json && config.json.pullGlobs) {
    sanitized.json.pullGlobs = sanitizeGlobPatterns(config.json.pullGlobs);
  }
  if (config.sync && config.sync.onlyGlobs) {
    sanitized.sync.onlyGlobs = sanitizeGlobPatterns(config.sync.onlyGlobs);
  }
  if (config.push && config.push.extraIgnore) {
    sanitized.push.extraIgnore = sanitizeGlobPatterns(config.push.extraIgnore);
  }

  // Sanitize branch names
  if (config.sync && config.sync.branch) {
    sanitized.sync.branch = sanitizeInput(config.sync.branch, 'sync.branch').replace(
      /[^a-zA-Z0-9\-_/]/g,
      ''
    );
  }

  return sanitized;
}

module.exports = {
  sanitizeInput,
  sanitizePath,
  sanitizeThemeId,
  sanitizeStore,
  sanitizeWebhookUrl,
  sanitizeGlobPatterns,
  sanitizeConfig,
};
