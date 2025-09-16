const core = require('@actions/core');

/**
 * Default retry options
 */
const DEFAULT_OPTIONS = {
  retries: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  backoffMultiplier: 2,
  shouldRetry: (error) => {
    // Retry on network errors
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
      return true;
    }

    // Retry on rate limit errors
    if (error.message && error.message.includes('rate limit')) {
      return true;
    }

    // Retry on 429 (Too Many Requests) or 503 (Service Unavailable)
    if (error.status === 429 || error.status === 503) {
      return true;
    }

    // Retry on Shopify API throttling
    if (error.message && error.message.includes('Throttled')) {
      return true;
    }

    return false;
  },
};

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute function with exponential backoff retry
 * @param {Function} fn - Function to execute
 * @param {Object} options - Retry options
 * @returns {Promise<any>} Result of function
 */
async function withRetry(fn, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError;

  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    try {
      // Execute the function
      const result = await fn();

      // Success - return result
      if (attempt > 0) {
        core.info(`✅ Succeeded on attempt ${attempt + 1}`);
      }

      return result;
    } catch (error) {
      lastError = error;

      // Check if we should retry
      if (attempt === opts.retries || !opts.shouldRetry(error)) {
        // No more retries or error is not retryable
        throw error;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        opts.initialDelay * Math.pow(opts.backoffMultiplier, attempt),
        opts.maxDelay
      );

      core.warning(`⚠️ Attempt ${attempt + 1} failed: ${error.message}`);
      core.info(`⏳ Retrying in ${delay / 1000} seconds...`);

      // Wait before retrying
      await sleep(delay);
    }
  }

  // Should never reach here, but just in case
  throw lastError;
}

/**
 * Poll a condition until it's true or timeout
 * @param {Function} conditionFn - Function that returns true when condition is met
 * @param {Object} options - Polling options
 * @returns {Promise<void>}
 */
async function pollUntil(conditionFn, options = {}) {
  const {
    interval = 5000, // 5 seconds
    timeout = 300000, // 5 minutes
    message = 'Waiting for condition...',
  } = options;

  const startTime = Date.now();

  core.info(`⏳ ${message}`);

  while (Date.now() - startTime < timeout) {
    try {
      const result = await conditionFn();

      if (result) {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        core.info(`✅ Condition met after ${elapsed} seconds`);
        return result;
      }
    } catch (error) {
      core.debug(`Polling error (will continue): ${error.message}`);
    }

    // Check if we're about to timeout
    if (Date.now() - startTime + interval > timeout) {
      throw new Error(`Timeout after ${timeout / 1000} seconds: ${message}`);
    }

    // Wait before next check
    await sleep(interval);
  }

  throw new Error(`Timeout after ${timeout / 1000} seconds: ${message}`);
}

module.exports = {
  withRetry,
  pollUntil,
  sleep,
};
