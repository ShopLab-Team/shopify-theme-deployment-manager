# PRD — Shopify Theme Deploy & Sync GitHub Action

## 1. Summary

A GitHub Marketplace Action that standardizes Shopify theme deployments for staging and production, with safe backups, selective file uploads to preserve merchant content, optional Slack notifications, and an optional live→repo sync mode. The Action is a single, configurable package with three modes: `staging`, `production`, and `sync-live`.

---

## 2. Background & Problem

Teams need a repeatable deploy flow that:
- Mirrors live theme state (`templates/*.json`, layout JSON, locales, settings) onto a dedicated `STAGING` theme when pushing a staging branch.
- Safely deploys production from `main`/`master` with pre-deploy backups (retained to the last N) and strict guards against deleting the published theme.
- Avoids overwriting merchant content (JSON templates, settings, locales) on production pushes.
- Notifies stakeholders via Slack.
- Optionally pulls changes made directly on the live theme back into Git, keeping the repo authoritative.

---

## 3. Goals
   1. Staging deployments on branch push or manual dispatch, using Shopify CLI:
      - Build assets (configurable Node version, package manager, and build command).
      - Pull stateful JSON from the current live theme to mirror settings/structure.
      - Push code + mirrored JSON to a fixed `STAGING` theme (by ID) and fail fast if not found.
   2. Production deployments on `main`/`master` push:
      - Create timestamped `BACKUP_` theme (retain last 3; never delete the published theme).
      - Deploy to a fixed production theme by ID; if unset, fallback to the published theme.
      - Never upload stateful JSON to production except `locales/en.default.json`.
      - After deployment, bump a version tag in the theme name: e.g., `PRODUCTION [0.4.2]` → `[0.4.3]`.
   3. Slack notifications (optional) on success/failure for staging and production.
   4. Live→Repo sync (optional): on a schedule (default every 5 min), pull live theme JSON changes to a dedicated `remote_changes` branch and either open a PR or push to staging.

---

## 4. Non‑Goals
   - Replacing Shopify’s native GitHub integration.
   - Managing products, orders, or app configs.
   - Editorial review flows; we open PRs but do not include approvals UI.

---

## 5. Users & Personas
   - Theme engineers: want safe, deterministic deploys.
   - Merchant operators: want non-destructive production releases.
   - Release managers: want visibility (Slack) and fast recovery via backups.

---

## 6. Assumptions
   - The repo follows Shopify theme structure.
   - The store has the `Theme Access` app and a valid token.
   - A dedicated `STAGING_THEME_ID` exists and is not the live theme.

---

## 7. Modes & Triggers
   - `staging`: on: push to `staging` (configurable) or manual `workflow_dispatch`.
   - `production`: on: push to `main` or `master`.
   - `sync-live`: on: `schedule` (default `*/5 * * * *`) + manual `workflow_dispatch`.

---

## 8. Functional Requirements

### 8.1 Staging Deploy (mode: `staging`)

**Inputs**
- `store` (required): `your-store.myshopify.com` or prefix.
- `theme_token_secret` (required): GitHub Secret name holding `SHOPIFY_CLI_THEME_TOKEN`.
- `staging_theme_id_secret` (required): GitHub Secret name (e.g., `STAGING_THEME_ID`).
- `build.enabled` (bool, default `true`)
- `build.node-version` (default `20.x`)
- `build.package-manager` (`npm` | `yarn` | `pnpm`; default `npm`)
- `build.command` (e.g., `npm ci && npm run build`)
- `json.pull_globs` (default list: `templates/*.json`, `locales/*.json`, `config/settings_data.json`)
- `push.extra_ignore` (array of additional globs to ignore)
- `push.nodelete` (bool, default `false`)
- `slack.webhook_secret` (optional)

**Flow**
1. **Build** (if enabled): install toolchain, run build command.
2. **Discover live theme**: get ID of published theme.
3. **Pull stateful JSON** from live into the workspace using the configured globs.
4. **Push** to `STAGING_THEME_ID` with Shopify CLI. Fail the job if the theme ID is not present or invalid.
5. **Slack post** (optional): status, theme name/ID, preview URL.

