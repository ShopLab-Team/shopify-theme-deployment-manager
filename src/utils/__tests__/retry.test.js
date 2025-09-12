const {
  withRetry,
  pollUntil,
  withRateLimit,
  retryable,
  isRetryableError,
  calculateBackoff,
  sleep,
} = require('../retry');

jest.mock('@actions/core');
const core = require('@actions/core');

describe('retry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    core.info = jest.fn();
    core.warning = jest.fn();
    core.debug = jest.fn();
  });

  describe('withRetry', () => {
    it('should succeed on first attempt', async () => {
      const fn = jest.fn().mockResolvedValue('success');

      const result = await withRetry(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and succeed', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValue('success');

      const result = await withRetry(fn, {
        retries: 2,
        initialDelay: 10,
        shouldRetry: () => true,
      });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
      expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('Attempt 1 failed'));
    });

    it('should fail after max retries', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Persistent failure'));

      await expect(
        withRetry(fn, {
          retries: 2,
          initialDelay: 10,
          shouldRetry: () => true,
        })
      ).rejects.toThrow('Persistent failure');

      expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should not retry non-retryable errors', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Fatal error'));

      await expect(
        withRetry(fn, {
          retries: 2,
          initialDelay: 10,
          shouldRetry: (error) => !error.message.includes('Fatal'),
        })
      ).rejects.toThrow('Fatal error');

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should apply exponential backoff', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockResolvedValue('success');

      const startTime = Date.now();

      const result = await withRetry(fn, {
        retries: 2,
        initialDelay: 100,
        backoffMultiplier: 2,
        shouldRetry: () => true,
      });

      const duration = Date.now() - startTime;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
      // Should have waited ~100ms + ~200ms = ~300ms
      expect(duration).toBeGreaterThanOrEqual(250);
    });
  });

  describe('pollUntil', () => {
    it('should poll until condition is met', async () => {
      let counter = 0;
      const conditionFn = jest.fn().mockImplementation(() => {
        counter++;
        return counter >= 3;
      });

      await pollUntil(conditionFn, {
        interval: 10,
        timeout: 1000,
      });

      expect(conditionFn).toHaveBeenCalledTimes(3);
    });

    it('should timeout if condition never met', async () => {
      const conditionFn = jest.fn().mockResolvedValue(false);

      await expect(
        pollUntil(conditionFn, {
          interval: 10,
          timeout: 50,
          message: 'Test condition',
        })
      ).rejects.toThrow('Timeout after 0.05 seconds: Test condition');

      expect(conditionFn).toHaveBeenCalled();
    });

    it('should handle errors during polling', async () => {
      const conditionFn = jest
        .fn()
        .mockRejectedValueOnce(new Error('Temporary error'))
        .mockResolvedValue(true);

      await pollUntil(conditionFn, {
        interval: 10,
        timeout: 1000,
      });

      expect(conditionFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('withRateLimit', () => {
    it('should execute within rate limit', async () => {
      const fn = jest.fn().mockResolvedValue('success');

      const result = await withRateLimit(fn, {
        bucketSize: 5,
        refillRate: 2,
      });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should handle rate limit errors', async () => {
      const error = new Error('Rate limit exceeded');
      error.status = 429;

      const fn = jest.fn().mockRejectedValueOnce(error).mockResolvedValue('success');

      const result = await withRateLimit(fn, {
        bucketSize: 5,
        refillRate: 2,
      });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('retryable', () => {
    it('should create a retryable function', async () => {
      const originalFn = jest
        .fn()
        .mockRejectedValueOnce(new Error('Fail'))
        .mockResolvedValue('success');

      const retryableFn = retryable(originalFn, {
        retries: 2,
        initialDelay: 10,
        shouldRetry: () => true,
      });

      const result = await retryableFn('arg1', 'arg2');

      expect(result).toBe('success');
      expect(originalFn).toHaveBeenCalledTimes(2);
      expect(originalFn).toHaveBeenCalledWith('arg1', 'arg2');
    });
  });

  describe('isRetryableError', () => {
    it('should identify retryable network errors', () => {
      const error1 = new Error('Network error');
      error1.code = 'ECONNRESET';
      expect(isRetryableError(error1)).toBe(true);

      const error2 = new Error('Timeout');
      error2.code = 'ETIMEDOUT';
      expect(isRetryableError(error2)).toBe(true);

      const error3 = new Error('Not found');
      error3.code = 'ENOTFOUND';
      expect(isRetryableError(error3)).toBe(true);
    });

    it('should identify rate limit errors', () => {
      const error1 = new Error('API rate limit exceeded');
      expect(isRetryableError(error1)).toBe(true);

      const error2 = new Error('Request Throttled');
      expect(isRetryableError(error2)).toBe(true);

      const error3 = new Error('Too many requests');
      error3.status = 429;
      expect(isRetryableError(error3)).toBe(true);
    });

    it('should not retry other errors', () => {
      const error = new Error('Invalid input');
      expect(isRetryableError(error)).toBe(false);
    });
  });

  describe('calculateBackoff', () => {
    it('should calculate exponential backoff', () => {
      expect(calculateBackoff(0)).toBe(1000);
      expect(calculateBackoff(1)).toBe(2000);
      expect(calculateBackoff(2)).toBe(4000);
      expect(calculateBackoff(3)).toBe(8000);
    });

    it('should respect max delay', () => {
      expect(calculateBackoff(10)).toBe(30000); // Should cap at maxDelay
    });

    it('should use custom options', () => {
      const options = {
        initialDelay: 500,
        backoffMultiplier: 3,
        maxDelay: 5000,
      };

      expect(calculateBackoff(0, options)).toBe(500);
      expect(calculateBackoff(1, options)).toBe(1500);
      expect(calculateBackoff(2, options)).toBe(4500);
      expect(calculateBackoff(3, options)).toBe(5000); // Capped
    });
  });

  describe('sleep', () => {
    it('should delay execution', async () => {
      const startTime = Date.now();
      await sleep(100);
      const duration = Date.now() - startTime;

      expect(duration).toBeGreaterThanOrEqual(90);
      expect(duration).toBeLessThan(200);
    });
  });
});
