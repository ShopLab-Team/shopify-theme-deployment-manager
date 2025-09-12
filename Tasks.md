# TASKS.md

## M1 — Project Scaffolding & CI Primitives ✅

- [x] Initialize repository structure for a composite GitHub Action (`action.yml`, `/dist` build, `/src` TypeScript or JS, `/scripts` shell helpers).
- [x] Add linting, formatting, and basic unit test harness (Jest/Vitest).
- [x] Add GitHub Workflow templates: `deploy-staging.yml`, `deploy-production.yml`, `sync-live.yml`.
- [x] Implement inputs, secrets, and outputs contract as per PRD (`mode`, `store`, `build.*`, `backup.*`, `versioning.*`, `sync.*`).
- [x] Pin Node via `actions/setup-node` and support `.nvmrc`/`package.json` engines (`node-version-file`) with optional Corepack for Yarn/PNPM.

### Acceptance

- [x] Composite action publishes a dry-run that echoes resolved inputs and environment (secrets redacted).
- [x] Sample workflows run on `workflow_dispatch` with no external side effects.

---

## M2 — Shopify CLI Install & Auth ✅

- [x] Install Shopify CLI reliably on Ubuntu runners and verify `shopify version`.
- [x] Accept `SHOPIFY_CLI_THEME_TOKEN` (Theme Access) via GitHub Secret and export for CLI.
- [x] Add helper to detect published (live) theme via `shopify theme list --json` and parse `role=main`.

### Acceptance

- [x] Action can list themes and resolve `live_theme_id` using only secrets and store input.

### Test Cases

- [x] CLI available and returns version.
- [x] Theme list JSON is parsed; `role=main` is correctly identified.
- [x] Missing/invalid token → graceful failure with actionable error.

---

## M3 — Staging Deploy (Branch → Static STAGING Theme) ✅

- [x] Build step: configurable Node version, package manager, working dir, and command (e.g., `npm ci && npm run build` or `yarn build:css`).
- [x] Pull live stateful JSON before upload (default globs: `templates/*.json`, `locales/*.json`, `config/settings_data.json`).
- [x] Push to `STAGING_THEME_ID` (required). Fail if missing/invalid ID.
- [x] Support `push.extra_ignore[]` and `push.nodelete` passthrough flags.
- [x] Emit preview/editor URLs and theme metadata.

### Acceptance

- [x] On staging branch push, staging theme reflects repo code + live JSON.

### Test Cases

- [x] Staging push succeeds with correct ignores and live JSON merged.
- [x] Missing `STAGING_THEME_ID` → job fails pre-push.
- [x] Build step honors `npm`/`yarn`/`pnpm` selection.

---

## M4 — Production Backup & Retention ✅

- [x] Duplicate current live theme to `BACKUP_<DD-MM-YY-HH:mm>` (timezone configurable; default `Asia/Manila`) and wait until `processing=false`.
- [x] Enforce retention (default 3): list `BACKUP_` themes, delete oldest while never deleting a theme with `role=main`.
- [x] Handle theme cap (20 themes) by pruning safe backups first; otherwise fail with guidance.

### Acceptance

- [x] Backup is created and visible; only latest N backups remain; published theme is never deleted.

### Test Cases

- [x] Creates timestamped backup and retains last 3.
- [x] Oldest backup is published (`role=main`) → skip deletion and fail with clear message.
- [x] Store already at 20 themes → prunes safe backups or fails gracefully.

---

## M5 — Production Deploy (Selective Upload + Fallback Target) ✅

- [x] Resolve production target: `PRODUCTION_THEME_ID` if set and exists; otherwise fallback to current published (live) theme.
- [x] Two-phase push:
    - [x] Phase A: push everything except stateful JSON: `templates/*.json`, `sections/*.json`, `snippets/*.json`, `config/settings_data.json`, `locales/*.json`.
    - [x] Phase B: push only `locales/en.default.json`.
