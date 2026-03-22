# Silent Architect — Industrial AI Orchestration

**Silent Architect** is a high-fidelity, production-grade AI orchestration platform designed to generate complex, personalized "Executive Briefings" with absolute precision. It transforms raw data into cinematic intelligence via a suite of specialized dashboards.

![Silent Architect Dashboard](https://raw.githubusercontent.com/knarayanareddy/morning-briefing-bot-a342ed3a/main/public/banner.png) *(Note: Add your own banner here)*

## 🏛️ The Five Strategic Pillars

The platform is architected into five distinct high-fidelity views, each following a consistent 3-column strategic layout:

1.  **Briefing Builder**: The mission control for profile selection and intelligence source mapping. Features nested RSS, GitHub, and Gmail configuration cards.
2.  **Connectors Dashboard**: Real-time monitoring of all external data integrations. Features neon health status indicators, latency tracking, and system event logs.
3.  **Briefing Player (Today)**: A cinematic, HUD-driven experience for playback. Powered by the **GEN-4 Neural Stream** engine with live transcript grounding.
4.  **Developer Mode**: A system-level telemetry dashboard. Provides raw metadata inspection, edge function status (Active/Pending), and cross-tab state synchronization.
5.  **Vault Manager**: An enterprise-grade secrets manager. Handles encryption, automated rotation policies, and strict audit logging with a visual propagation flow diagram.

## 🌟 Key Features

- **Cinematic UI**: Premium dark-mode aesthetic utilizing Glassmorphism, deep navy palettes, and neon status signals.
- **Zero-Hallucination Guardrails**: Strict schema validation ensures every briefing segment is grounded in verified source data.
- **AppSec Hardening**:
    - **Supabase Vault**: All PATs and API keys are stored in hardware-level encryption (AES-256).
    - **Secure Edge Orchestration**: All AI calls occur in isolated server-side environments.
    - **RLS Isolation**: Database access restricted via Row Level Security (RLS).
- **Deep Sanitization**: Automatic redaction of secrets and Pll from all logs and user-facing views.

## 🏗️ Technical Architecture

- **Frontend**: React (Vite), Tailwind CSS, Lucide Icons, Shadcn/UI (Radix primitives).
- **Design System**: "Silent Architect" custom theme (index.css) using the **Outfit/Inter** typography variants.
- **Backend**: Supabase (PostgreSQL), Edge Functions (Deno/TypeScript).
- **APIs**: OpenAI (Script Generation), Fal.ai (Cinematic Video), Runware (B-roll generation).

## 🚀 Setup & Deployment

### 1. Configure Environment
Copy `.env.example` to `.env` and configure:
- `OPENAI_API_KEY`: Strategic script generation.
- `FAL_KEY`: Cinematic avatar video generation.
- `RUNWARE_API_KEY`: Neural B-roll synthesis.
- `INTERNAL_API_KEY`: Secure Edge Function authentication.

### 2. Deploy Infrastructure
1.  **Migrations**: Run SQL files in `supabase/migrations/` sequentially.
2.  **Edge Functions**:
    Deploy the full suite of 20+ specialized functions. These functions support both standard Supabase JWT auth and a high-performance `INTERNAL_API_KEY` mode for cross-service orchestration.

    ```bash
    # Core Orchestration
    supabase functions deploy generate-script --no-verify-jwt
    supabase functions deploy start-render --no-verify-jwt
    supabase functions deploy job-status --no-verify-jwt
    supabase functions deploy assemble-user-data --no-verify-jwt

    # Connectors & Telemetry
    supabase functions deploy connector-status --no-verify-jwt
    supabase functions deploy test-rss --no-verify-jwt
    supabase functions deploy test-github --no-verify-jwt
    supabase functions deploy test-slack --no-verify-jwt
    supabase functions deploy update-connector-config --no-verify-jwt
    supabase functions deploy disconnect-connector --no-verify-jwt

    # History & Shared Intelligence
    supabase functions deploy list-history --no-verify-jwt
    supabase functions deploy get-briefing --no-verify-jwt
    supabase functions deploy get-briefing-artifacts --no-verify-jwt
    supabase functions deploy create-share-link --no-verify-jwt

    # System Diagnostics
    supabase functions deploy system-preflight --no-verify-jwt
    supabase functions deploy connector-preflight --no-verify-jwt
    supabase functions deploy seed-dummy-intel --no-verify-jwt
    ```

## 🔐 Authentication Modes

Silent Architect supports two primary authentication models:
- **Supabase JWT**: Standard client-side authentication for browser sessions.
- **Internal Key Mode**: Uses `x-internal-api-key` and `x-user-id` headers for high-speed service-to-service calls or administrative overrides. Enable this by setting `VITE_DEMO_AUTH_MODE=internal_key` in your frontend environment.

## 🛡️ Development & Mocking
Silent Architect includes a robust **Mock Mode** for rapid UI iteration without API expenditure. Toggle the `Developer Mode` in the UI to swap between live production parity and local mock simulation.

---

### 📄 Repository & Project Links
- **Primary Repo**: [github.com/knarayanareddy/morning-briefing-bot-a342ed3a](https://github.com/knarayanareddy/morning-briefing-bot-a342ed3a)
- **Spark Project**: [github.com/knarayanareddy/project-spark](https://github.com/knarayanareddy/project-spark)

*Designed for high-stakes executive intelligence. 2026 Silent Architect Platform.*
