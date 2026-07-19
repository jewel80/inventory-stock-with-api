# CI/CD Deep-Dive

This document complements the [README](../README.md) with the internals of the
GitHub Actions pipeline in [`.github/workflows/ci.yml`](../.github/workflows/ci.yml):
how stages are wired, how to configure secrets/notifications, how to read the
security output, and how to extend the pipeline.

---

## 1. Pipeline at a glance

Triggered on **push to `development-dev`** and on **PRs** to `development-dev` /
`main`, plus manual `workflow_dispatch`. `concurrency` cancels superseded runs on
the same ref.

```
 lint-test-build ──▶ docker ──▶ security
                          │
                          └──▶ compose-validate

 notify  (always, after all of the above)
```

- `needs:` creates a fail-fast chain. If `lint-test-build` fails, `docker`,
  `security`, and `compose-validate` are skipped.
- `notify` runs `if: always()` so you still get a failure summary, then it fails
  the workflow if any upstream stage failed.

### Permissions

Set at the workflow level (`contents: read`) and tightened per job:

| Job | Extra permissions | Why |
|-----|-------------------|-----|
| `docker` | `packages: write` | Push images to GHCR |
| `security` | `packages: read`, `security-events: write` | Pull images to scan; upload SARIF |
| `compose-validate` | — | Builds locally; no special perms |

The GHCR login uses the built-in `GITHUB_TOKEN` — **no PAT or secret required**.

---

## 2. Stage-by-stage

### Stage 1 — `lint-test-build`
- `actions/setup-node@v4` with `cache: npm` keyed on both `package-lock.json`
  files → fast, cached installs.
- Backend: `npm ci` → `npm run lint` (ESLint) → `npm test` (Jest, 18 tests) →
  `npx prisma generate` (validates the schema compiles to a client).
- Frontend: `npm ci` → `npm run build` (Vite production build). This is the
  "build application" stage — the backend is plain Node, so it has no compile
  step beyond Prisma client generation.
- Uploads `frontend/dist` as an artifact (7-day retention).

### Stage 2 — `docker`
- `docker/setup-buildx-action` enables Buildx (layer caching).
- `docker/login-action` to `ghcr.io` with `GITHUB_TOKEN`.
- `docker/build-push-action` builds backend and frontend and pushes:
  - `ghcr.io/<owner>/inventory-<svc>:<git-sha>`
  - `ghcr.io/<owner>/inventory-<svc>:latest`
- `cache-from/cache-to: type=gha` caches layers across runs (fast rebuilds).
- `provenance: false` keeps simple single-arch manifests (cleaner for scanning).

> `<owner>` is `github.repository_owner`, lowercased (GHCR requires lowercase).

### Stage 3 — `security`
- `npm audit --audit-level=high --omit=dev` (backend is currently clean).
- **Trivy** filesystem scan (`HIGH,CRITICAL`, `exit-code: 1`) → SARIF.
- **Trivy** image scan for backend + frontend → SARIF each.
- **SBOM** (CycloneDX) of the repo.
- All three SARIF files uploaded to the **Security** tab via
  `github/codeql-action/upload-sarif@v3` (distinct `category` each).
- Reports bundled into a `security-reports` artifact (14-day retention).

### Stage 4 — `compose-validate`
The **CD proxy**: it boots the real stack and proves it becomes healthy.

1. `docker compose -f docker-compose.yml config -q` — schema validation.
2. `docker compose -f docker-compose.yml up -d --build` — build + start (base
   compose only = production-style, no dev override).
3. Polls `http://localhost:8000/health` for up to 300s.
4. Verifies `/health/ready` (DB ping) and the nginx proxy (`:9000/health`).
5. `docker compose down -v` (always) to clean the runner.

### Stage 5 — `notify`
- Writes a Markdown result table to `$GITHUB_STEP_SUMMARY`.
- Optionally emails via `dawidd6/action-send-mail@v3` (only if `MAIL_SERVER`
  secret is set).
- Fails the job if any stage reported `failure` or `cancelled`.

---

## 3. Secrets & configuration

### Required
**None.** GHCR uses the automatic `GITHUB_TOKEN`; everything else has sensible
defaults in `docker-compose.yml`.

### Optional — email notifications
Add these repository secrets, then the `notify` job will email on every run:

| Secret | Example |
|--------|---------|
| `MAIL_SERVER` | `smtp.gmail.com` |
| `MAIL_PORT` | `587` |
| `MAIL_USERNAME` | `you@gmail.com` |
| `MAIL_PASSWORD` | an app-specific password |
| `MAIL_TO` | `team@example.com` |
| `MAIL_FROM` | `ci@example.com` |

(The email step is gated on `env.MAIL_SERVER != ''`, so omitting `MAIL_SERVER`
disables it silently.)

### Optional — Slack
Add a `SLACK_WEBHOOK` secret and a Slack step (not enabled by default to keep the
workflow minimal). Example snippet:

```yaml
- name: Notify Slack
  if: always()
  uses: slackapi/slack-github-action@v1
  with:
    slack-message: "CI ${{ job.status }} for ${{ github.sha }}"
  env:
    SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}
```

---

## 4. Reading the security output

- **Security tab** → "Code scanning alerts" shows Trivy findings grouped by
  severity, with file/line references and CVE details. Each scan has its own
  `category` (`trivy-filesystem`, `trivy-image-backend`, `trivy-image-frontend`).
- **Artifacts** → download `security-reports` for the raw SARIF, the SBOM
  (`sbom.cdx.json`), and the npm audit text.

### Tuning the gate
The pipeline fails on any `HIGH` or `CRITICAL` finding. To temporarily relax:

```yaml
# In the Trivy steps, change:
severity: HIGH,CRITICAL
exit-code: "1"
# to:
severity: CRITICAL          # gate on critical only
# or scan without failing:
exit-code: "0"              # report-only
```

Prefer fixing/ upgrading over relaxing — Dependabot PRs help with that.

---

## 5. Running CI stages locally

You can reproduce every stage on your machine:

```bash
# Stage 1
cd backend && npm ci && npm run lint && npm test && npx prisma generate
cd ../frontend && npm ci && npm run build

# Stage 3 (if you have Trivy installed)
trivy fs --severity HIGH,CRITICAL .
cd backend && npm audit --audit-level=high --omit=dev

# Stage 4
docker compose -f docker-compose.yml up -d --build
curl -fsS http://localhost:8000/health
docker compose -f docker-compose.yml down -v
```

To run the workflow locally with [act](https://github.com/nektos/act):

```bash
act -W .github/workflows/ci.yml -j lint-test-build
```

---

## 6. Extending the pipeline

To add a stage, append a job and wire it into the chain with `needs:`. Example —
a build-result notification or a load test:

```yaml
loadtest:
  name: Load Test
  runs-on: ubuntu-latest
  needs: compose-validate        # run after the stack is validated
  steps:
    - run: echo "run k6 / autocannon against http://localhost:8000"
```

Remember to add the new job to `notify.needs` so its result appears in the
summary and gates the final status.

---

## 7. Common CI issues

| Problem | Cause / Fix |
|---------|-------------|
| `denied: installation not allowed` on GHCR push | Workflow missing `packages: write`, or the first push needs the package prompt accepted on github.com. |
| `upload-sarif` 403 | Job missing `security-events: write`. |
| `compose-validate` timeout | First boot syncs ~194 products; the 300s poll should cover it. If not, inspect logs (`docker compose logs`). |
| Trivy DB download slow/fails | Transient; re-run. The action caches the DB across runs. |
| Image name has uppercase → push fails | The workflow lowercases `repository_owner`; ensure no other uppercase slips into the tag. |
