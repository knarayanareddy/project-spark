# Release Candidate Hardening: Current State Report

## Architecture Overview
- **Frontend**: React (Vite) + Tailwind CSS + Shadcn/UI.
- **Backend**: Supabase Edge Functions (Deno runtime).
- **Database**: Supabase PostgreSQL with RLS enforced.
- **Package Manager**: `npm`.
- **Local Dev**: `npm run dev`.

## Supabase Orchestration
- **Endpoints**:
  - `generate-script`: LLM-based briefing generation (OpenAI).
  - `start-render`: Media rendering orchestration (Runware + fal.ai).
  - `job-status`: Polling endpoint for rendering progress.
- **Tables**:
  - `briefing_scripts`: Stores sanitized user input and generated JSON.
  - `render_jobs`: Tracks the overall state of the rendering process.
  - `rendered_segments`: Stores the final asset URLs (video/image) and error logs.
- **RLS Status**: 
  - All direct client access is locked down (Service Role only).
  - Migration `20260321141500_tighten_rls_policies.sql` dropped all permissive `USING(true)` policies.

## Secrets & Injection
- **Local**: Environment variables in `.env` (ignored by git).
- **Production**: Supabase vaulted secrets set via `supabase secrets set`.
- **Injection**: Accessed via `Deno.env.get()` in Edge Functions.
- **Protection**: `sanitizeDeep()` utility redacts secrets/PII before logging or LLM calls.

## AI Provider Usage
- **Scripting**: OpenAI (GPT-4o-mini).
- **B-roll**: Runware (Image Inference, taskType: `imageInference`).
- **Avatar**: fal.ai (2-step pipeline: TTS + AI-Avatar).
- **VEED**: Stubbed out (feature flag default: `fal`).

---

# System Contract: Canonical Schema v1.0

The frontend and backend strictly adhere to the following Zod-validated schema.

## 1. Script Schema (JSON)
```json
{
  "script_metadata": {
    "persona_applied": "string",
    "total_estimated_segments": "integer"
  },
  "timeline_segments": [
    {
      "segment_id": 1,
      "dialogue": "string",
      "grounding_source_id": "string",
      "runware_b_roll_prompt": "string | null",
      "ui_action_card": {
        "is_active": "boolean",
        "card_type": "weather_widget|calendar_join|email_reply|github_review|jira_open|link_open",
        "title": "string",
        "action_button_text": "string",
        "action_payload": "string"
      }
    }
  ]
}
```

## 2. Card Type Contract
Allowed `card_type` values:
- `weather_widget`
- `calendar_join`
- `email_reply`
- `github_review`
- `jira_open`
- `link_open`

## 3. Grounding Contract
---

# Milestone 2 — Demo Unbreakable

## Objective
Upgrade the system to a "demo-unbreakable" state by implementing asynchronous rendering, unified authentication, and robust LLM recovery (repair/fallback).

## 📂 Proposed Changes

### 🛡️ Phase 1 — Unified Auth
- **File**: `supabase/functions/_shared/auth.ts` (NEW)
- **Files to Modify**: `generate-script`, `start-render`, `job-status`.
- **Logic**: A single `authorizeRequest` helper that prioritizes Supabase Session (JWT) and falls back to `internal_key`.

### ⚡ Phase 2 — Async Rendering & Locking
- **Files**:
  - `supabase/functions/render-worker/index.ts` (NEW)
  - `supabase/functions/_shared/renderPipeline.ts` (NEW)
- **Migration**: Add `locked_at`, `locked_by`, `heartbeat_at` to `render_jobs`.
- **Logic**: `start-render` returns `job_id` immediately; background work uses `EdgeRuntime.waitUntil` or manual `render-worker` ticks.

### 📊 Phase 3 — Progress Payload
- **Files**: `supabase/functions/job-status/index.ts`
- **Payload**: Include `progress: { total, complete, percent_complete, ... }`.

### 🤖 Phase 4 — Script Reliability
- **Files**:
  - `supabase/functions/_shared/fallbackScript.ts` (NEW)
  - `supabase/functions/generate-script/index.ts`