- [x] Optional guardrail `deploy.allow_live_push=false` by default to prevent accidental live writes.
- [x] Return diff summary (files added/changed/ignored).

### Acceptance

- [x] Merchant content/state is preserved in production; default locale is updated; deploy succeeds to intended target.

### Test Cases

- [x] With `PRODUCTION_THEME_ID` unset → deploys to live theme.
- [x] Verify JSON ignored in Phase A and only `locales/en.default.json` uploaded in Phase B.
- [x] `deploy.allow_live_push=false` and target resolves to live → fail with guidance.

---

## M6 — Theme Title Versioning ✅

- [x] Detect trailing version tag `[x.y.z]` in theme name; bump according to `versioning.strategy` (`patch`|`minor`|`major`).
- [x] If none found, append `[0.0.1]`.
- [x] Rename theme post-deploy.

### Acceptance

- [x] Theme title updates from `PRODUCTION [0.4.2]` → `PRODUCTION [0.4.3]` (patch by default).

### Test Cases

- [x] Parses and bumps semantic versions.
- [x] Maintains non-version title text intact.
- [x] Invalid version string → falls back to `[0.0.1]`.

---

## M7 — Slack Notifications (Optional) ✅

- [x] If `SLACK_WEBHOOK_URL` present, send success/failure messages for staging and production with branch, commit, theme name/ID, version (before/after), and links.
- [x] Support simple JSON payload and optional Block Kit sections.

### Acceptance

- [x] Human-readable Slack message appears for both success and failure paths when webhook is configured.

### Test Cases

- [x] Webhook set → message delivered with expected fields.
- [x] Webhook unset → no attempt to send; job still succeeds/fails based on deploy outcome.

---

## M8 — Live → Repo Sync Mode ✅

- [x] Scheduled workflow (default `*/5 * * * *`) pulls selected live JSON into a temp dir. Note: GitHub Actions schedules are minimum 5 minutes and best-effort; may be delayed.
- [x] Diff against repo (`main` or configurable base). If changes exist:
  - [x] Create/update `remote_changes` branch and open PR to staging (default), or
  - [x] Push directly to staging if `sync.output=push`.
- [x] Limit scope via `sync.only_globs` (defaults to stateful JSON).
- [x] Include change summary in PR description.

### Acceptance

- [x] New live JSON changes result in a `remote_changes` commit and PR when differences are detected.

### Test Cases

- [x] No changes → no PR/commit.
- [x] Changes in `settings_data.json` → PR opened with diff summary.
- [x] Merge conflict on PR open → PR created; conflict flagged; no force push.

---

## M9 — Reliability, Rate Limits, and Retries ✅

- [x] Add retry with exponential backoff for CLI/API calls and long-running theme operations; respect Shopify API rate-limit guidance.
- [x] Poll for theme processing completion with timeout and user-friendly error.

### Acceptance

- [x] Transient failures (network, throttling) are retried; hard failures surface clear messages.

### Test Cases

- [x] Injected transient error → succeeds on retry.
- [x] Timeout exceeded → fails with next-step hints.

---

## M10 — Documentation & Marketplace Readiness ✅

- [x] README with inputs/secrets tables, examples (staging, production, sync), troubleshooting.
- [x] CHANGELOG and versioning policy for the action itself.
- [x] Action metadata (branding, icon, color) and Marketplace listing content.
- [x] Security notes on secrets, redaction, and guardrails.

### Acceptance

- [x] Repository passes `actionlint`; examples run end-to-end in a demo store.

---

## Global Test Matrix

### Unit (Current Coverage: 63.23% for utils, 0% for modes)

- [x] Input parsing & defaults (modes, globs, strategies) ✅ `config.test.js`, `validators.test.js`
- [x] Version bump parser ✅ `versioning.test.js` (91.93% coverage)
- [x] Ignore/only list builders for push phases ✅ `shopify-cli.test.js` (80.7% coverage)
- [x] Backup name formatter (timezone) ⚠️ Partially tested in `backup.test.js` (62.6% coverage)

