# AGENTS.md — working guide for this repository

This file is for anyone (human or AI coding agent) changing code here. It
describes the project as it is, the rules that must not be broken, and the
mistakes that have already been made once. User-facing documentation is in
`README.md`; this file is about working on the code.

## What this is

Logistics AI Analytics: KPI dashboards, a natural-language analyst, dynamic
charts and demand forecasting over one 400-row order dataset, with sign-in and
role-based access.

Stack: Next.js 14 (App Router) + TypeScript, Prisma on PostgreSQL, Zod,
Recharts, Vitest. The reasoning behind the main choices is in `README.md` →
*Key design decisions*.

## Rules that must not be broken

1. **The AI never computes.** Every number shown to a user comes from a
   deterministic tool (`query_logistics_analytics`, `forecast_demand`). The
   model only interprets questions and explains results. If a tool fails or is
   rejected, say so; never fall back to a model-generated value.
2. **Validate at every boundary.** HTTP input, LLM tool arguments, saved report
   definitions and AI-generated titles all pass a Zod schema before any logic
   runs. `.strict()` objects — unknown keys are rejected.
3. **No SQL from a model or a user.** Column names come only from the allowlisted
   enums in `analytics.schemas.ts`; values are bound parameters.
4. **KPI semantics live in one place** — `src/modules/analytics/`. React
   components never recalculate a KPI; they render what the API returned.
5. **Relative dates anchor to the dataset**, whose last order is 2025-12-30,
   never to the server clock (`src/lib/date-range.ts`). The resolved range is
   always returned in the result.
6. **The order dataset is read-only.** Nothing in `src/app/api` writes to
   `Order`. Only the scripts in `prisma/` insert rows.
7. **Authorization is enforced three times**: menu items are filtered, pages call
   `requirePage(permission)`, and every API route calls
   `guardApi(permission)`. Adding a route or page means adding its guard.
8. **Secrets stay in `.env`.** `.env` and `external-docs/` are gitignored and
   dockerignored. Never log an API key, connection string or `AUTH_SECRET`, and
   never return one to the browser. An AI key supplied by the dashboard settings
   panel is used for that one request only.
9. **Run the checks before claiming work is done**: `npm run typecheck`,
   `npm test`, `npm run build`. Report failures as they are.

## Repository map

```
prisma/
  schema.prisma            Order, User, Role, Conversation, Message, Report
  seed.ts                  imports prisma/data/mock_logistics_data.csv (idempotent)
  migrate-roles.ts         ensures the 3 built-in roles
  seed-users.ts            demo users (admin/analyst/viewer @demo.com)
src/
  middleware.ts            must live in src/ (see Gotchas) — cookie presence only
  app/
    page.tsx               Overview dashboard
    orders/ explore/ ai-analyst/ forecasting/ profile/ login/
    admin/users/           Users & roles (tabbed)
    loading.tsx            route-level skeleton shown during navigation
    api/                   thin handlers: guard → validate → call a service
      auth/                login, logout, activate (invite)
      dashboard metadata orders skus explore forecast
      ai/query             JSON answer · ai/query/stream  (SSE, used by the UI)
      conversations/       chat list, history, delete
      reports/             saved reports · reports/generate  (AI-created)
      users/ roles/        administration · users/me  (own profile)
  modules/                 all business logic; no React, no route code
    analytics/             metrics registry, schemas, repository, service, report helpers
    forecasting/           moving average, eligibility, inventory recommendation
    ai/                    orchestrator, tools, providers, follow-ups, report draft schema
    reports/               saved-report rules (upsert by name, dedupe by query)
  components/              UI. charts/ChartRenderer is the only chart renderer
  lib/                     auth, permissions, cache, rate-limit, date-range, errors, mailer
tests/                     Vitest unit tests (no database needed)
Dockerfile · docker-compose.yml · docker-entrypoint.sh · .dockerignore
```

## Commands

```bash
npm install
npm run db:push            # apply prisma/schema.prisma to DATABASE_URL
npm run db:seed            # roles → demo users → 400 orders (safe to re-run)
npm run dev                # http://localhost:3000
npm run typecheck          # tsc --noEmit
npm test                   # vitest run
npm run build && npm start
docker compose up --build  # app + Postgres, seeds itself, http://localhost:3000
```