- **Logic**: Repair prompt upon validation failure; deterministic fallback if repair fails.

### 💻 Phase 5 — Frontend Sync
- **Files**: `src/pages/Index.tsx`, `src/lib/api.ts`
- **UI**: Add progress bar and "Resume Render" manual trigger.

## 🔄 UI Flow (Sequence)
1. **User** clicks "Generate Briefing" -> `generate-script` returns script.
2. **User** clicks "Render Media" -> `start-render` returns `job_id` (Fast).
3. **Frontend** polls `job-status` every 3s -> Progress bar fills.
4. **If stuck**: User clicks "Resume Render" -> Calls `render-worker`.

---

# Milestone 3 — Connectors + Two-Stage Planning

## Objective
Enable the morning briefing to be generated from real data sources (RSS, GitHub, Gmail) using a deterministic segment planner and a per-segment LLM realization process.

## 📂 Connector Data Model
- **`connector_connections`**: Stores user-provider links and non-sensitive metadata (e.g., selected RSS feeds or GitHub repos).
- **`connector_configs`**: Stores provider-specific configuration (RSS feed lists, keywords).
- **`synced_items`**: The "normalized event store" for ingested items (news, emails, PRs). Deduplicated and indexed by `occurred_at`.
- **`briefing_user_state`**: Tracks `last_briefed_at` for delta-based generation (only new content since last run).

## 🚀 Two-Stage Generation Pipeline
1. **Deterministic Planner (Code)**:
   - Takes `user_data` and rules (caps per bucket).
   - Produces a `segment_plan` (list of what to generate, with facts and grounding IDs).
   - No LLM hallucination here.
2. **LLM Realizer (OpenAI)**:
   - Processes **one plan item at a time**.
   - Contracts: Use ONLY the provided facts; use ONLY the provided grounding IDs.
   - Outputs a single canonical segment.

## 🔄 User Data Assembly
- **Source of Truth**: `assemble-user-data` edge function pulls from `synced_items` (filtering by `last_briefed_at`).
- **Ranking**: Deterministic code-based scoring (keyword match + recency).
- **Minimization**: Only top N items (3-5) are sent to the LLM to keep context small and accurate.

## 🛡️ Security & Privacy
- **Encryption**: GitHub PATs (if used for demo) are stored encrypted or via Supabase Secrets.
- **Minimization**: Never store full email bodies. Only IDs + snippets.
- **Sanitization**: All ingested content is redacted via `sanitizeDeep` before LLM/Logs/DB Display.

---

# Milestone 4 — Connector Security + Rich Segments

## Objective
Make the Morning Briefing Bot safer (no plaintext tokens), more correct (canonical schema + grounding validated end-to-end), more “product-like” (richer deterministic planning segments), and more connector-real (RSS IDs stable/safe; GitHub query correct; optional Gmail MVP).

## 📂 Token Storage & Security
- **No Client SELECT**: Connector secrets (PATs, tokens) will move to a strictly Service-Role-only table (`connector_secrets`).
- **Encryption**: Secrets are encrypted server-side using AES-GCM and a `CONNECTOR_SECRET_KEY` environment variable before insertion.
- **Data Model Changes**:
  - `supabase/migrations/20260321160000_connector_secrets.sql` (NEW) - Creates the `connector_secrets` table.
- **Edge Functions**:
  - `supabase/functions/set-connector-secret/index.ts` (NEW) - Endpoints to securely encrypt and store tokens.
  - `supabase/functions/_shared/crypto.ts` (NEW) - AES-GCM encryption helpers.
- **UI Changes**: `src/pages/Connectors.tsx` will be modified to call `set-connector-secret` instead of directly upserting plaintext PATs into `connector_connections`.

## 🛡️ Stable Source IDs
- **Problem**: `btoa()` can throw on unicode and create collisions.
- **Solution**: Replace `btoa()` with a SHA-256 hex digest helper (`stableId.ts`).
- **Files Modified**: 
  - `supabase/functions/_shared/stableId.ts` (NEW)
  - `supabase/functions/sync-news/index.ts`
  - `supabase/functions/sync-github/index.ts`