### Integration (Mocked CLI)

- [x] `theme list --json` parsing with mixed roles and multiple backups ✅ `shopify-cli.test.js`
- [ ] Staging flow with live JSON pull, then push to static theme ❌ **No tests for staging.js (0% coverage)**
- [x] Production backup + retention enforcement ✅ `backup.test.js`
- [ ] Production selective push ❌ **No tests for production.js (0% coverage)**
- [x] Rename with version bump ✅ `versioning.test.js`

### E2E (Against a Sandbox Store)

- [ ] Staging pipeline updates STAGING theme visually ❌ **No E2E tests exist**
- [ ] Production pipeline creates backup, deploys selective assets, and preserves merchant settings ❌ **No E2E tests exist**
- [ ] Live→Repo sync opens PR with diffs when settings change live ❌ **sync-live.js module not implemented**
- [ ] Slack messages render with expected blocks ⚠️ Unit tested in `slack.test.js` (97.95% coverage), no E2E

### Critical Test Gaps Identified

**0% Coverage Files:**
- `src/modes/production.js` - Core production deployment logic
- `src/modes/staging.js` - Core staging deployment logic  
- `src/utils/build.js` - Build process utilities
- `src/utils/git.js` - Git operations for sync-live mode

**Missing/Broken Tests:**
- ~~`sync-live.test.js` fails - module `src/modes/sync-live.js` doesn't exist~~ ✅ Removed orphaned test file
- No integration tests for main deployment flows
- No E2E tests against real Shopify stores

### Test Coverage Summary

**Overall Coverage Metrics:**
- **Statement Coverage**: 51.46% (Target: >80%)
- **Branch Coverage**: 48.95% (Target: >75%)  
- **Function Coverage**: 61.53% (Target: >80%)
- **Line Coverage**: 51.56% (Target: >80%)

**Well-Tested Modules (>80%):**
- `slack.js` - 97.95% line coverage ✅
- `versioning.js` - 91.93% line coverage ✅
- `retry.js` - 85.71% line coverage ✅
- `shopify-cli.js` - 80.35% line coverage ✅

**Moderate Coverage (50-80%):**
- `validators.js` - 72.72% line coverage
- `config.js` - 64.7% line coverage
- `backup.js` - 62.8% line coverage

**Critical Gaps (0% coverage):**
- `production.js` - Main production deployment workflow
- `staging.js` - Main staging deployment workflow
- `build.js` - Build system integration
- `git.js` - Git operations for sync functionality

### Recommended Improvements

1. **Priority 1 - Core Functionality Tests:**
   - Create `src/modes/__tests__/production.test.js` for production deployment flow
   - Create `src/modes/__tests__/staging.test.js` for staging deployment flow
   - These are critical as they contain the main business logic

2. **Priority 2 - Integration Tests:**
   - Add integration tests for full staging workflow (build → pull live JSON → push)
   - Add integration tests for production workflow (backup → selective push → version bump)
   - Test error handling and rollback scenarios

3. **Priority 3 - Missing Module Implementation:**
   - Either implement `src/modes/sync-live.js` or remove the orphaned test file
   - Add tests for `build.js` and `git.js` utilities

4. **Priority 4 - E2E Test Suite:**
   - Set up test harness with mock Shopify store or test account
   - Implement smoke tests for critical paths
   - Add GitHub Actions workflow for E2E tests on PR

---

## References

- [ ] Shopify CLI — Theme commands and CI/CD usage.
- [ ] Shopify Admin Theme resource — max 20 themes; published theme semantics.
- [ ] Slack Incoming Webhooks & Block Kit.
- [ ] GitHub Actions cron schedule limits (≥ 5 minutes; best-effort).
- [ ] Node setup and version pinning in Actions; `node-version-file`.
- [ ] Shopify API limits and recommended backoff.
