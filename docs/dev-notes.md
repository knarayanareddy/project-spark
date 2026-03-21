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