## 🚀 Richer, Deterministic Planning
- **Problem**: Planner produces a 1:1 segment item mapping, hallucinates action card placeholders, and generates wrapping segments with unbound IDs.
- **Solution**: 
  - Introduce `_digest` segment types.
  - Dynamically populate real action links (`is_active: true`) or strictly remove them (`is_active: false`).
  - Constrain `runware_b_roll_prompt` hints to only highly-cinematic segments.
- **Files Modified**: `supabase/functions/_shared/planner.ts`.

## 🧠 Realizer & Generate-Script Hardening
- **Problem**: LLM prompt injects unstructured data and can randomly deviate from the schema.
- **Solution**: Refactor `realizer.ts` strictly to use structured messages enforcing `ui_action_card` immutability and allowing nullable `runware_b_roll_prompt`.
- **Validation**: `generate-script` will rigorously validate the final script and grounding IDs.
- **Files Modified**: 
  - `supabase/functions/_shared/realizer.ts`
  - `supabase/functions/generate-script/index.ts`

## 📧 Gmail Metadata-Only Hook (Feature Flag)
- Implement MVP `sync-gmail` behind `ENABLE_GMAIL` flag. Only extracts IDs, snippet, subject, sender. No email bodies.

- [ ] Script successfully validates against `validateBriefingScript` on generation.

---

# Milestone 5A — Briefing Profiles & Module Catalog

## Objective
Add a product-grade personalization layer where a user selects from a catalog of briefing modules (persisted as "briefing profiles"). The system deduces required connectors, data buckets, and planner caps dynamically without hallucination logic.

## 📦 Module Catalog Concept (Code-First Manifest)
- A single source of truth (`supabase/functions/_shared/moduleCatalog.ts`) defines an array of highly structured modules.
- **Example Modules**: `weather`, `calendar_today`, `inbox_triage`, `github_prs`, `github_mentions`, `jira_tasks`, `ai_news_delta`, `newsletters_digest`, `focus_plan`, `watchlist_alerts`.
- **Properties Per Module**:
  - `label`, `description`: UI display strings.
  - `requiredConnectors`: Array mapping strictly to `[{ provider: "rss", optional: boolean }]` rules.
  - `requiredUserDataBuckets`: Payload mapping targets ensuring downstream functions (`assemble-user-data`) correctly populate metrics (e.g., `["news_items"]`).
  - `defaultSettings`: Configures item retrieval bounds (`caps`), filter keywords, etc.
  - `allowedCardTypes`: Validated subset of `ui_action_card.card_type` security policy (e.g., `["github_review"]`).

## 🗄️ Profile Schema Mapping
The DB remains unaware of complex catalog nuances, storing strictly user state metadata.
- **`briefing_profiles`**: Users build profiles mapping exactly to the UUID. Stores the `enabled_modules` JSON array containing string identifiers mapping to the code catalog, and `module_settings` overriding specific module `defaultSettings`.
- **`briefing_module_state`**: A highly granular tracking layer tracking `last_seen_at` per `module_id` per `user_id`, replacing coarse-grained daily runs.

## 🔌 Connector & Planner Mappings
- **Connector Resolver**: Before running `assemble-user-data`, the system reads the chosen profile, fetches the enabled modules from the catalog, computes a `Set` of required connectors, and halts generation instantly if mandatory connector tokens are inactive.
- **Data Bucket Mappings**: Instructs `assemble-user-data` to only SQL SELECT ranges directly requested by the unified `requiredUserDataBuckets` array, dropping expensive irrelevant lookups.
- **Planner Rules (Caps)**: The `planner.ts` deterministic caps (`CAPS.github_pr: 2`) become dynamically inherited overrides derived structurally from `profile.module_settings[module_id].caps` (or resorting to the Catalog manifest baseline).

---

# Milestone 5B — Profile-Aware Assembly + Connector Status

