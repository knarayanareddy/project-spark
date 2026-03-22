import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { config, validateConfig } from "../_shared/config.ts";
import { authorizeRequest } from "../_shared/auth.ts";

validateConfig();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = await authorizeRequest(req, config);
    if (!auth.ok || !auth.user_id) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { 
        status: 401, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    const supabase = createClient(config.SUPABASE_URL!, config.SUPABASE_SERVICE_ROLE_KEY!);
    
    // Get all connector configs
    const { data: configs, error: configError } = await supabase
      .from("connector_configs")
      .select("provider")
      .eq("user_id", auth.user_id);

    if (configError) throw configError;

    // Get all secrets presence
    const { data: secrets, error: secretError } = await supabase
      .from("connector_secrets")
      .select("provider")
      .eq("user_id", auth.user_id);

    if (secretError) throw secretError;

    // Get health status
    const { data: health, error: healthError } = await supabase
      .from("connector_health")
      .select("provider, status, last_error_message")
      .eq("user_id", auth.user_id);

    if (healthError) throw healthError;

    const providers = ["github", "google", "slack", "rss", "notion", "weather"];
    const results = providers.map(p => {
      const hasConfig = configs?.some(c => c.provider === p);
      const hasSecret = secrets?.some(s => s.provider === p);
      const healthStatus = health?.find(h => h.provider === p);

      return {
        provider: p,
        configured: hasConfig,
        has_secret: hasSecret,
        status: healthStatus?.status || (hasConfig ? "unknown" : "not_configured"),
        error: healthStatus?.last_error_message
      };
    });

    return new Response(JSON.stringify({ providers: results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }
});
