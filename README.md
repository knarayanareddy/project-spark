# Morning Briefing Bot (Refactored)

A production-grade, secure AI orchestration system for generating personalized "Executive Briefings". Built for hackathon reliability with strict schema stability and zero-hallucination guardrails.

## 🌟 Features

- **Secure Orchestration**: All AI calls and provider interactions happen server-side (Supabase Edge Functions).
- **Canonical Schema**: Strict adherence to a stable JSON structure for cross-component reliability.
- **Provider Adapters**: Professional-grade adapters for **fal.ai** (TTS + AI-Avatar) and **Runware** (B-roll images).
- **Zod Validation**: No silent failures; all AI outputs are validated against strict rules (sequential IDs, grounding checks).
- **AppSec Hardening**:
  - **RLS Lockdown**: Tables restricted to Service Role only.
  - **Deep Sanitization**: Automatic redaction of secrets (API keys, tokens) and PII from user data and logs.

## 🏗️ Architecture

- **Frontend**: React, Vite, Tailwind, Shadcn/UI.
- **Database**: Supabase (PostgreSQL) with RLS enabled.
- **Edge Functions**:
  - `generate-script`: LLM orchestration with deep sanitization.
  - `start-render`: Sequential media rendering pipeline with error isolation.
  - `job-status`: Real-time status polling.

## 🚀 Setup & Deployment

### 1. Environment Variables
Copy `.env.example` to `.env` and fill in:
- `OPENAI_API_KEY`: For script generation.
- `FAL_KEY`: For avatar video generation.
- `RUNWARE_API_KEY`: For B-roll images.
- `INTERNAL_API_KEY`: Secure key for Edge Function authentication.

### 2. Database Migrations
Run the migrations in `supabase/migrations/` to set up the schema and lock down RLS.

### 3. Edge Functions
Deploy via Supabase CLI:
```bash
supabase functions deploy generate-script --no-verify-jwt
supabase functions deploy start-render --no-verify-jwt
supabase functions deploy job-status --no-verify-jwt
```

## 🧪 Development Flow
1. **Mock Mode**: Enabled by default in the UI. Uses local `mockData.ts` to simulate the full flow without API credits.
2. **Live Mode**: Requires your `INTERNAL_API_KEY` to be entered in the UI.

## 🛡️ Security Notes
- **Never committed**: `.env` is ignored by git.
- **Sanitization**: All user data is passed through `sanitizeDeep()` which truncates long fields and redacts common secret patterns.
- **Validation**: If the LLM generates an invalid grounding source ID or non-sequential segments, the system rejects the output (Zero-Hallucination).
