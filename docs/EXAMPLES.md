# 📚 Examples

This document provides configuration examples for common deployment scenarios. Each deployment mode has two example files:
- **Minimal**: Only the essential configuration required
- **Maximum**: All available options with detailed comments

For complete configuration options, see [OPTIONS.md](OPTIONS.md).

## 📁 Example Files

### Staging Deployment
- 🔹 [staging-minimal.yml](../examples/staging-minimal.yml) - Basic staging setup
- 🔸 [staging-maximum.yml](../examples/staging-maximum.yml) - Full staging configuration with all options

### Production Deployment  
- 🔹 [production-minimal.yml](../examples/production-minimal.yml) - Basic production setup
- 🔸 [production-maximum.yml](../examples/production-maximum.yml) - Full production configuration with all options

### Live Theme Sync
- 🔹 [sync-minimal.yml](../examples/sync-minimal.yml) - Basic sync setup
- 🔸 [sync-maximum.yml](../examples/sync-maximum.yml) - Full sync configuration with all options

## 🚀 Quick Start Examples

### Staging Deployment - Minimal

The absolute minimum required for staging deployment:

```yaml
name: Deploy to Staging

on:
  push:
    branches: [staging]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: ShopLab-Team/shopify-theme-deployment-manager@v1
        with:
          mode: staging
        env:
          SHOPIFY_CLI_THEME_TOKEN: ${{ secrets.SHOPIFY_CLI_THEME_TOKEN }}
          SHOPIFY_STORE_URL: ${{ secrets.SHOPIFY_STORE_URL }}
          STAGING_THEME_ID: ${{ secrets.STAGING_THEME_ID }}
```

[View full example with all options →](../examples/staging-maximum.yml)

### Production Deployment - Minimal

The absolute minimum required for production deployment:

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: ShopLab-Team/shopify-theme-deployment-manager@v1
        with:
          mode: production
        env:
          SHOPIFY_CLI_THEME_TOKEN: ${{ secrets.SHOPIFY_CLI_THEME_TOKEN }}
          SHOPIFY_STORE_URL: ${{ secrets.SHOPIFY_STORE_URL }}
          PRODUCTION_THEME_ID: ${{ secrets.PRODUCTION_THEME_ID }}
```

[View full example with all options →](../examples/production-maximum.yml)

### Live Theme Sync - Minimal

The absolute minimum required for syncing live theme changes:

```yaml
name: Sync Live Theme