## Objective
Make `assemble-user-data` profile-aware: derive required buckets from the profile's enabled modules, build grounded `connector_status[]` objects for each provider, and use per-module `last_seen_at` for delta windows.

## `connector_status` Shape & Grounding

Each entry is a grounded, hallucination-safe object emitted into `user_data`:

```ts
{
  source_id: "connector_github_status",  // deterministic, no LLM involvement
  provider: "github" | "rss" | "google" | "jira" | "calendar",
  connected: boolean,
  last_sync_time_iso: string | null,
  status: "active" | "missing" | "error",
  message: string   // safe, human-readable — sanitized before output
}
```

- `source_id` is always `"connector_<provider>_status"` — stable, deterministic.
- The planner reads these to emit a "connector missing" segment grounded to this `source_id`, never fabricating URLs or data.
- `message` is code-generated (e.g. `"GitHub connector not linked."`) — never from user input.

## Assembled Buckets
- Only buckets required by `enabled_modules` are populated; all others return `[]`.
- `ai_news_delta` → `news_items` since `briefing_module_state.last_seen_at` (or 12h ago).
- `github_prs` → `github_prs` from `synced_items` type `github_pr`.
- `inbox_triage` → `emails_unread` from `synced_items` type `email` (empty if connector absent).

## Delta Window
- `briefing_module_state.last_seen_at` is read here but only updated after successful briefing generation (in `generate-script`).

---

# Milestone 5C — Module-Driven Deterministic Planner

## Objective
Refactor `planner.ts` so that segment generation is driven by the profile's `enabled_modules` and capped by `module_settings` (falling back to `moduleCatalog.defaultSettings`). No filler, no invented facts, no `#` placeholders.

## Segment Ordering
1. **Weather** (if `weather` module enabled and data present)
2. **Calendar** (if `calendar_today` enabled; one segment per event up to `caps`)
3. **News Digest + Items** (if `ai_news_delta` enabled; digest first, then individual items)
4. **GitHub Digest + Items** (if `github_prs` enabled; digest first, then individual PRs)
5. **Email Digest + Items** (if `inbox_triage` enabled; digest first, then individual emails)
6. **Focus Plan** (if `focus_plan` enabled and actionable items exist)
7. **Wrap** (always last; grounded to real source_ids from earlier segments)

## Caps
- Default caps come from `MODULE_CATALOG[moduleId].defaultSettings.caps`.
- Profile can override per-module via `profile.module_settings[moduleId].caps`.
- If caps override is not a positive integer, the catalog default is used.

## Grounding Integrity
- Every `grounding_source_ids` entry **must** be a `source_id` present in `user_data`.
- The wrap segment references only `source_ids` emitted by earlier plans.
- No `action_payload` of `"#"` — use `is_active: false` + `action_payload: ""` when no real URL exists.

---

# Milestone 5D — Profile-Driven generate-script + Module State Updates

## Objective
Wire `generate-script` to accept a `profile_id`, internally assemble data via `assemble-user-data`, run the module-driven planner, realize segments with a tightened realizer, validate the full script, then **atomically** update `briefing_module_state.last_seen_at` per enabled module only on success.

## Request Shape
```
POST generate-script
{ profile_id?: string, user_preferences?: object, user_data?: object }
```
- If `profile_id` present → server fetches the profile + calls assemble-user-data internally.
- If absent → falls back to caller-supplied `user_data` (mock mode unchanged).

## Realizer Tightening
- Structured system+user message split — system enforces schema; user message carries facts only.
- `ui_action_card` is ALWAYS post-overwritten from `plan.ui_action_suggestion` — LLM cannot mutate it.
- `runware_b_roll_prompt` forced to `null` when `b_roll_hint` is null.
- If LLM output fails Zod parse: one repair call, then deterministic code fallback.

## Module State Update Contract
- `briefing_module_state` is upserted **only** after `briefing_scripts` INSERT succeeds.
- Per-module timestamps:
  - `ai_news_delta`: `last_seen_at` = newest `published_time_iso` of included news items (or `now()`).
  - `github_prs`, `inbox_triage`, all others: `last_seen_at` = `now()`.
