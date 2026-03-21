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
- `grounding_source_id`: Must be a valid ID present in the sanitized user data provided to the LLM. 
- Validation: The system enforces this via `grounding.ts` in the shared Edge Function module.
