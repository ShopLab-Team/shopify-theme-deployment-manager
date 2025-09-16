const { withRetry, pollUntil, sleep } = require('../retry');

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