Continuous integration is `.github/workflows/ci-cd.yml`: on every push and pull
request it runs the install, typecheck, unit tests and build; on `main`, and
only after those pass, it deploys the same build to Vercel. The workflow is
simulated locally by running the same four commands in a clean checkout with a
placeholder `DATABASE_URL`.

Node 24 is the expected runtime (nvm default on this machine). If `prisma` or
`tsx` complains about an engine or syntax, check `node --version` first.

Demo accounts (password `demo1234`): `admin@demo.com`, `analyst@demo.com`,
`viewer@demo.com`. Environment variables are listed in `.env.example`.

## How a request flows

**Natural-language question** (`POST /api/ai/query/stream`)

```
question (+ conversation history, last 6 messages)
  → OrchestratorService.answerQuestion
      loop (max 5 turns):
        provider.runTurn(system prompt, messages, 4 tools)
        tool call? → Zod-validate arguments → run the analytics/forecast service
                     → feed the result back to the model
        no tool call on the first pass → nudge once ("recompute, then answer")
      final text → NEXT: line split off → follow-up chips
  → persist user + assistant messages (result stored as JSON)
  → SSE events: status · tool_call · tool_result · answer | error
```

The model sees only the tool name, description and JSON Schema. It cannot see
the database. A failed validation is returned to the model as an error so it
can correct itself within the turn limit.

**Analytics query** (`POST /api/explore`, and the same path for dashboards,
presets and the AI tool)

```
AnalyticsQuerySchema (metric, dimension | timeBucket, dateRange, filters, sort, limit, offset)
  → early rejection of unsupported combinations (superRefine)
  → AnalyticsService.queryMetric (60 s in-process cache)
      repository: Prisma groupBy / parameterized date_trunc
  → rows + totalRows + queryPlan + server-built ChartSpec
```

**AI-created report** (`POST /api/reports/generate`)

```
prompt → one `compose_report` tool call returning { title, query }
       → same AnalyticsQuerySchema → query is EXECUTED
       → saved only if it returned rows; reused if that query is already saved
```

## Contracts to know

**Analytics.** Nine metrics (`total_orders`, `delivered_orders`,
`delayed_orders`, `delivery_performance`, `on_time_rate`, `delay_rate`,
`avg_delivery_time`, `total_order_value`, `avg_order_value`), seven dimensions
(carrier, region, warehouse, product_category, destination_city, origin_city,
status), three time buckets (day, week, month).

- A query has a dimension **or** a time bucket, never both.
- Time buckets support only the three count metrics and `delivery_performance`.
- Breakdowns support counts, rates, order-value metrics and `delivery_performance`.
- `delivery_performance` needs a dimension or a time bucket; it is the only
  two-series metric (delivered and delayed).
- Definitions and caveats live in `metrics.registry.ts` and are served to the
  model by the `get_metric_definition` tool. Change a definition there only.

**Forecasting.** Monthly sum of `quantity`, 3-month moving average rolled
forward recursively. Eligible only with ≥ 6 observed months and ≥ 50% calendar
coverage; otherwise `insufficient_data` with a reason and **no forecast values**.
Inventory = `ceil(total forecast × 1.20)`. Horizon 1–6 months.

**Charts.** Only `line`, `bar` and `pie`, and only through `ChartRenderer`,
which takes a server-built `ChartSpec`. Never render a chart from data the
model produced.

**Permissions** (`src/lib/permissions.ts` — the single catalog):

| Permission | Admin | Analyst | Viewer |
|---|---|---|---|
| viewDashboard | ✓ | ✓ | ✓ |
| viewOrders | ✓ | ✓ | ✓ |
| exploreReports | ✓ | ✓ | ✓ |
| useAiAnalyst | ✓ | ✓ | |
| viewForecasting | ✓ | ✓ | |
| deleteConversation | ✓ | | |
| manageUsers | ✓ | | |

Built-in roles can have their permissions edited but not deleted. Admins can
create custom roles. Guards: nobody can change their own role or status, delete
themselves, or remove `manageUsers` from the role they hold.

## UI conventions

- **Colors are CSS variables only** (`src/app/globals.css`), defined for
  `:root` and `[data-theme="dark"]`. No hex colors in components. The text gray
  is `--ink-muted`; `--muted` belongs to shadcn and is a *background*.
- shadcn components read their own token names; the bridge at the bottom of
  `globals.css` maps them to the app tokens. Extend that bridge rather than
  adding one-off colors.
