const { validateInputs, isValidStore, normalizeStore, isValidThemeId } = require('../validators');

describe('validators', () => {
  describe('validateInputs', () => {
    it('should validate staging mode successfully', () => {
      const config = {
        mode: 'staging',
        store: 'test-store',
        build: { packageManager: 'npm' },
        secrets: {
          themeToken: 'token',
          stagingThemeId: '123456',
        },
      };

      const errors = validateInputs(config);
      expect(errors).toHaveLength(0);
    });

    it('should return errors for missing staging requirements', () => {
      const config = {
        mode: 'staging',
        store: 'test-store',
        build: { packageManager: 'npm' },
        secrets: {},
      };

      const errors = validateInputs(config);
      expect(errors).toContain('SHOPIFY_CLI_THEME_TOKEN is required for staging mode');
      expect(errors).toContain('STAGING_THEME_ID is required for staging mode');
    });

    it('should validate production mode successfully', () => {
      const config = {
        mode: 'production',
        store: 'test-store',
        build: { packageManager: 'npm' },
        backup: { retention: 3 },
        versioning: { enabled: true },
        secrets: {
          themeToken: 'token',
        },
      };

      const errors = validateInputs(config);
      expect(errors).toHaveLength(0);
    });

    it('should validate sync-live mode successfully', () => {
      const config = {
        mode: 'sync-live',
        store: 'test-store',
        build: { packageManager: 'npm' },
        sync: { type: 'pr' },
        secrets: {
          themeToken: 'token',
          githubToken: 'github-token',
        },
      };

      const errors = validateInputs(config);
      expect(errors).toHaveLength(0);
    });

    it('should return error for invalid mode', () => {
      const config = {
        mode: 'invalid',
        store: 'test-store',
        build: { packageManager: 'npm' },
        secrets: {},
      };

      const errors = validateInputs(config);
      expect(errors).toContain('Invalid mode: invalid. Must be staging, production, or sync-live');
    });

    it('should return error for invalid package manager', () => {
      const config = {
        mode: 'staging',
        store: 'test-store',
        build: { packageManager: 'invalid' },
        secrets: {
          themeToken: 'token',
          stagingThemeId: '123456',
        },
      };

      const errors = validateInputs(config);
      expect(errors).toContain('Package manager must be npm, yarn, or pnpm');
    });
  });

  describe('isValidStore', () => {
    it('should accept store prefix', () => {
      expect(isValidStore('my-store')).toBe(true);
      expect(isValidStore('test-123')).toBe(true);
    });

    it('should accept full domain', () => {
      expect(isValidStore('my-store.myshopify.com')).toBe(true);
      expect(isValidStore('test-123.myshopify.com')).toBe(true);
    });

    it('should reject invalid formats', () => {
      expect(isValidStore('invalid_store')).toBe(false);
      expect(isValidStore('store.wrongdomain.com')).toBe(false);
      expect(isValidStore('')).toBe(false);
    });
  });

  describe('normalizeStore', () => {
    it('should add domain to prefix', () => {
      expect(normalizeStore('my-store')).toBe('my-store.myshopify.com');
    });

    it('should keep full domain unchanged', () => {
      expect(normalizeStore('my-store.myshopify.com')).toBe('my-store.myshopify.com');
    });
  });

  describe('isValidThemeId', () => {
    it('should accept numeric theme IDs', () => {
      expect(isValidThemeId('123456789')).toBe(true);
      expect(isValidThemeId('987654321')).toBe(true);
    });

    it('should reject non-numeric IDs', () => {
      expect(isValidThemeId('abc123')).toBe(false);
      expect(isValidThemeId('theme-id')).toBe(false);
      expect(isValidThemeId('')).toBe(false);
    });
  });
});
