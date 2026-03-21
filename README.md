# Morning Briefing Bot

An AI-powered "Executive Briefing" application that generates personalized video briefings with AI avatars, B-roll imagery, and interactive action cards.

## 🚀 Getting Started

### Prerequisites
- [Bun](https://bun.sh/) or Node.js installed.
- Supabase Project with Edge Functions enabled.
- API keys for OpenAI, Runware, and fal.ai (or VEED).

### Environment Variables
Copy `.env.example` to `.env` and fill in the required values.

### Local Development
1. Install dependencies: `bun install`
2. Start development server: `bun dev`
3. Serve Supabase functions locally: `supabase functions serve`

## 🏗️ Architecture

- **Frontend**: React 18, Vite, Tailwind CSS, Shadcn/UI.
- **Backend**: Supabase Edge Functions (`generate-script`, `start-render`, `job-status`).
- **AI Pipeline**:
  - **Text**: OpenAI GPT-4o-mini.
  - **Images**: Runware AI.
  - **Video**: fal.ai (SadTalker) or VEED.io.

## 🛡️ Security & Resilience
- **Strict Validation**: All AI outputs are validated against a Zod schema.
- **Header Auth**: Edge Functions require an `x-internal-api-key` check.
- **Sanitization**: All user data is redacted for secrets/PII before reaching the LLM.
- **Partial Failure**: The media rendering pipeline is resilient; if one segment fails, the rest of the job continues.

## 🧪 Flow
1. **Generate Script**: Send user prefs/data -> LLM generates JSON -> Save to DB.
2. **Start Render**: Create job -> Render images & videos sequentially -> Update DB.
3. **Job Status**: Poll for progress and display in the interactive playlist.