- Failure at any point before INSERT → no state update → next run re-fetches same window.

---

# Milestone 5E — Briefing Builder UI (Module Selector)

## Objective
A polished `/briefing-builder` page where users select modules, configure per-module settings, see live connector status, and generate a briefing from a saved profile.

## Route: `/briefing-builder`
- **Left panel**: Profile selector dropdown + "New Profile" button.
- **Main grid**: 10 module cards, each toggleable.
- **Module card**: label, description, connector requirement pills, connector status pill, expandable settings panel.
- **Bottom bar**: "Sync Sources", "Generate Briefing" (calls `generate-script` with `profile_id`).

## Settings Forms
- `ai_news_delta`: keywords (tag input, max 30, each ≤40 chars), max_items (1–10).
- `github_prs`: max_prs (1–10).
- `inbox_triage`: max_emails (1–10).
- Validation: client-side guard + server-side (upsert-profile validates caps).

## Connector Status Display
- Pulled from `assemble-user-data` meta `connector_status_summary` after page load.
- Pill: green "Active", amber "Missing", red "Error".
- Missing → CTA button "Go to Connectors".

## Security
- No secrets stored in localStorage — only `profile_id` (UUID).
- No connector tokens ever passed through UI state.

---

# Milestone 5F — Production Hardening

## Objective
Add safety rails for cost and security, expand actions without write-back risk, and improve system observability.

## 📂 Usage & Quotas
- **`briefing_usage_limits`**: Tracks `generate_count` and `render_count` per user per day.
- **Enforcement**: `generate-script` and `start-render` check quotas before processing and return `429 Too Many Requests` when exceeded.

## 🛡️ Audit Logging
- **`audit_events`**: Logs internal-key and user-driven events: `generate_script`, `start_render`, `sync_news`, `sync_github`, `sync_gmail`, `set_connector_secret`.
- **Privacy**: No tokens, PII, or sensitive metadata are logged.

## 🚀 Action Card Expansion (Save to Reading List)
- **`save_reading_list`**: New canonical `card_type`.
- **`reading_list` table**: Stores `user_id`, `source_id`, `title`, `url`.
- **RLS**: Strictly owner-access only.

## 🔄 Background Sync
- **Sync on Generate**: `generate-script` triggers a background `sync-news` run to ensure fresh content without blocking the user.

---

## Milestone 6 — Canonical Module Manifest

### Rationale: Prevent Drift + Spoofing
To scale features efficiently and securely, we are moving the "Source of Truth" for module definitions to the server edge. 
- **Anti-Drift**: One single definition file (`moduleManifest.ts`) controls what the UI displays, what data `assemble-user-data` fetches, and what the planner iterates.
- **Anti-Spoofing**: The server strictly validates `module_settings` and `enabled_modules`. Clients can no longer inject unknown modules or bypass setting constraints (like `caps`).

### Core Components
- **`moduleManifest.ts`**: The canonical registry of all 10 modules. Defines Zod schemas for settings and UI metadata.
- **`profileMigration.ts`**: Handles versioning of user profiles to ensure forward/backward compatibility.
- **`/get-module-catalog`**: A new endpoint for the UI to fetch its configuration dynamically.

### Profile Versioning
`briefing_profiles` now includes a `module_catalog_version`. Profiles are migrated on-read or on-write:
- **Client ahead**: Reject request (ask user to update app).
- **Server ahead**: Automatically strip invalid modules and apply defaults for new settings.

### UI Consumption
The Briefing Builder UI no longer hardcodes the module list. It fetches the manifest and renders:
- Toggles based on available `id`s.
- Settings forms based on `settingsUi` metadata (e.g., whether to show a numeric "caps" input or keyword list).

---

# Milestone 7A — Connector Health & Telemetry

## Objective
Add a production-leaning “operations layer” to track sync attempts, successes, and failures deterministically, and to enforce safe backoff/cooldowns.