**Success**
- `STAGING` theme reflects repo code + live JSON settings/state.

**Failure**
- Failure if `STAGING_THEME_ID` secret missing/invalid.

---

### 8.2 Production Deploy (mode: `production`)

**Inputs**
- `store` (required)
- `theme_token_secret` (required)
- `production_theme_id_secret` (optional) — fallback to published theme if unset.
- `build.*` (same as staging)
- `backup.enabled` (bool, default `true`)
- `backup.retention` (int, default `3`)
- `backup.prefix` (default `BACKUP_`)
- `backup.timezone` (default `Asia/Manila`)
- `deploy.ignore_json_on_prod` (bool, default `true`)
- `deploy.allow_live_push` (bool, default `false`) — guardrail against accidental live pushes when a static production theme is expected.
- `versioning.enabled` (bool, default `true`)
- `versioning.strategy` (`patch`|`minor`|`major`, default `patch`)
- `slack.webhook_secret` (optional)

**Flow**
1. **Build**.
2. **Backup current live theme**:
    - Duplicate/push to create new theme named `BACKUP_<DD-MM-YY-HH:mm>` in `backup.timezone`.
    - List `BACKUP_` themes; delete oldest until only `backup.retention` remain. Never delete a theme with `role=main`. Abort if targeted for deletion is published.
3. **Select production target**:
    - Use `PRODUCTION_THEME_ID` if set and exists; otherwise use the currently published theme ID.
4. **Selective push to production target**:
    - Default: ignore JSON content that would override merchant data: `templates/*.json`, `sections/*.json` (if present), `snippets/*.json` (if present), `config/settings_data.json`, `locales/*.json`.
    - Then only push `locales/en.default.json` in a follow-up push.
5. **Rename production theme**: bump version tag at end of name, e.g., `PRODUCTION [0.4.2]` → `[0.4.3]`. If no version present, append `[0.0.1]`.
6. **Slack post** (optional): summary, links, version before/after, target theme.

**Success**
- Latest code deployed; merchant settings and non-default locales preserved; backup present and retention enforced.

**Failure**
- Any step fails (backup creation, push, rename) → job fails and posts Slack error if configured.

---

### 8.3 Live→Repo Sync (mode: `sync-live`, optional)

**Inputs**
- `store`, `theme_token_secret`
- `sync.only_globs` (default: `templates/*.json`, `locales/*.json`, `config/settings_data.json`)
- `sync.branch` (default `remote_changes`)
- `sync.commit_message` (default `chore(sync): import live JSON changes`)
- `sync.output` (`pr` | `push`, default `pr`) — open a PR to staging or push directly to staging.

**Flow**
1. Determine live theme ID.
2. `theme pull` stateful files into a temp area.
3. Compare with repo (against `main` by default). If diffs exist, commit to `remote_changes` and either:
    - Open PR to staging (recommended), or
    - Force-push to staging (opt-in).

**Notes**
- Scheduled via cron (every 5 minutes by default). Timing is best-effort.

---

## 9. Configuration (Action Inputs & Secrets)

**Inputs**
- `mode`: `staging` | `production` | `sync-live`
- `store`
- `branch.staging` (default `staging`), `branch.production` (`main`,`master`)
- `build.node-version`, `build.package-manager`, `build.command`, `build.cwd`
- `json.pull_globs`
- `push.extra_ignore[]`, `push.nodelete`
- `backup.enabled`, `backup.retention`, `backup.prefix`, `backup.timezone`
- `deploy.ignore_json_on_prod`, `deploy.allow_live_push`
- `versioning.enabled`, `versioning.strategy`
- `sync.*` (see 8.3)

**Secrets**
- `SHOPIFY_CLI_THEME_TOKEN` (required): Theme Access token
- `STAGING_THEME_ID` (required for staging)
- `PRODUCTION_THEME_ID` (optional)
- `SLACK_WEBHOOK_URL` (optional)

---

