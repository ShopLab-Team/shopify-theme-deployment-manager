# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Nothing yet

## [1.1.0] - 2025-09-15

### Added
- **Security Enhancements**
  - Fork protection in workflows to prevent secret exposure
  - Comprehensive input sanitization to prevent injection attacks
  - SECURITY.md documentation with detailed guidelines
  - Production deployment workflow example with environment protection
  - Webhook URL validation and allowlisting
  - Theme ID validation (numeric only)
  - Store domain validation and normalization
  - Path traversal prevention
  - Shell metacharacter filtering

- **JSON Sync Control**
  - `json.sync_on_staging` input to control JSON sync during staging
  - `SYNC_JSON_ON_STAGING` environment variable support
  - Ability to disable JSON sync for staging deployments

- **Documentation**
  - Comprehensive live sync example (`live-sync-comprehensive.yml`)
  - Enterprise-grade production deployment example
  - Security best practices documentation
  - Updated README with all new features

### Changed
- Retry logic confirmed to never create duplicate themes
- PR creation targets the current branch (not always main)
- Test workflows now skip on forked PRs for security

### Fixed
- Removed unused imports and variables
- Fixed arrow function formatting inconsistencies
- Corrected test expectations for optional properties

## [1.0.0] - 2025-09-10

### Added
- **Core Features**
  - Multi-mode deployment system (`staging`, `production`, `sync-live`)
  - Staging deployment with JSON mirroring from live theme
  - Production deployment with selective JSON preservation
  - Live theme sync back to repository
  - Store URL can be provided as plain text input or GitHub secret
  
- **Build System**
  - Configurable build steps with npm/yarn/pnpm support
  - Node.js version selection
  - Custom build commands and working directory
  - Automatic package manager detection

- **Backup & Recovery**
  - Automatic theme backups before production deployments
  - Configurable retention policies
  - Timestamped backup naming with timezone support
  - 20-theme limit management
  - Automatic cleanup of old backups

- **Version Management**
  - Automatic semantic versioning for themes
  - Support for patch/minor/major version strategies
  - Version tag parsing and bumping
  - Theme renaming with version tags

- **Notifications**
  - Slack webhook integration
  - Rich Block Kit message formatting
  - Different templates for each deployment mode
  - Success and failure notifications
  - Deployment metrics and links

- **Safety Features**
  - Dry-run mode for testing
  - Live theme push protection
  - Input validation and sanitization
  - Rate limit handling with exponential backoff
  - Automatic retries for transient failures
  - Theme processing polling with timeout

- **Developer Experience**
  - Comprehensive error messages
  - Detailed logging with groups
  - GitHub Actions outputs for workflow chaining
  - Pull request creation for live sync
  - Example workflows for common scenarios

### Security
- Token redaction in logs
- Secure secret handling
- GitHub token scoping for PR creation
- Protected branch support

### Performance
- Parallel operations where possible
- Efficient file transfers with glob patterns
- Smart polling for theme processing
- Rate limit awareness
- Retry logic with exponential backoff

### Documentation
- Comprehensive README with examples
- Multiple example workflows
- Troubleshooting guide
- Input/output documentation

---

## Support

For questions and support:
- Open an issue: https://github.com/ShopLab-Team/shopify-theme-deployment-manager/issues
- Start a discussion: https://github.com/ShopLab-Team/shopify-theme-deployment-manager/discussions

[Unreleased]: https://github.com/ShopLab-Team/shopify-theme-deployment-manager/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/ShopLab-Team/shopify-theme-deployment-manager/releases/tag/v1.0.0