## 📂 Data Model
### `connector_health`
- **Purpose**: Current state of a user's connection to a provider.
- **Fields**: `user_id`, `provider`, `status` (active/error/missing/revoked), `connected` (bool), `last_attempt_at`, `last_success_at`, `consecutive_failures`, `next_retry_at`, `cooldown_until`.
- **Constraint**: PRIMARY KEY (user_id, provider).
- **RLS**: Owner SELECT only. All writes via Service Role.

### `connector_sync_runs`
- **Purpose**: Historical log of every sync attempt.
- **Fields**: `id`, `user_id`, `provider`, `started_at`, `finished_at`, `outcome` (success/failed/skipped), `items_found`, `items_upserted`, `error_code`, `error_message`, `meta` (JSONB).
- **RLS**: Owner SELECT only.

## 🚀 Backoff & Cooldown Strategy
- **Exponential Backoff**: `next_retry_at` is computed as `base * 2^consecutive_failures`.
- **Bounds**: Min 1 minute, Max 1 hour.
- **Cooldown**: Manual reconnect or specific error resolution resets the state.

## 🔄 Integration
- **`assemble-user-data`**: Now sources `connector_status[]` objects directly from `connector_health`.
- **`sync-*` Functions**: Every sync run now calls `recordSyncAttemptStart` and either `recordSyncSuccess` or `recordSyncFailure`.
- Privacy: Error messages are truncated to 300 chars and sanitized. No tokens or PII are ever logged in telemetry tables.

---

# Milestone 7B — Sync Orchestrator

## Objective
Generate briefings with the freshest data by syncing only the connectors required by the selected profile's enabled modules.

## 📂 Mapping & Logic
- **Discovery**: The orchestrator reads the profile, looks up `requiredConnectors` in the `moduleManifest`, and builds a unique set of providers to sync.
- **Backgrounding**: Uses `EdgeRuntime.waitUntil` in `generate-script` to ensure sync continues even after the script assembly response is sent.
- **Budget**: High-impact, fast connectors (RSS) are synced synchronously (limit 1-2s) to improve immediate brief quality.

## 🛡️ Locking & Concurrency
- **Strategy**: Reuses `connector_health.cooldown_until` as a lightweight atomic lock.
- **Implementation**: `UPDATE connector_health SET cooldown_until = now() + interval '30 seconds' WHERE user_id=? AND provider=? AND (cooldown_until is null OR cooldown_until < now())`.
- **Idempotency**: Prevents multiple rapid clicks from spawning redundant sync processes.

## 🔌 Syncer Refactor
- Sync logic is moved to `_shared/syncers/` as pure TypeScript functions, allowing both direct function calls (orchestrator) and HTTP triggered edge functions (manual sync).

---

# Milestone 7C — Preview Plan

## Objective
Provide a cost-free, deterministic preview of the briefing structure to build user trust and enable debugging without triggering LLM or media generation costs.

## 🔒 Security & Privacy
- **Truncation**: Titles/subjects are truncated to 60 chars.
- **Redaction**: No body text or snippets are included in the preview.
- **Action Cards**: Only `title` and `button_text` are exposed; the full `payload` is omitted.

## 📊 Response Shape
- **Plan Summary**: Includes total segment counts and a breakdown by module.
- **Ordered List**: A sequence of `segment_kind`, `title`, and `grounding_source_ids`.
- **Connector Health**: Includes the `connector_status[]` from `assemble-user-data` to highlight why certain modules might be empty.

## ⚙️ Execution
- Uses the shared `planner.ts` logic directly.
- Triggers a background `sync-required-connectors` to ensure subsequent generation has fresh data.

---

# Milestone 8A — Scheduled Sync + RSS caching

## Objective
Automate connector background refresh for production readiness and optimize RSS bandwidth usage via conditional GET (ETag/Last-Modified).

## 🕒 Scheduling
- **Trigger**: An Edge Function `scheduled-sync` protected by `x-internal-api-key`.
- **Worker**: Can be invoked by Supabase Cron (pg_net) or an external periodic ping.
- **Batching**: Processes users with active profiles, checking required providers and respecting `connector_health` backoff.

