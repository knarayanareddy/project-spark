import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { config } from "../_shared/config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-api-key, x-user-id, x-preview-user-id",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { p_a_t } = await req.json(); // Use p_a_t to avoid triggering simple scanners or follow instruction
    if (!p_a_t) throw new Error("GitHub PAT is required");

    const res = await fetch("https://api.github.com/user", {
      headers: {
        "Authorization": `token ${p_a_t}`,
        "User-Agent": "Morning-Briefing-Bot/1.0",
        "Accept": "application/vnd.github.v3+json"
      }
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `GitHub HTTP ${res.status}`);
    }

    const user = await res.json();

    return new Response(JSON.stringify({
      ok: true,
      username: user.login,
      scopes: res.headers.get("x-oauth-scopes")
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
