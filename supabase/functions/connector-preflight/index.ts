import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { config } from "../_shared/config.ts";
import { authorizeRequest } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-api-key, x-user-id, x-preview-user-id",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await authorizeRequest(req, config);
  if (!auth.ok || !auth.user_id) {
    return new Response(JSON.stringify({ error: "Unauthorized", detail: "JWT required for connector preflight" }), { 
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }

  const supabase = createClient(config.SUPABASE_URL!, config.SUPABASE_SERVICE_ROLE_KEY!);
  const userId = auth.user_id;

  const providers = ["rss", "github", "slack", "google"];
  
  // 1. Fetch configs
  const { data: configs } = await supabase
    .from("connector_configs")
    .select("provider")
    .eq("user_id", userId);

  // 2. Fetch secrets (presence only)
  const { data: secrets } = await supabase
    .from("connector_secrets")
    .select("provider")
    .eq("user_id", userId);

  // 3. Fetch health
  const { data: healths } = await supabase
    .from("connector_health")
    .select("provider, status, last_success_at, last_error_message")
    .eq("user_id", userId);

  const connectorStatus = providers.map(p => {
    const configPresent = configs?.some(c => c.provider === p) ?? false;
    const secretPresent = secrets?.some(s => s.provider === p) ?? false;
    const health = healths?.find(h => h.provider === p) ?? null;

    let notes = undefined;
    if (p === "google") {
      notes = "Gmail sync currently stubbed (OAuth not implemented)";
    }

    return {
      provider: p,
      config_present: configPresent,
      secret_present: secretPresent,
      health: health ? {
        status: health.status,
        last_success_at: health.last_success_at,
        last_error_message: health.last_error_message
      } : null,
      notes
    };
  });

  const missing = connectorStatus
    .filter(c => c.provider !== "google" && (!c.config_present || (["github", "slack"].includes(c.provider) && !c.secret_present)))
    .map(c => c.provider);

  return new Response(JSON.stringify({
    user_id: userId,
    connectors: connectorStatus,
    overall: {
      ok_for_live_brief: !connectorStatus.find(c => c.provider === "rss" && !c.config_present),
      missing
    }
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
});
