# 🚀 Shopify Theme Deploy & Sync Action
[![Test](https://github.com/ShopLab-Team/shopify-theme-deployment-manager/actions/workflows/test.yml/badge.svg)](https://github.com/ShopLab-Team/shopify-theme-deployment-manager/actions/workflows/test.yml)

A powerful GitHub Action for automated Shopify theme deployment with staging/production workflows, live theme synchronization, and comprehensive backup management.

## ✨ Features

- **🎭 Multi-Environment Deployment**: Separate staging and production workflows
- **🔄 Live Theme Sync**: Pull live theme changes back to your repository with PR creation
- **💾 Automatic Backups**: Create timestamped backups with retention policies
- **🏷️ Version Management**: Automatic semantic versioning for production themes
- **📦 Build Integration**: Support for npm, yarn, and pnpm build steps
- **🔔 Slack Notifications**: Rich notifications for deployment events
- **🛡️ Safety Guards**: Prevent accidental live theme overwrites
- **🔁 Smart Retry Logic**: Automatic retries with exponential backoff (never creates duplicate themes)
- **📊 Rate Limit Handling**: Respect Shopify API rate limits
- **🔒 Enterprise Security**: Fork protection, input sanitization, and secure secret handling
- **🎛️ Flexible JSON Sync**: Control whether to sync JSON files during staging deployments
- **🌿 Smart PR Creation**: Creates PRs to the current branch, not always main

## 📋 Table of Contents

- [Quick Start](#quick-start)
- [Inputs](#inputs)
- [Outputs](#outputs)
- [Usage Examples](#usage-examples)
  - [Staging Deployment](#staging-deployment)
  - [Production Deployment](#production-deployment)
  - [Live Theme Sync](#live-theme-sync)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

## 🚀 Quick Start

### Basic Setup

1. Add the action to your workflow:

```yaml
- uses: ShopLab-Team/shopify-theme-deployment-manager@v1
  with:
    mode: staging
    store: my-store.myshopify.com  # Optional if using SHOPIFY_STORE_URL secret
  env:
    SHOPIFY_CLI_THEME_TOKEN: ${{ secrets.SHOPIFY_CLI_THEME_TOKEN }}
    # SHOPIFY_STORE_URL: ${{ secrets.SHOPIFY_STORE_URL }}  # Alternative to 'store' input
    STAGING_THEME_ID: ${{ secrets.STAGING_THEME_ID }}
```

2. Set up required secrets in your repository:
   - `SHOPIFY_CLI_THEME_TOKEN`: Your Shopify theme access token
   - `SHOPIFY_STORE_URL`: (Optional) Store domain if not using 'store' input
   - `STAGING_THEME_ID`: Your staging theme ID
   - `PRODUCTION_THEME_ID`: (Optional) Your production theme ID

## 📥 Inputs

### Required Inputs

| Input | Description | Default |
|-------|-------------|---------|
| `mode` | Deployment mode: `staging`, `production`, or `sync-live` | - |
| `store` | Shopify store domain (e.g., `my-store` or `my-store.myshopify.com`) | - |

> **Note**: The `store` input can also be provided as the `SHOPIFY_STORE_URL` secret instead of plain text for enhanced security.

### Optional Inputs

#### Build Configuration

| Input | Description | Default |
|-------|-------------|---------|
| `build_enabled` | Enable build step | `true` |
| `build_node_version` | Node.js version for build | `20.x` |
| `build_package_manager` | Package manager (`npm`, `yarn`, `pnpm`) | `npm` |
| `build_command` | Build command to run | `npm ci && npm run build` |
| `build_cwd` | Working directory for build | `.` |

> ⚠️ **Important**: All inputs use underscores (`_`), not dots (`.`). For example, use `build_enabled`, not `build.enabled`.

#### Branch Configuration

| Input | Description | Default |
|-------|-------------|---------|
| `branch.staging` | Branch that triggers staging deployment | `staging` |
| `branch.production` | Branch that triggers production deployment | `main,master` |

#### JSON & Theme Push Configuration

| Input | Description | Default |
|-------|-------------|---------|
| `json.pull_globs` | JSON files to pull from source theme (production or live) | `templates/*.json`<br>`templates/customers/*.json`<br>`sections/*.json`<br>`snippets/*.json`<br>`locales/*.json`<br>`config/settings_data.json` |
| `json.sync_on_staging` | Enable JSON sync from source theme during staging deployment | `true` |
| `push.extra_ignore` | Additional patterns to ignore during push | - |
| `push.nodelete` | Prevent deletion of remote files | `false` |

> **Note**: When JSON sync is enabled on staging:
> - If `PRODUCTION_THEME_ID` is provided, it will be used as the source for JSON files
> - Otherwise, the action will look for a published theme (role: main/live)
> - This is particularly useful for development stores where there might not be a published theme
> - You can also control JSON sync via the `SYNC_JSON_ON_STAGING` environment variable

#### Backup Configuration

| Input | Description | Default |
|-------|-------------|---------|
| `backup_enabled` | Enable theme backups | `true` |
| `backup_retention` | Number of backups to keep | `3` |
| `backup_prefix` | Backup name prefix | `BACKUP_` |
| `backup_timezone` | Timezone for backup timestamps | `Asia/Manila` |

#### Deployment Configuration

| Input | Description | Default |
|-------|-------------|---------|
| `deploy_ignore_json_on_prod` | Ignore JSON files on production push | `true` |
| `deploy_allow_live_push` | Allow pushing to live theme | `false` |

#### Versioning Configuration

| Input | Description | Default |
|-------|-------------|---------|
| `versioning_enabled` | Enable theme versioning | `true` |
| `versioning_strategy` | Version bump strategy (`patch`, `minor`, `major`) | `patch` |

#### Sync Configuration

| Input | Description | Default |
|-------|-------------|---------|
| `sync_mode` | Sync mode: `all` (sync all files), `json` (only JSON files), or `custom` (use `sync_only_globs`) | `all` |
| `sync_only_globs` | File patterns for custom sync mode (only used when `sync_mode` is `custom`) | - |
| `sync_branch` | Branch for sync commits | `remote_changes` |
| `sync_target_branch` | Target branch for PR (when `sync_output: pr`) | `staging` |
| `sync_commit_message` | Commit message for sync | Dynamic based on mode |
| `sync_output` | Sync output method (`pr` or `push`) | `pr` |

### Secrets

Set these as environment variables:

| Secret | Description | Required |
|--------|-------------|----------|
| `SHOPIFY_CLI_THEME_TOKEN` | Shopify theme access token | ✅ |
| `SHOPIFY_STORE_URL` | Store domain (alternative to `store` input) | Optional |
| `STAGING_THEME_ID` | Staging theme ID | For staging mode |
| `PRODUCTION_THEME_ID` | Production theme ID | Optional |
| `SLACK_WEBHOOK_URL` | Slack webhook for notifications | Optional |
| `GITHUB_TOKEN` | GitHub token for PR creation | For sync with PR |
| `SYNC_JSON_ON_STAGING` | Control JSON sync during staging (`true`/`false`) | Optional |

## 📤 Outputs

| Output | Description |
|--------|-------------|
| `theme_id` | ID of the deployed theme |
| `theme_name` | Name of the deployed theme |
| `preview_url` | Theme preview URL |
| `editor_url` | Theme editor URL |
| `version` | Theme version (if versioning enabled) |

## 📖 Usage Examples

> 📁 **Quick Start**: Find complete, ready-to-use workflows in the `examples/` directory:
> - `simple-setup.yml` - Basic staging/production workflow
> - `advanced-production.yml` - Full production with releases and safeguards  
> - `live-sync.yml` - Sync with custom patterns and notifications
> - `live-sync-minimal.yml` - Simplest sync configuration

### Staging Deployment

Deploy to staging when pushing to the `staging` branch:

```yaml
name: Deploy to Staging

on:
  push:
    branches: [staging]
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - uses: ShopLab-Team/shopify-theme-deployment-manager@v1
        with:
          mode: staging
          build_enabled: true
        env:
          SHOPIFY_CLI_THEME_TOKEN: ${{ secrets.SHOPIFY_CLI_THEME_TOKEN }}
          SHOPIFY_STORE_URL: ${{ secrets.SHOPIFY_STORE_URL }}
          STAGING_THEME_ID: ${{ secrets.STAGING_THEME_ID }}
```

> 💡 **See also**: `examples/simple-setup.yml` for a complete workflow with both staging and production

#### Staging Without JSON Sync

To deploy to staging without syncing JSON files from the live theme:

```yaml
- uses: ShopLab-Team/shopify-theme-deployment-manager@v1
  with:
    mode: staging
    json_sync_on_staging: false  # Disable JSON sync
  env:
    SHOPIFY_CLI_THEME_TOKEN: ${{ secrets.SHOPIFY_CLI_THEME_TOKEN }}
    STAGING_THEME_ID: ${{ secrets.STAGING_THEME_ID }}
    # Or use environment variable:
    # SYNC_JSON_ON_STAGING: false
```

### Production Deployment

Deploy to production with backups and versioning:

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - uses: ShopLab-Team/shopify-theme-deployment-manager@v1
        with:
          mode: production
          build_enabled: true
          backup_enabled: true
          versioning_enabled: true
        env:
          SHOPIFY_CLI_THEME_TOKEN: ${{ secrets.SHOPIFY_CLI_THEME_TOKEN }}
          SHOPIFY_STORE_URL: ${{ secrets.SHOPIFY_STORE_URL }}
          PRODUCTION_THEME_ID: ${{ secrets.PRODUCTION_THEME_ID }}
```

> 💡 **See also**: 
> - `examples/advanced-production.yml` for release management, custom retention, and deployment safeguards
> - `.github/workflows/deploy-production.yml.example` for enterprise-grade production deployment with environment protection

### Live Theme Sync

Sync live theme changes back to repository:

```yaml
name: Sync Live Theme

on:
  schedule:
    - cron: '0 0 * * *'  # Daily at midnight
  workflow_dispatch:       # Manual trigger

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - uses: ShopLab-Team/shopify-theme-deployment-manager@v1
        with:
          mode: sync-live
          sync_mode: all  # Options: 'all', 'json', or 'custom'
          sync_output: pr  # Create PR for review
          sync_branch: remote_changes  # Branch to commit changes to
          sync_target_branch: staging  # Target branch for PR
          # For custom mode, specify patterns:
          # sync_mode: custom
          # sync_only_globs: |
          #   templates/*.json
          #   sections/*.liquid
          #   assets/*.css
        env:
          SHOPIFY_CLI_THEME_TOKEN: ${{ secrets.SHOPIFY_CLI_THEME_TOKEN }}
          SHOPIFY_STORE_URL: ${{ secrets.SHOPIFY_STORE_URL }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

#### How Live Sync Works

1. **Pulls changes** from your live Shopify theme
2. **Commits changes** to the `sync_branch` (default: `remote_changes`)
3. **Creates or updates a PR** from `sync_branch` to `sync_target_branch` (default: `staging`)
4. **Prevents duplicate PRs** - if a PR already exists, it updates the existing one

> **Important**: The `remote_changes` branch should NOT be protected to allow the action to push changes directly.

> 💡 **Tip**: See example workflows:
> - `examples/live-sync-minimal.yml` for basic setup
> - `examples/live-sync.yml` for automated schedules and PR creation  
> - `examples/live-sync-comprehensive.yml` for advanced configuration with workflow inputs, Slack integration, and detailed PR comments

## ⚙️ Configuration

### Theme Access Token

1. Go to your Shopify admin panel
2. Navigate to **Apps** → **Develop apps**
3. Create a private app with theme management permissions
4. Copy the theme access token
5. Add it as `SHOPIFY_CLI_THEME_TOKEN` in your repository secrets

### Store URL Configuration

You have two options for providing your store URL:

**Option 1: Plain text in workflow (less secure)**
```yaml
with:
  store: my-store.myshopify.com
```

**Option 2: GitHub Secret (recommended for security)**
```yaml
env:
  SHOPIFY_STORE_URL: ${{ secrets.SHOPIFY_STORE_URL }}
# Omit 'store' input when using this method
```

> **Security Note**: Using `SHOPIFY_STORE_URL` as a secret prevents your store domain from being exposed in public repositories.

### Finding Theme IDs

```bash
# Install Shopify CLI
npm install -g @shopify/cli @shopify/theme

# List themes
shopify theme list --store=my-store.myshopify.com

# Output:
# ID          NAME                  STATUS
# 123456789   Staging               unpublished
# 987654321   Production            live
```

### Slack Notifications

1. Create a Slack webhook:
   - Go to https://api.slack.com/apps
   - Create new app → From scratch
   - Add **Incoming Webhooks** feature
   - Create webhook for your channel
2. Add webhook URL as `SLACK_WEBHOOK_URL` secret

## 🔧 Advanced Configuration

### Custom Build Steps

```yaml
- uses: ShopLab-Team/shopify-theme-deployment-manager@v1
  with:
    mode: staging
    store: my-store  # Optional if using SHOPIFY_STORE_URL secret
    build_enabled: true
    build_node_version: 18
    build_package_manager: yarn
    build_command: |
      yarn install --frozen-lockfile
      yarn build:css
      yarn build:js
    build_cwd: ./theme
```

### Selective File Sync

```yaml
- uses: ShopLab-Team/shopify-theme-deployment-manager@v1
  with:
    mode: sync-live
    store: my-store  # Optional if using SHOPIFY_STORE_URL secret
    sync_mode: custom  # Use custom patterns
    sync_only_globs: |
      config/settings_data.json
      templates/product.json
      sections/header.json
```

### Production Safeguards

```yaml
- uses: ShopLab-Team/shopify-theme-deployment-manager@v1
  with:
    mode: production
    store: my-store  # Optional if using SHOPIFY_STORE_URL secret
    deploy_allow_live_push: false  # Require PRODUCTION_THEME_ID
    deploy_ignore_json_on_prod: true  # Preserve merchant customizations
```

## 🐛 Troubleshooting

### Common Issues

#### "Theme not found" Error
- Verify the theme ID is correct
- Ensure the theme exists in your store
- Check token permissions

#### "Rate limit exceeded" Error
- The action automatically retries with exponential backoff
- Consider reducing deployment frequency
- Check Shopify API status

#### Build Failures
- Ensure dependencies are properly specified
- Check Node.js version compatibility
- Verify build command syntax

#### Sync Conflicts
- Review PR for conflicts
- Manually resolve if needed
- Consider adjusting sync frequency

### Debug Mode

Enable debug logs:

```yaml
- uses: ShopLab-Team/shopify-theme-deployment-manager@v1
  with:
    mode: staging
    store: my-store
    dry_run: true  # Test without making changes
  env:
    ACTIONS_STEP_DEBUG: true
```

## 🔒 Security

### Best Practices

- **Never commit tokens**: Always use GitHub Secrets
- **Hide store URLs**: Use `SHOPIFY_STORE_URL` secret instead of plain text
- **Limit token scope**: Only grant necessary permissions
- **Review PRs**: Manually review sync PRs before merging
- **Use branch protection**: Require reviews for production branches
- **Audit deployments**: Enable Slack notifications for visibility

### Recommended Secret Setup

For maximum security, use secrets for all sensitive data:

```yaml
env:
  SHOPIFY_CLI_THEME_TOKEN: ${{ secrets.SHOPIFY_CLI_THEME_TOKEN }}
  SHOPIFY_STORE_URL: ${{ secrets.SHOPIFY_STORE_URL }}  # Hide store domain
  STAGING_THEME_ID: ${{ secrets.STAGING_THEME_ID }}
  PRODUCTION_THEME_ID: ${{ secrets.PRODUCTION_THEME_ID }}
  SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

This approach ensures no sensitive information is exposed in your workflow files.

## 📈 Performance

The action includes:
- **Parallel operations** where possible
- **Automatic retries** with exponential backoff
- **Rate limit handling** to respect Shopify API limits
- **Efficient file transfers** using glob patterns
- **Smart caching** of Shopify CLI installation

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Add tests for new features
4. Ensure all tests pass
5. Submit a pull request

## 🔒 Security

### Security Features

- **Fork Protection**: Workflows automatically skip on forked PRs to prevent secret exposure
- **Input Sanitization**: All inputs are sanitized to prevent injection attacks
- **Secret Management**: All sensitive data stored in GitHub Secrets
- **HTTPS Only**: All API communications use HTTPS with SSL verification
- **Token Scoping**: Support for minimal permission tokens
- **Audit Logging**: All deployments logged in GitHub Actions

### Best Practices

1. **Use GitHub Environments** for production with protection rules
2. **Enable manual approval** for production deployments
3. **Rotate tokens regularly** (every 90 days recommended)
4. **Use separate tokens** for staging and production
5. **Monitor deployments** with Slack notifications
6. **Test with dry-run** before production deployments

See [SECURITY.md](SECURITY.md) for detailed security guidelines and production deployment examples.

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Shopify CLI](https://github.com/Shopify/cli) for theme management
- [GitHub Actions](https://github.com/features/actions) for automation
- Community contributors and testers

## 📞 Support

- 📖 [Documentation](https://github.com/ShopLab-Team/shopify-theme-deployment-manager/wiki)
- 🐛 [Issue Tracker](https://github.com/ShopLab-Team/shopify-theme-deployment-manager/issues)
- 💬 [Discussions](https://github.com/ShopLab-Team/shopify-theme-deployment-manager/discussions)

---

Made with ❤️ by shoplab.cc for the Shopify developer community
