# Security Policy

## Overview

This GitHub Action handles sensitive Shopify theme deployments and requires proper security configuration to protect your store and source code.

## Security Features

### 1. **Fork Protection**
- The action should NOT run on pull requests from forked repositories
- Secrets are not available to forked PRs by default in GitHub Actions
- Use `pull_request_target` with caution or avoid it entirely

### 2. **Secret Management**
- All sensitive data must be stored as GitHub Secrets
- Never hardcode tokens or credentials in workflows
- Required secrets:
  - `SHOPIFY_CLI_THEME_TOKEN` - Shopify theme access token
  - `STAGING_THEME_ID` - Staging theme identifier (optional)
  - `PRODUCTION_THEME_ID` - Production theme identifier (optional)
  - `SLACK_WEBHOOK_URL` - Slack notification webhook (optional)
  - `GITHUB_TOKEN` - Automatically provided by GitHub Actions

### 3. **Token Scoping**
- Use Shopify theme access tokens with minimal required permissions
- Create separate tokens for staging and production if possible
- Rotate tokens regularly (recommended: every 90 days)

### 4. **Workflow Permissions**
- Limit GitHub Action permissions to minimum required
- For sync-live mode with PR creation:
  ```yaml
  permissions:
    contents: write
    pull-requests: write
  ```
- For deployment modes:
  ```yaml
  permissions:
    contents: read
  ```

## Security Best Practices

### 1. **Protect Production Deployments**
```yaml
# Require manual approval for production
jobs:
  deploy:
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    environment: production  # Requires environment protection rules
```

### 2. **Prevent Fork Execution**
```yaml
# Option 1: Explicitly check for forks
jobs:
  deploy:
    if: github.event.pull_request.head.repo.full_name == github.repository
```

```yaml
# Option 2: Use workflow conditions
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
    types: [opened, synchronize]

jobs:
  test:
    # Skip on forked PRs
    if: github.event_name == 'push' || github.event.pull_request.head.repo.full_name == github.repository
```

### 3. **Environment Protection Rules**
Set up GitHub environment protection rules:
1. Go to Settings → Environments
2. Create `staging` and `production` environments
3. Configure:
   - Required reviewers for production
   - Deployment branches (only main/master)
   - Environment secrets specific to each environment

### 4. **Audit Logging**
- All deployments are logged in GitHub Actions
- Use Slack notifications for deployment tracking
- Monitor Shopify theme activity logs

### 5. **Input Validation**
The action validates all inputs to prevent injection attacks:
- Store URLs are normalized and validated
- Theme IDs must be numeric
- File paths are sanitized

## Security Checklist

Before going live, ensure:

- [ ] All secrets are stored in GitHub Secrets (not in code)
- [ ] Fork protection is enabled in workflows
- [ ] Production environment requires manual approval
- [ ] Shopify tokens have minimal required permissions
- [ ] Environment-specific secrets are configured
- [ ] Workflow permissions are minimized
- [ ] Regular token rotation schedule is established
- [ ] Monitoring and alerting is configured
- [ ] Test workflows use dry-run mode
- [ ] No sensitive data in logs (action masks secrets)

## Vulnerability Reporting

If you discover a security vulnerability, please:
1. **DO NOT** create a public issue
2. Email security concerns to your team's security contact
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

## Token Security

### Creating Secure Shopify Tokens
1. Use Shopify CLI to generate theme access tokens
2. Scope tokens to specific stores when possible
3. Never commit tokens to version control
4. Use different tokens for different environments

### GitHub Token Permissions
The automatically provided `GITHUB_TOKEN` should have minimal permissions:
```yaml
permissions:
  contents: read        # Basic read access
  pull-requests: write  # Only if creating PRs
  actions: read         # Read action logs
```

## Network Security

### API Communication
- All Shopify API calls use HTTPS
- SSL/TLS verification is enforced
- No custom certificate acceptance

### Rate Limiting
- Built-in retry logic with exponential backoff
- Respects Shopify API rate limits
- Prevents overwhelming target systems

## Compliance

### Data Protection
- No customer data is accessed or stored
- Only theme files are processed
- Temporary files are cleaned up after execution
- No sensitive data persisted between runs

### Audit Trail
- All deployments logged in GitHub Actions
- Deployment metadata includes:
  - User who triggered deployment
  - Timestamp
  - Source branch/commit
  - Target theme
  - Success/failure status

## Example Secure Workflow

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

# Minimal permissions
permissions:
  contents: read
  
jobs:
  deploy:
    name: Deploy to Production
    runs-on: ubuntu-latest
    # Use environment protection
    environment: production
    # Prevent fork execution
    if: github.repository == 'YourOrg/YourRepo'
    
    steps:
      - uses: actions/checkout@v4
      
      - uses: ShopLab-Team/shopify-theme-deployment-manager@v1
        with:
          mode: production
          dry_run: false
        env:
          # All secrets from environment
          SHOPIFY_CLI_THEME_TOKEN: ${{ secrets.SHOPIFY_CLI_THEME_TOKEN }}
          PRODUCTION_THEME_ID: ${{ secrets.PRODUCTION_THEME_ID }}
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

## Security Updates

- Regular dependency updates via Dependabot
- Security patches applied promptly
- Follow semantic versioning for security fixes:
  - Patch: Non-breaking security fixes
  - Minor: Security improvements with new features
  - Major: Breaking changes for security reasons

## Questions or Concerns?

If you have security questions or need assistance with secure configuration, please consult your security team or DevOps engineers before deploying to production.