## 10. Implementation Notes
- **Shopify CLI**: use `theme list|pull|push|rename|duplicate|delete` with `--json`, `--ignore`, `--only`, `--theme`, `--unpublished`, `--allow-live` flags.
- **Backup naming**: `BACKUP_<DD-MM-YY-HH:mm>`; configurable timezone.
- **Version bump**: Regex to extract `[x.y.z]` suffix; default to `[0.0.1]` if missing. Strategy bump (`patch`/`minor`/`major`).
- **Selective production push**: two-step push to (a) upload all except JSON files, then (b) upload only `locales/en.default.json`.
- **Build**: `actions/setup-node`, enable Corepack if `yarn`, install & run `build.command`.
- **Slack**: simple webhook POST with Block Kit sections; include `branch`, `commit`, `theme name/ID`, `preview link`, and `timings`.
- **Safety**:
    - Validate theme IDs before pushes; hard‑fail staging if `STAGING_THEME_ID` missing.
    - Refuse to delete themes with `role=main`.
    - `deploy.allow_live_push=false` by default.
    - Redact tokens in logs.

---

## 11. Edge Cases & Error Handling
- **Theme not found**: exit non‑zero; Slack error (if configured).
- **Backup retention**: if an oldest backup is `role=main`, skip deletion and fail the job with a clear message.
- **Theme limit reached (20)**: if creating a backup would exceed limits, delete excess old backups first (safe ones) or fail with guidance.
- **Long processing**: poll newly created/duplicated theme until `processing=false` or timeout.
- **Git issues in sync mode**: if repo dirty or conflicts arise, open PR instead of direct push.

---

## 12. Non‑Functional Requirements
- **Compatibility**: `Node 20+`, `npm`/`Yarn`/`pnpm`; `Ubuntu` runners.
- **Observability**: structured logs; surface CLI `editor_url` and `preview_url` in job output.
- **Performance**: staging deploy <10 min for typical themes; backups created before any production push.
- **Security**: all credentials provided via GH Secrets; no secrets echoed; optional `dry_run` input.

---

## 13. Acceptance Criteria
1.  **Staging**
    - On staging push, the Action builds, pulls live JSON, and pushes to `STAGING_THEME_ID`.
    - If `STAGING_THEME_ID` is absent/invalid, the workflow fails before push.
2.  **Production**
    - On `main`/`master` push, the Action builds and creates `BACKUP_<timestamp>`.
    - Retains only the latest 3 backups; never deletes a published theme.
    - Deploys code to `PRODUCTION_THEME_ID` (or live theme if unset), ignoring JSON except `locales/en.default.json`.
    - Renames target theme with incremented version tag.
3.  **Slack**
    - If `SLACK_WEBHOOK_URL` is present, staging and production runs post success/failure messages.
4.  **Sync‑live**
    - On schedule, if live JSON files differ from repo, a commit lands on `remote_changes` and a PR opens to staging (or direct push if configured).

---

## 14. Example Workflow Snippets (to be included in README)

### Staging
```yaml
name: Deploy – Staging
on:
  push:
    branches: ["staging"]
  workflow_dispatch: {}
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20" }
      - name: Install deps & build
        run: |
          corepack enable || true
          npm ci
          npm run build
      - name: Deploy to STAGING
        uses: ShopLab-Team/shopify-theme-deployment-manager@v1
        with:
          mode: staging
          store: ${{ vars.SHOPIFY_STORE }}
          branch.staging: staging
          json.pull_globs: |
            templates/*.json
            locales/*.json
            config/settings_data.json
        env:
          SHOPIFY_CLI_THEME_TOKEN: ${{ secrets.SHOPIFY_CLI_THEME_TOKEN }}
          STAGING_THEME_ID: ${{ secrets.STAGING_THEME_ID }}
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

### Production
```yaml
name: Deploy – Production
on:
  push:
    branches: ["main", "master"]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20" }
      - name: Install deps & build
        run: |
          corepack enable || true
          npm ci
          npm run build
      - name: Deploy to PRODUCTION
        uses: ShopLab-Team/shopify-theme-deployment-manager@v1
        with:
          mode: production
          store: ${{ vars.SHOPIFY_STORE }}
          backup.retention: 3
          backup.timezone: Asia/Manila
          deploy.ignore_json_on_prod: true
          versioning.strategy: patch
        env:
          SHOPIFY_CLI_THEME_TOKEN: ${{ secrets.SHOPIFY_CLI_THEME_TOKEN }}
          PRODUCTION_THEME_ID: ${{ secrets.PRODUCTION_THEME_ID }}
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

