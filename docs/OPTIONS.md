# 📋 Configuration Options Reference

This document provides a comprehensive reference for all configuration options available in the Shopify Theme Deploy & Sync Action.

## Table of Contents

- [Core Configuration](#core-configuration)
- [Branch Configuration](#branch-configuration)
- [Build Configuration](#build-configuration)
- [JSON Pull Configuration](#json-pull-configuration)
- [Push Configuration](#push-configuration)
- [Backup Configuration](#backup-configuration)
- [Deploy Configuration](#deploy-configuration)
- [Versioning Configuration](#versioning-configuration)
- [Sync Configuration](#sync-configuration)
- [Optional Features](#optional-features)
- [Environment Variables](#environment-variables)
- [Outputs](#outputs)

## Core Configuration

### `mode`
- **Description**: Deployment mode that determines the action behavior
- **Required**: Yes
- **Options**: 
  - `staging` - Deploy to staging theme
  - `production` - Deploy to production with backups and versioning
  - `sync-live` - Pull changes from live theme back to repository
- **Example**: `mode: staging`

### `store`
- **Description**: Shopify store domain
- **Required**: No (if `SHOPIFY_STORE_URL` secret is set)
- **Format**: Can be either:
  - Full domain: `your-store.myshopify.com`
  - Store prefix: `your-store`
- **Example**: `store: my-store.myshopify.com`
- **Security Note**: Consider using `SHOPIFY_STORE_URL` secret instead for better security

### `theme_path`
- **Description**: Path to theme directory for Shopify CLI operations
- **Default**: `.` (root directory)
- **Use Case**: When your theme files are in a subdirectory (e.g., compiled to `dist` folder)
- **Example**: `theme_path: dist`
- **How it works**:
  - Build commands run from `build_cwd` (if `build_enabled: true`)
  - Shopify CLI upload/download operates on files in `theme_path`
  - Example: Build in root (`.`), upload from `dist` folder
- **Example Configuration**:
  ```yaml
  build_enabled: true
  build_cwd: .              # Run build commands from root
  build_command: yarn build  # Compiles to dist/
  theme_path: dist          # Upload theme from dist/ folder
  ```

## Branch Configuration

### `branch_staging`
- **Description**: Branch name that triggers staging deployments
- **Default**: `staging`
- **Example**: `branch_staging: develop`

### `branch_production`
- **Description**: Branch names that trigger production deployments
- **Default**: `main,master`
- **Format**: Comma-separated list
- **Example**: `branch_production: main,production`

## Build Configuration

### `build_enabled`
- **Description**: Enable/disable the build step before deployment
- **Default**: `true`
- **Options**: `true` or `false`
- **Use Case**: Disable for themes without build requirements

### `build_node_version`
- **Description**: Node.js version to use for build
- **Default**: `20.x`
- **Format**: Node version string (e.g., `18.x`, `20.x`, `20.15.0`)
- **Note**: Will use `.nvmrc` if present in repository

### `build_package_manager`
- **Description**: Package manager to use for dependencies
- **Default**: `npm`
- **Options**: `npm`, `yarn`, `pnpm`
- **Example**: `build_package_manager: yarn`

### `build_command`
- **Description**: Command to run for building the theme
- **Default**: `npm ci && npm run build`
- **Example**: 
  ```yaml
  build_command: |
    yarn install --frozen-lockfile
    yarn build:production
  ```

### `build_cwd`
- **Description**: Working directory for build commands
- **Default**: `.`
- **Use Case**: For monorepo setups or themes in subdirectories
- **Example**: `build_cwd: ./theme`

## JSON Pull Configuration

### `json_pull_globs`
- **Description**: Glob patterns for JSON files to pull from source theme
- **Default**: 
  ```
  templates/*.json
  locales/*.json
  config/settings_data.json
  sections/*.json
  snippets/*.json
  templates/customers/*.json
  ```
- **Format**: Newline-separated glob patterns
- **Use Case**: Preserve merchant customizations during deployment

### `json_sync_on_staging`
- **Description**: Whether to sync JSON files from live/production theme during staging deployments
- **Default**: `true`
- **Options**: `true` or `false`
- **Use Case**: Keep staging in sync with production content

## Push Configuration

### `push_extra_ignore`
- **Description**: Additional glob patterns to ignore during theme push
- **Default**: Empty
- **Format**: Newline-separated glob patterns
- **Example**:
  ```yaml
  push_extra_ignore: |
    *.map
    src/**
    docs/**
  ```

### `push_nodelete`
- **Description**: Prevent deletion of files on remote theme
- **Default**: `false`
- **Options**: `true` or `false`
- **Use Case**: Safer deployments that never remove files

## Backup Configuration

### `backup_enabled`
- **Description**: Enable automatic theme backups before production deployment
- **Default**: `true`
- **Options**: `true` or `false`
- **Use Case**: Critical for production safety

### `backup_retention`
- **Description**: Number of backup themes to retain
- **Default**: `3`
- **Format**: Positive integer
- **Note**: Older backups are automatically deleted

### `backup_prefix`
- **Description**: Prefix for backup theme names
- **Default**: `BACKUP_`
- **Example**: `backup_prefix: ARCHIVE_`
- **Result**: Creates themes like `ARCHIVE_2024_01_15_14_30_45`

### `backup_timezone`
- **Description**: Timezone for backup timestamp formatting
- **Default**: `UTC`
- **Format**: Valid timezone string (e.g., `America/New_York`, `Europe/London`)
- **Example**: `backup_timezone: Asia/Tokyo`

## Deploy Configuration

### `deploy_ignore_json_on_prod`
- **Description**: Ignore JSON files during production deployment (except Phase B default locale)
- **Default**: `true`
- **Options**: `true` or `false`
- **Behavior**:
  - `true`: Phase A ignores all JSON, Phase B pushes default locale (if enabled)
  - `false`: Pushes all files, respects `push_extra_ignore` patterns
- **Use Case**: Preserve merchant customizations in production

### `deploy_push_default_locale`
- **Description**: Push default locale files in Phase B when `deploy_ignore_json_on_prod: true`
- **Default**: `true`
- **Options**: `true` or `false`
- **Files Affected**: `locales/en.default.json` and `locales/en.default.schema.json`
- **Behavior**:
  - `true`: Phase B pushes default locale files (overrides ignore patterns)
  - `false`: Phase B is skipped, NO locale files are pushed
- **Use Case**: Set to `false` if you want to preserve each store's own default locale
- **Example**: To prevent pushing `en.default.json` entirely:
  ```yaml
  deploy_ignore_json_on_prod: true
  deploy_push_default_locale: false
  ```

### `deploy_allow_live_push`
- **Description**: Allow pushing directly to live/published themes
- **Default**: `false`
- **Options**: `true` or `false`
- **Security**: Keep `false` unless absolutely necessary

## Versioning Configuration

### `versioning_enabled`
- **Description**: Enable automatic version incrementing for production themes
- **Default**: `true`
- **Options**: `true` or `false`
- **Use Case**: Track deployment history with auto-incrementing version numbers
- **Example**: Set to `false` to disable automatic versioning

### `versioning_format`
- **Description**: Version number format to use
- **Default**: `X.XX.XX`
- **Options**: 
  - `X.X.X` - No padding (e.g., `1.2.3`, `10.20.30`)
  - `X.X.XX` - Patch padding only (e.g., `1.2.03`, `10.20.30`)
  - `X.XX.XX` - Full padding (e.g., `1.02.03`, `10.20.30`)
- **Rollover**: All formats support automatic rollover at 100:
  - 100 patches → 1 minor version
  - 100 minors → 1 major version
- **Examples**:
  - `X.X.X`: `[1.2.3]` → `[1.2.4]` → ... → `[1.2.99]` → `[1.3.0]`
  - `X.X.XX`: `[1.2.03]` → `[1.2.04]` → ... → `[1.2.99]` → `[1.3.00]`
  - `X.XX.XX`: `[1.02.03]` → `[1.02.04]` → ... → `[1.02.99]` → `[1.03.00]`
  - Maximum capacity: 1 million deployments before reset

### `versioning_source`
- **Description**: Source for version tracking
- **Default**: `theme`
- **Options**: 
  - `theme` - Use theme name version and auto-increment (default behavior)
  - `release` - Sync theme version with latest GitHub release tag
- **Use Cases**:
  - `theme`: Independent theme versioning, auto-increments each deployment
  - `release`: Keep theme version synchronized with your GitHub releases
- **Examples**:
  - `theme` mode: `PRODUCTION [1.0.4]` → `PRODUCTION [1.0.5]`
  - `release` mode with tag `v1.0.9`: `PRODUCTION [1.0.4]` → `PRODUCTION [1.0.9]`
- **Note**: `release` mode requires `GITHUB_TOKEN` in workflow env

### `versioning_start`
- **Description**: Custom starting version for themes with no version
- **Default**: None (uses `0.00.01` or format-specific default)
- **Format**: Version string (e.g., `3.0.0`, `5.10.20`)
- **Use Cases**:
  - Start versioning from a specific number
  - Migrate from another versioning system
- **Behavior**:
  - Only used with `versioning_source: theme`
  - Only applied if theme has no existing version
  - If theme has version, continues from existing version
- **Examples**:
  - Theme `PRODUCTION` + `versioning_start: 3.0.0` → `PRODUCTION [3.0.1]`
  - Theme `PRODUCTION [5.0.0]` + `versioning_start: 3.0.0` → `PRODUCTION [5.0.1]` (ignores start)

## Sync Configuration

### `sync_files`
- **Description**: Determines which files to sync from live theme
- **Default**: `all`
- **Options**:
  - `all` - Sync all theme files
  - `json` - Only sync JSON files
  - `custom` - Use patterns from `sync_only_globs`

### `sync_only_globs`
- **Description**: Custom glob patterns for sync (only used when `sync_files: custom`)
- **Default**: Empty
- **Format**: Newline-separated glob patterns
- **Negative Patterns**: Patterns starting with `!` are treated as exclusions
- **Example**:
  ```yaml
  sync_only_globs: |
    config/settings_data.json
    templates/*.json
    sections/*.liquid
    assets/*.css
    !assets/tailwind-input.css
    assets/*.js
  ```
- **Use Case**: Sync specific files while excluding compiled or generated files (e.g., `!assets/compiled.css`)

### `sync_exclude_pattern`
- **Description**: Files to exclude when `sync_files: all` (syncing all theme files)
- **Default**: Empty
- **Format**: Newline-separated file patterns
- **Example**:
  ```yaml
  sync_exclude_pattern: |
    assets/tailwind-input.css
    assets/compiled.css
    assets/*.min.js
  ```
- **Use Case**: Sync all theme files except specific compiled or generated files
- **Note**: Only applies when `sync_files: all`. For custom sync patterns, use negative patterns in `sync_only_globs` instead

### `sync_branch`
- **Description**: Branch name for committing synced changes
- **Default**: `remote_changes`
- **Note**: This branch should NOT be protected

### `sync_target_branch`
- **Description**: Target branch for PR creation in sync mode
- **Default**: `staging`
- **Example**: `sync_target_branch: main`

### `sync_commit_message`
- **Description**: Commit message for sync operations
- **Default**: `chore(sync): import live JSON changes`
- **Example**: `sync_commit_message: "feat: sync merchant customizations"`

### `sync_type`
- **Description**: How to handle synced changes
- **Default**: `pr`
- **Options**:
  - `pr` - Create pull request for review
  - `push` - Direct push to branch
- **Note**: PR mode requires `GITHUB_TOKEN`

## Optional Features

### `dry_run`
- **Description**: Run in dry-run mode without making actual changes
- **Default**: `false`
- **Options**: `true` or `false`
- **Use Case**: Test configuration and validate workflow

## Environment Variables

Required and optional environment variables for the action:

### Required Secrets

| Variable | Description | Required For |
|----------|-------------|--------------|
| `SHOPIFY_CLI_THEME_TOKEN` | Shopify theme access token | All modes |
| `STAGING_THEME_ID` | ID of staging theme | Staging mode |
| `GITHUB_TOKEN` | GitHub token for PR creation | Sync with PR |

### Optional Secrets

| Variable | Description | Default |
|----------|-------------|---------|
| `SHOPIFY_STORE_URL` | Store domain (alternative to `store` input) | - |
| `PRODUCTION_THEME_ID` | ID of production theme | Auto-detect live theme |
| `GITHUB_TOKEN` | GitHub token for PR creation and release versioning | Required for `sync-live` PR mode and `versioning_source: release` |
| `SLACK_WEBHOOK_URL` | Slack webhook for notifications | Optional - for Slack notifications |
| `MS_TEAMS_WEBHOOK_URL` | MS Teams webhook for notifications | Optional - for MS Teams notifications |
| `SYNC_JSON_ON_STAGING` | Override `json_sync_on_staging` setting | `true` |

## Outputs

The action provides these outputs for use in subsequent workflow steps:

### `theme_id`
- **Description**: ID of the deployed theme
- **Example Usage**: 
  ```yaml
  - id: deploy
    uses: ShopLab-Team/shopify-theme-deployment-manager@v1
  - run: echo "Deployed to theme ${{ steps.deploy.outputs.theme_id }}"
  ```

### `theme_name`
- **Description**: Name of the deployed theme
- **Example**: `Staging - 2024.01.15`

### `preview_url`
- **Description**: URL to preview the deployed theme
- **Format**: `https://store.myshopify.com/?preview_theme_id=123456789`

### `editor_url`
- **Description**: URL to theme editor in Shopify admin
- **Format**: `https://store.myshopify.com/admin/themes/123456789/editor`

### `version`
- **Description**: Version tag after deployment (if versioning enabled)
- **Format**: Semantic version string (e.g., `v1.2.3`)

### `package_path`
- **Description**: Path to theme package ZIP file (production mode with versioning enabled)
- **Format**: File path (e.g., `theme-v1.2.3.zip`)
- **Use Case**: Can be used with GitHub Releases or artifact storage
- **Note**: Only available in production mode when versioning is enabled

### `synced`
- **Description**: Whether sync was performed (sync-live mode)
- **Format**: Boolean string (`'true'` or `'false'`)
- **Note**: Only available in sync-live mode

### `files_count`
- **Description**: Number of files synced (sync-live mode)
- **Format**: Numeric string (e.g., `'42'`)
- **Note**: Only available in sync-live mode

### `branch`
- **Description**: Branch used for sync (sync-live mode)
- **Format**: Branch name (e.g., `remote_changes`)
- **Note**: Only available in sync-live mode

### `pull_request_url`
- **Description**: URL of created/updated pull request (sync-live mode with PR)
- **Format**: GitHub PR URL
- **Note**: Only available in sync-live mode when `sync_type` is `pr`

### `deployment_time`
- **Description**: Time taken for deployment in seconds
- **Format**: Numeric string (e.g., `'45'`)
- **Note**: Available in all modes

## Configuration Precedence

When the same setting can be configured multiple ways, this precedence applies:

1. **Environment variables** (highest priority)
2. **Action inputs**
3. **Default values** (lowest priority)

For example, `SYNC_JSON_ON_STAGING` environment variable overrides `json_sync_on_staging` input.

## Best Practices

1. **Use underscores in input names**: All inputs use underscores (`build_enabled`), not dots
2. **Store sensitive data in secrets**: Never hardcode tokens or credentials
3. **Test with dry run**: Use `dry_run: true` to validate configuration
4. **Start with defaults**: Most defaults are production-ready
5. **Customize gradually**: Override only what you need

## Related Documentation

- [Examples](EXAMPLES.md) - Minimal configuration examples
- [Security](SECURITY.md) - Security best practices
- [Contributing](CONTRIBUTING.md) - Development guidelines
