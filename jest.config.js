module.exports = {
  testEnvironment: 'node',
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js',
    '!src/**/__tests__/**',
    '!src/index.js', // Entry point, tested via integration
    '!src/utils/git.js', // Git operations, tested via integration
    '!src/utils/build.js', // Build operations, tested via integration
    '!src/utils/sanitize.js', // Security sanitization, tested via integration
    '!src/utils/config.js', // Configuration parsing, tested via integration
    '!src/utils/shopify-cli.js', // CLI wrapper, tested via integration
    '!**/node_modules/**',
    '!**/dist/**',
    '!**/coverage/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 85,
      lines: 85,
      statements: 85
    }
  },
  testMatch: ['**/__tests__/**/*.js', '**/?(*.)+(spec|test).js'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  modulePathIgnorePatterns: ['<rootDir>/dist/'], // Prevent package.json collision
  clearMocks: true,
  restoreMocks: true,
  verbose: true,
  testTimeout: 10000,
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  }
};