### Live→Repo Sync (cron)
```yaml
name: Sync live JSON → repo
on:
  schedule:
    - cron: "*/5 * * * *" # runs every 5 minutes (best effort / UTC)
  workflow_dispatch: {}
jobs:
  sync:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - name: Sync live JSON
        uses: ShopLab-Team/shopify-theme-deployment-manager@v1
        with:
          mode: sync-live
          store: ${{ vars.SHOPIFY_STORE }}
          sync.output: pr
          sync.branch: remote_changes
          sync.only_globs: |
            templates/*.json
            locales/*.json
            config/settings_data.json
        env:
          SHOPIFY_CLI_THEME_TOKEN: ${{ secrets.SHOPIFY_CLI_THEME_TOKEN }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

---

## 15. Architecture & Pseudocode

**CLI Helpers**
- `getLiveThemeId`: `shopify theme list --json` → filter `role == 'main'`.
- `ensureThemeExists(id)`: check presence in list; fail if absent.
- `createBackup(name)`: `shopify theme duplicate --theme <liveId> --name <name>`; poll until `processing=false`.
- `cleanupBackups(prefix, retention)`: list themes matching `prefix`; sort by `created_at`; delete oldest where `role!='main'` until count ≤ retention.
- `pushSelective(targetId)`:
    - First push: `theme push --theme <id> --ignore "templates/*.json" --ignore "sections/*.json" --ignore "snippets/*.json" --ignore "config/settings_data.json" --ignore "locales/*.json"`.
    - Second push: `theme push --theme <id> --only "locales/en.default.json"`.
- `renameThemeWithVersion(id)`: parse trailing `[x.y.z]`; bump; `theme rename --theme <id> --name "<new>"`.
- `pullJsonFromLive(globs[])`: `theme pull --theme <liveId> --only <glob>...` into workspace.
- `slackNotify(payload)`: `POST` to `SLACK_WEBHOOK_URL` if set.

---

## 16. Security & Compliance
- Use Theme Access token via `SHOPIFY_CLI_THEME_TOKEN` Secret.
- Never echo secrets; mask logs.
- Optional `dry_run` mode to print planned commands.
- Guardrails to avoid live pushes unless explicitly allowed.

---

## 17. Risks & Mitigations
- **Overwriting merchant content**: default production ignores JSON, pushing only `en.default.json` intentionally.
- **Theme cap (20)**: enforced by backup retention and safe deletion.
- **Schedule reliability**: cron is best-effort; also expose `workflow_dispatch` for manual sync.
- **Large themes / rate limits**: use `--only`/`--ignore` to minimize payloads; backoff with retries.

---

## 18. Open Questions
- Should the Action auto‑publish when `PRODUCTION_THEME_ID` is an unpublished theme? (Default: no, leave publish to store workflow owners.)
- Should versioning write to a repo file (e.g., `THEME_VERSION`) for auditability? (Default: theme title only.)
- Do we need a configurable allowlist to also push specific template JSON to prod (e.g., a single landing page)? (Default: off.)

---

## 19. Milestones
1.  **MVP**: `staging` + `production` modes; backups; Slack; version rename; docs.
2.  **Sync beta**: `live→repo` sync mode with PRs.
3.  **Polish**: rich Slack blocks; `dry‑run`; more diagnostics and metrics.

---

## 20. README Checklist (for Marketplace listing)
- Installation & permissions
- Secrets & inputs table
- Examples (staging, production, sync)
- Troubleshooting (tokens, theme limits, cron delays)
- Safety notes on JSON in production
