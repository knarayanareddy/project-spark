import { supabase } from "@/integrations/supabase/client";

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const FUNCTIONS_BASE = `https://${PROJECT_ID}.supabase.co/functions/v1`;

let internalApiKey = "";
export const setInternalApiKey = (key: string) => { internalApiKey = key; };
export const getInternalApiKey = () => internalApiKey;

async function callEdgeFunction<T>(
  fnName: string,
  options: { method?: string; body?: unknown; params?: Record<string, string> } = {}
): Promise<T> {
  const { method = "POST", body, params } = options;
  const url = new URL(`${FUNCTIONS_BASE}/${fnName}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-internal-api-key": internalApiKey,
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  };

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Edge function ${fnName} failed (${res.status}): ${text}`);
  }
  return res.json();
}

export async function generateScript(userPreferences: unknown, userData: unknown) {
  return callEdgeFunction<{ script_id: string; script_json: unknown }>("generate-script", {
    body: { user_preferences: userPreferences, user_data: userData },
  });
}

export async function startRender(scriptId: string) {
  return callEdgeFunction<{ job_id: string }>("start-render", {
    body: { script_id: scriptId },
  });
}

export interface SegmentStatus {
  segment_id: number;
  avatar_video_url: string | null;
  b_roll_image_url: string | null;
  ui_action_card: unknown;
  dialogue: string;
  grounding_source_id: string;
  status: string;
  error: string | null;
}

export interface JobStatusResponse {
  status: string;
  segments: SegmentStatus[];
}

export async function getJobStatus(jobId: string) {
  return callEdgeFunction<JobStatusResponse>("job-status", {
    method: "GET",
    params: { job_id: jobId },
  });
}
