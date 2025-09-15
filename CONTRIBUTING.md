# Contributing to Shopify Theme Deployment Manager

Thank you for your interest in contributing to this GitHub Action!

## Development Setup

### Prerequisites

- Node.js 20.x or higher
- npm 8.x or higher
- Git

### Initial Setup

```bash
# Clone the repository
git clone https://github.com/ShopLab-Team/shopify-theme-deployment-manager.git
cd shopify-theme-deployment-manager

# Install dependencies
npm install

# Run tests
npm test
```

## Development Workflow

### Important: The `dist/` Directory

**The `dist/` directory MUST be committed to the repository.** This is a GitHub Actions requirement.

GitHub Actions run directly from the repository without a build step, so the compiled JavaScript must be present. The `dist/index.js` file is the entry point for the action.

### Making Changes

1. **Edit source files** in `src/`
2. **Write/update tests** in `src/**/__tests__/`
3. **Run tests** with `npm test`
4. **Build the distribution** with `npm run build`
5. **Commit both source and dist** files

### Build Process

The action uses `@vercel/ncc` to compile all dependencies into a single file:

```bash
# Build the distribution
npm run build

# This creates/updates:
# - dist/index.js (compiled action code)
# - dist/licenses.txt (dependency licenses)
# - dist/package.json (minimal package info)
```

### Pre-commit Checklist

Before committing changes:

```bash
# 1. Run linter
npm run lint

# 2. Check formatting
npm run format:check

# 3. Run tests
npm test

# 4. Build distribution
npm run build

# 5. Stage and commit everything
git add .
git commit -m "your commit message"
```

### Manual Build Process

**Important**: There is no automated build workflow. The `dist/` directory must be manually built and committed with your changes. This is intentional to:

1. Avoid conflicts with branch protection rules
2. Ensure developers test their changes before committing
3. Keep the build process predictable and controlled

Always run `npm run build` before committing your changes.

## Testing

### Unit Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Manual Testing

You can test the action locally by:

1. Creating a test workflow in `.github/workflows/test-local.yml`
2. Using the action with a local path:

```yaml
- uses: ./
  with:
    mode: staging
    # ... other inputs
```

## Code Style

### Linting

```bash
# Check for linting errors
npm run lint

# Fix linting errors
npm run lint:fix
```

### Formatting

```bash
# Check formatting
npm run format:check

# Format code
npm run format
```

## Pull Request Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. **Build the distribution** (`npm run build`)
5. Commit your changes (`git commit -m 'feat: add amazing feature'`)
6. Push to your branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### PR Requirements

- [ ] Tests pass (`npm test`)
- [ ] Code is linted (`npm run lint`)
- [ ] Code is formatted (`npm run format:check`)
- [ ] Distribution is built (`npm run build`)
- [ ] `dist/` changes are committed
- [ ] Documentation is updated if needed

## Commit Message Guidelines

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `style:` Code style changes (formatting, etc.)
- `refactor:` Code refactoring
- `test:` Test changes
- `chore:` Maintenance tasks
- `perf:` Performance improvements

Examples:

```
feat: add support for custom theme prefixes
fix: handle missing theme ID gracefully
docs: update README with new configuration options
```

## Versioning

The action follows semantic versioning:

- **Major** version for breaking changes
- **Minor** version for new features
- **Patch** version for bug fixes

GitHub Actions should use major version tags:

```yaml
# Good - uses major version tag
- uses: ShopLab-Team/shopify-theme-deployment-manager@v1

# Also fine - uses specific version
- uses: ShopLab-Team/shopify-theme-deployment-manager@v1.1.0

# Not recommended - uses mutable branch
- uses: ShopLab-Team/shopify-theme-deployment-manager@main
```

## Common Issues

### `dist/index.js` not found

If you see this error when testing the action:

```
Error: Cannot find module '/path/to/dist/index.js'
```

Run `npm run build` to generate the distribution files.

### Tests failing after changes

Make sure to:

1. Update relevant tests when changing functionality
2. Mock external dependencies properly
3. Run `npm test` before committing

## Questions?

Feel free to:

- Open an issue for bugs or feature requests
- Start a discussion for questions or ideas
- Join our community discussions

Thank you for contributing! 🎉