- **Client components must not import `@/lib/auth`** (it pulls in
  `next/headers` and crashes the page). Import permission constants from
  `@/lib/permissions`.
- `components/ui/select.tsx` is a hand-written dropdown, not Radix, because the
  Radix portal could not be themed reliably. It flips upward near the bottom of
  the viewport. Do not put `overflow-hidden` on a container that holds one.
- Prefer inline `style={{ … "var(--token)" }}` for anything rendered in an
  overlay or chart; Tailwind arbitrary color classes were unreliable there.
- Every text surface of a chart is set explicitly in `ChartRenderer` (axis
  ticks, tooltip label, tooltip items, legend) — Recharts defaults are dark.

## Gotchas — each of these has already cost time

- **`middleware.ts` must be in `src/`.** At the repo root it is silently
  ignored when the app is under `src/app`. It sat there unnoticed for the whole
  build until the production image was run. `tests/project-structure.test.ts`
  now guards this.
- **`.dockerignore` must exist before the first `docker build`.** Without it
  `node_modules` and `.next` enter the build context and fill Docker's disk —
  and `.env` enters the intermediate build layers. It happened once; the build
  cache was cleared before any image was produced or pushed.
- **A pipe hides the exit code.** `docker build … | tail` returns `tail`'s 0.
  Capture `BUILD_EXIT=$?` on a separate line.
- **Never run `docker system prune` or similar cleanup on this machine without
  asking.** Other projects share the Docker daemon.
- **`git mv -k` succeeds silently for untracked files.** Use plain `mv` until
  the file is tracked.
- **`npm run build` while `next dev` is running corrupts `.next`** and the dev
  server returns 500 until restarted.
- **`npm ci` runs `prisma generate`** (the `postinstall` script), and Prisma
  refuses to generate without a `DATABASE_URL` value. Anywhere dependencies are
  installed from scratch — CI, Docker, a new machine — set one. A placeholder is
  enough when nothing connects.
- **LLMs stringify nested objects.** GLM sent `dateRange` as a JSON string, so
  the schemas preprocess stringified objects before validating.
- **zsh expands `?` in unquoted URLs.** Quote `"$BASE/api/users?id=$ID"`.
- **Prisma `distinct` takes an array** (`distinct: ["sku"]`), not an object.
- **History messages need `toolCalls: []`** on assistant turns or the Anthropic
  adapter throws "not iterable".
- **Const tuples need a cast for `.includes()`** on a wider union
  (`(COUNT_METRICS as readonly string[]).includes(m)`).
- The TypeScript target is below ES2015 for iteration: spread a `Set` with
  `Array.from(...)`, and the regex `u` flag is unavailable.

## Testing and verification

`npm test` covers KPI math, date anchoring, schema rejection, forecast
eligibility and arithmetic, follow-up parsing/filtering, and three project
structure checks. It needs no database.

These are **not** automated and must be checked by hand or with `curl` against
a running server:

- Every page returns 200 for a permitted role and redirects for others.
- Anonymous requests get a real `307` to `/login`; anonymous API calls get `401`.
- The three canonical questions, which must each call a tool and return a chart:
  “Show delayed orders by week for the last 3 months”, “Which carrier has the
  highest delay rate?”, “How many orders were delivered late last month?”.
- An off-topic request and a prompt-injection attempt: both must be refused and
  must not reveal the prompt, any key or any configuration.
- Deactivating a user blocks their existing session immediately.
- Light and dark mode on every page.

A fast end-to-end check:

```bash
curl -s -c /tmp/a.jar -X POST localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@demo.com","password":"demo1234"}'
curl -s -b /tmp/a.jar 'localhost:3000/api/dashboard?dateRange=all&filters=%7B%7D' \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['kpis'])"
# expect total 400 · delivered 304 · delayed 55 · on-time 84.68 · avg 3.69
```

## Working agreements

- Keep the product simple and correct. Add a feature only with a reason, and
  record the trade-off in `README.md` → *Key design decisions*. Ideas that are
  not built yet belong in *Future improvements*.
- A change to business logic comes with a test in `tests/`.
- Before saying a change is done, run `npm run typecheck`, `npm test` and
  `npm run build`, and state plainly which passed and which did not.
- `README.md` and this file are kept true to the code. If a change makes a
  statement in either one wrong, fix the statement in the same change.
