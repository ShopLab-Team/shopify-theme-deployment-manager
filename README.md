# 🚀 Shopify Theme Deploy & Sync Action
[![Test](https://github.com/ShopLab-Team/shopify-theme-deployment-manager/actions/workflows/test.yml/badge.svg)](https://github.com/ShopLab-Team/shopify-theme-deployment-manager/actions/workflows/test.yml)

A powerful GitHub Action for automated Shopify theme deployment with staging/production workflows, live theme synchronization, and comprehensive backup management.

## ✨ Key Features

- **🎭 Multi-Environment Deployment**: Separate staging and production workflows
- **🔄 Live Theme Sync**: Pull live theme changes back to your repository with PR creation
- **💾 Automatic Backups**: Create timestamped backups with retention policies
- **🏷️ Version Management**: Automatic version incrementing (X.YY.ZZ format with auto-rollover)
- **📦 Build Integration**: Support for npm, yarn, and pnpm build steps
- **✅ Theme Check**: Built-in validation with Shopify Theme Check
- **🎁 Release Packages**: Automatic theme packaging for GitHub releases
- **🔔 Slack Notifications**: Rich notifications for deployment events
- **🛡️ Safety Guards**: Prevent accidental live theme overwrites
- **🔁 Smart Retry Logic**: Automatic retries with exponential backoff
- **🔒 Enterprise Security**: Fork protection, input sanitization, and secure secret handling

## 📖 Documentation

- **[Configuration Options](docs/OPTIONS.md)** - Complete reference for all inputs and outputs
- **[Examples](docs/EXAMPLES.md)** - Minimal and advanced usage examples
- **[Security](docs/SECURITY.md)** - Security best practices and guidelines
- **[Contributing](docs/CONTRIBUTING.md)** - Development and contribution guidelines

## 🚀 Quick Start

### 1. Set Up Secrets

Add these secrets to your repository (Settings → Secrets → Actions):

- `SHOPIFY_CLI_THEME_TOKEN` - Your Shopify theme access token ([How to get it](#getting-a-theme-access-token))
- `SHOPIFY_STORE_URL` - Your store domain (e.g., `my-store.myshopify.com`)
- `STAGING_THEME_ID` - Your staging theme ID ([How to find it](#finding-theme-ids))
- `PRODUCTION_THEME_ID` - Your production theme ID (for production mode)

### 2. Choose Your Deployment Type

#### Staging Deployment

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

[View full example with all options →](examples/staging-maximum.yml)

#### Production Deployment

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

[View full example with all options →](examples/production-maximum.yml)

#### Live Theme Sync

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

[View full example with all options →](examples/sync-maximum.yml)

### 3. Deploy

Push to your configured branch:
- Push to `staging` → Deploys to staging theme
- Push to `main` → Deploys to production with backups
- Run workflow manually → Sync live theme changes

## 🎯 Use Cases

### Staging Deployment
Deploy to a staging theme for testing before production. Optionally syncs JSON files from live theme to keep content in sync.

### Production Deployment
Deploy to production with automatic backups, auto-incrementing version numbers, and optional Slack notifications. Preserves merchant customizations.

### Live Theme Sync
Pull changes made directly in Shopify admin back to your repository. Creates PRs for review or pushes directly to a branch.

> 📚 See [EXAMPLES.md](docs/EXAMPLES.md) for more examples and advanced scenarios.

## ⚙️ Configuration

### Getting a Theme Access Token

1. Go to your Shopify admin → **Apps** → **Develop apps**
2. Create a private app with theme management permissions
3. Copy the theme access token
4. Add as `SHOPIFY_CLI_THEME_TOKEN` secret

### Finding Theme IDs

```bash
# Install Shopify CLI
npm install -g @shopify/cli @shopify/theme

# List themes
shopify theme list --store=my-store.myshopify.com
```

### Available Modes

| Mode | Description | Required Secrets |
|------|-------------|------------------|
| `staging` | Deploy to staging theme | `STAGING_THEME_ID` |
| `production` | Deploy to production with backups | `PRODUCTION_THEME_ID` |
| `sync-live` | Pull live changes to repository | `GITHUB_TOKEN` |

> 🔧 See [OPTIONS.md](docs/OPTIONS.md) for complete configuration reference.

## 🛡️ Security

- **Never commit tokens** - Always use GitHub Secrets
- **Use branch protection** - Require reviews for production
- **Enable notifications** - Monitor deployments with Slack
- **Regular token rotation** - Rotate tokens every 90 days

> 🔒 See [SECURITY.md](docs/SECURITY.md) for detailed security guidelines.

## 📁 Example Workflows

Ready-to-use workflow examples are available in the `examples/` directory:

### Minimal Examples (Start Here)
- [`staging-minimal.yml`](examples/staging-minimal.yml) - Basic staging setup
- [`production-minimal.yml`](examples/production-minimal.yml) - Basic production setup
- [`sync-minimal.yml`](examples/sync-minimal.yml) - Basic sync setup

### Maximum Examples (All Options)
- [`staging-maximum.yml`](examples/staging-maximum.yml) - Full staging configuration
- [`production-maximum.yml`](examples/production-maximum.yml) - Full production configuration
- [`sync-maximum.yml`](examples/sync-maximum.yml) - Full sync configuration

> 💡 **Tip**: Start with minimal examples and add options as needed. Maximum examples show all available options with detailed comments.

## 🐛 Troubleshooting

### Common Issues

**Theme not found**: Verify theme ID and token permissions

**Rate limits**: Action automatically retries with exponential backoff

**Build failures**: Check Node.js version and build command

**Sync conflicts**: Review PRs and resolve manually

### Debug Mode

Enable detailed logs:

```yaml
- uses: ShopLab-Team/shopify-theme-deployment-manager@v1
  with:
    mode: staging
    dry_run: true  # Test without changes
  env:
    ACTIONS_STEP_DEBUG: true
```

## 📈 Performance

- **Parallel operations** for speed
- **Smart retries** with exponential backoff
- **Rate limit handling** for Shopify API
- **Efficient file transfers** using glob patterns
- **Cached dependencies** for faster builds

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](docs/CONTRIBUTING.md) for guidelines.

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 📞 Support

- 📖 [Documentation](https://github.com/ShopLab-Team/shopify-theme-deployment-manager/wiki)
- 🐛 [Issue Tracker](https://github.com/ShopLab-Team/shopify-theme-deployment-manager/issues)
- 💬 [Discussions](https://github.com/ShopLab-Team/shopify-theme-deployment-manager/discussions)

---

Made with ❤️ by [ShopLab](https://shoplab.cc) for the Shopify developer community