on:
  workflow_dispatch:

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: ShopLab-Team/shopify-theme-deployment-manager@v1
        with:
          mode: sync-live
        env:
          SHOPIFY_CLI_THEME_TOKEN: ${{ secrets.SHOPIFY_CLI_THEME_TOKEN }}
          SHOPIFY_STORE_URL: ${{ secrets.SHOPIFY_STORE_URL }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

[View full example with all options →](../examples/sync-maximum.yml)

## 💡 Important Notes

### Built-in Features

The action includes these features **built-in** - you don't need additional workflow steps:

1. **Slack Notifications**: Automatically sent when `SLACK_WEBHOOK_URL` is provided
2. **Theme Backups**: Handled internally when `backup_enabled: true`
3. **Version Management**: Automatic tagging when `versioning_enabled: true`
4. **Retry Logic**: Automatic retries for network issues
5. **Rate Limiting**: Handled internally

### Optional Workflow Customizations

These are **optional** additions you can make in your workflow:

1. **GitHub Releases**: Create releases with the theme package output
2. **Custom Notifications**: Send to services other than Slack
3. **Deployment Metrics**: Track deployments in your monitoring service
4. **Additional Validations**: Run extra checks before/after deployment

## 🎯 Common Scenarios

### Deploy Staging Without Build

```yaml
- uses: ShopLab-Team/shopify-theme-deployment-manager@v1
  with:
    mode: staging
    build_enabled: false  # Skip build step
```

### Deploy Production With Custom Build

```yaml
- uses: ShopLab-Team/shopify-theme-deployment-manager@v1
  with:
    mode: production
    build_command: |
      yarn install --frozen-lockfile
      yarn test
      yarn build:production
```

### Sync Only JSON Files

```yaml
- uses: ShopLab-Team/shopify-theme-deployment-manager@v1
  with:
    mode: sync-live
    sync_files: json  # Only sync JSON files
```

### Deploy With Slack Notifications

```yaml
- uses: ShopLab-Team/shopify-theme-deployment-manager@v1
  with:
    mode: production
  env:
    SHOPIFY_CLI_THEME_TOKEN: ${{ secrets.SHOPIFY_CLI_THEME_TOKEN }}
    SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

### Dry Run Testing

```yaml
- uses: ShopLab-Team/shopify-theme-deployment-manager@v1
  with:
    mode: production
    dry_run: true  # Test without actual deployment
```

## 🔧 Advanced Configurations

### Combined Staging & Production Workflow

Deploy to different environments based on branch:

```yaml
name: Theme Deployment

on:
  push:
    branches: [staging, main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Set deployment mode
        id: mode
        run: |
          if [[ "${{ github.ref }}" == "refs/heads/main" ]]; then
            echo "mode=production" >> $GITHUB_OUTPUT
          else
            echo "mode=staging" >> $GITHUB_OUTPUT
          fi
      
      - uses: ShopLab-Team/shopify-theme-deployment-manager@v1
        with:
          mode: ${{ steps.mode.outputs.mode }}
          backup_enabled: ${{ steps.mode.outputs.mode == 'production' }}
        env:
          SHOPIFY_CLI_THEME_TOKEN: ${{ secrets.SHOPIFY_CLI_THEME_TOKEN }}
          SHOPIFY_STORE_URL: ${{ secrets.SHOPIFY_STORE_URL }}
          STAGING_THEME_ID: ${{ secrets.STAGING_THEME_ID }}
          PRODUCTION_THEME_ID: ${{ secrets.PRODUCTION_THEME_ID }}
```

### Scheduled Live Theme Sync

Sync changes daily at midnight:

```yaml
name: Daily Theme Sync

on:
  schedule:
    - cron: '0 0 * * *'  # Daily at midnight UTC

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: ShopLab-Team/shopify-theme-deployment-manager@v1
        with:
          mode: sync-live
          sync_type: pr
          sync_target_branch: staging
        env:
          SHOPIFY_CLI_THEME_TOKEN: ${{ secrets.SHOPIFY_CLI_THEME_TOKEN }}
          SHOPIFY_STORE_URL: ${{ secrets.SHOPIFY_STORE_URL }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Monorepo Setup

For themes in a subdirectory:

```yaml
- uses: ShopLab-Team/shopify-theme-deployment-manager@v1
  with:
    mode: staging
    build_cwd: ./packages/theme
    build_command: |
      cd ../..
      npm ci
      npm run build:theme
```

### Manual Deployment With Options

Allow manual deployment with version selection:

```yaml
name: Manual Deploy

on:
  workflow_dispatch:
    inputs:
      mode:
        description: 'Deployment mode'
        type: choice
        options:
          - staging
          - production

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: ShopLab-Team/shopify-theme-deployment-manager@v1
        with:
          mode: ${{ inputs.mode }}
        env:
          SHOPIFY_CLI_THEME_TOKEN: ${{ secrets.SHOPIFY_CLI_THEME_TOKEN }}
          SHOPIFY_STORE_URL: ${{ secrets.SHOPIFY_STORE_URL }}
          STAGING_THEME_ID: ${{ secrets.STAGING_THEME_ID }}
          PRODUCTION_THEME_ID: ${{ secrets.PRODUCTION_THEME_ID }}
```

## 📋 Required Secrets Setup

Before using any examples, configure these secrets in your repository:

### Required Secrets

1. **Go to**: Settings → Secrets and variables → Actions
2. **Add these secrets**:
   - `SHOPIFY_CLI_THEME_TOKEN` - Your Shopify theme access token
   - `SHOPIFY_STORE_URL` - Your store domain (e.g., `my-store.myshopify.com`)
   - `STAGING_THEME_ID` - Your staging theme ID (for staging mode)
   - `PRODUCTION_THEME_ID` - Your production theme ID (for production mode)

### Optional Secrets

- `SLACK_WEBHOOK_URL` - For Slack notifications
- `GITHUB_TOKEN` - Usually available by default for PR creation

## 🔍 Finding Theme IDs

```bash
# Install Shopify CLI
npm install -g @shopify/cli @shopify/theme

# List all themes
shopify theme list --store=your-store.myshopify.com

# Output will show:
# ID          NAME                  STATUS
# 123456789   Staging               unpublished
# 987654321   Production            live
```

## 💡 Tips

1. **Start with minimal examples** - Add options as you need them
2. **Use dry run for testing** - Set `dry_run: true` to test without changes
3. **Review maximum examples** - See all available options with comments
4. **Check OPTIONS.md** - For detailed documentation of each option
5. **Use GitHub environments** - For production approvals and secret management

## 📚 Next Steps

- Review [OPTIONS.md](OPTIONS.md) for detailed configuration options
- Read [SECURITY.md](SECURITY.md) for security best practices
- Check [CONTRIBUTING.md](CONTRIBUTING.md) if you want to contribute