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

/**
 * Handle Shopify rate limits
 * @param {Function} fn - Function to execute
 * @param {Object} options - Rate limit options
 * @returns {Promise<any>} Result of function
 */
async function withRateLimit(fn, options = {}) {
  const {
    bucketSize = 40, // Shopify allows 40 requests per app per store per minute
    refillRate = 2, // 2 requests per second
    maxWaitTime = 60000, // 1 minute max wait
  } = options;

  // Simple token bucket implementation
  let tokens = bucketSize;
  let lastRefill = Date.now();

  return withRetry(
    async () => {
      // Refill tokens based on time passed
      const now = Date.now();
      const timePassed = now - lastRefill;
      const tokensToAdd = Math.floor((timePassed / 1000) * refillRate);

      if (tokensToAdd > 0) {
        tokens = Math.min(bucketSize, tokens + tokensToAdd);
        lastRefill = now;
      }

      // Check if we have tokens available
      if (tokens <= 0) {
        const waitTime = Math.ceil(((1 - tokens) / refillRate) * 1000);

        if (waitTime > maxWaitTime) {
          throw new Error(
            `Rate limit wait time (${waitTime}ms) exceeds maximum (${maxWaitTime}ms)`
          );
        }

        core.info(`⏳ Rate limit reached, waiting ${waitTime / 1000} seconds...`);
        await sleep(waitTime);

        // Refill after waiting
        tokens = Math.min(bucketSize, (refillRate * waitTime) / 1000);
      }

      // Consume a token and execute
      tokens--;

      try {
        return await fn();
      } catch (error) {
        // If it's a rate limit error, reset our tokens
        if (error.status === 429 || (error.message && error.message.includes('rate limit'))) {
          tokens = 0;

          // Extract retry-after header if available
          const retryAfter = error.headers && error.headers['retry-after'];
          if (retryAfter) {
            const waitTime = parseInt(retryAfter) * 1000;
            core.info(`⏳ Server says retry after ${retryAfter} seconds`);
            await sleep(waitTime);
          }
        }

        throw error;
      }
    },
    {
      shouldRetry: (error) =>
        // Always retry rate limit errors
        error.status === 429 ||
        (error.message && error.message.includes('rate limit')) ||
        DEFAULT_OPTIONS.shouldRetry(error),
    }
  );
}

/**
 * Create a function with built-in retry logic
 * @param {Function} fn - Function to wrap
 * @param {Object} options - Retry options
 * @returns {Function} Wrapped function
 */
function retryable(fn, options = {}) {
  return async (...args) => withRetry(() => fn(...args), options);
}

/**
 * Check if an error is retryable
 * @param {Error} error - Error to check
 * @returns {boolean} True if retryable
 */
function isRetryableError(error) {
  return DEFAULT_OPTIONS.shouldRetry(error);
}

/**
 * Calculate exponential backoff delay
 * @param {number} attempt - Attempt number (0-based)
 * @param {Object} options - Backoff options
 * @returns {number} Delay in milliseconds
 */
function calculateBackoff(attempt, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  return Math.min(opts.initialDelay * Math.pow(opts.backoffMultiplier, attempt), opts.maxDelay);
}

module.exports = {
  withRetry,
  pollUntil,
  withRateLimit,
  retryable,
  isRetryableError,
  calculateBackoff,
  sleep,
};