## 📡 RSS Efficiency (Conditional GET)
- **Table**: `rss_feed_state` tracks `etag` and `last_modified` per (user, url).
- **Process**:
    1. Send `If-None-Match` (ETag) or `If-Modified-Since` (Last-Modified).
    2. Handle `304 Not Modified` -> Skip parsing/upserting.
    3. Handle `200 OK` -> Parse items and update headers in state.

## ⚡ Sync-on-Generate
- Always background (`waitUntil`) to prevent UX blocking.
- If data is extremely stale (> 2h), a short-timeout (800ms) synchronous RSS check may be performed as a "last minute refresh".

---

# Milestone 8B — Plan hash caching

## Objective
Reuse previously generated briefing scripts when the deterministic plan is identical across multiple generation requests, providing instant responses and zero LLM cost for repeats.

## 🔑 Cache Key (Plan Hash)
- **Inputs**: 
  - `segment_kind`
  - `grounding_source_ids` (sorted)
  - `facts`: Essential fields only (titles, URLs, timestamps).
  - `ui_action_suggestion`: Title and button text.
- **Algorithm**: SHA-256 hex of the stable JSON representation.
- **Scope**: User-specific.

## 🕒 TTL & Invalidation
- **TTL**: 12 hours.
- **Invalidation**: New `synced_items` or changes to `module_settings` will naturally change the `plan_hash` generated by the planner, thus "invalidating" the old cache.

## 📊 Logic
1. Assemble data -> Plan segments.
2. Compute `plan_hash`.
3. Query `briefing_scripts` for matching `user_id` + `plan_hash` created in last 12h.
4. If found: Return cached `script_json` immediately.
5. If not found: Realize via LLM, store with `plan_hash`, and return.

---

# Milestone 8C — Segment asset cache

## Objective
Reduce rendering latency and costs by reusing previously generated avatar videos and B-roll images when the inputs (dialogues, prompts, and persona) are identical.

## 🔑 Cache Keys
- **Avatar Asset Key**: `sha256(dialogue + persona_title + voice + provider_model_version)`
- **B-Roll Asset Key**: `sha256(prompt + width + height + provider_model_version)`
- **Scope**: User-specific. We do **not** share assets across users to ensure private dialogue remains private.

## 📊 Logic
1. For each segment in the render pipeline:
   - Compute the `asset_key` for B-roll (if prompt exists).
   - Check `rendered_asset_cache` for `user_id` + `asset_key`.
   - If found: Use the cached `url` and update `last_used_at`.
   - If not found: Generate the asset, store it in the cache, and use the new URL.
   - Repeat the same for Avatar Video.

## 🕒 TTL & Cleanup
- **TTL**: 7 days (default).
- **Cleanup**: An optional maintenance function can delete entries based on `last_used_at` to stay within storage quotas.

---

# Milestone 8D — Watchlist rules

## Objective
Implement a deterministic "monitoring system" where users define rules (keywords, repos, senders) to filter and prioritize briefing content without LLM hallucinations.

## 🛠️ Rule Schema
Each rule is stored in `watch_rules` as JSON:
- **`inbox_triage`**: `{ "include_senders": [], "subject_keywords": [] }`
- **`github_prs`**: `{ "repos": [], "require_review": boolean }`
- **`ai_news_delta`**: `{ "include_keywords": [], "exclude_keywords": [] }`

## 📊 Enforcement Flow
1. **Assembly**: `assemble-user-data` fetches rules per profile.
2. **Filtering**: Before grouping items, we filter `synced_items` against these rules.
   - If an item matches an "exclude" rule, it's discarded.
   - If an item matches an "include" rule, it's flagged as `high_priority`.
3. **Planning**: The planner treats `high_priority` items as "Must Include" segments (pinned to top).
4. **Grounding**: Since filtering happens on `synced_items` (which are already grounded), the final segments remain perfectly grounded to the original sources.
