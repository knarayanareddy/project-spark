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

    const body = await req.json();
    const supabase = createClient(config.SUPABASE_URL!, config.SUPABASE_SERVICE_ROLE_KEY!);
    const userId = auth.user_id;

    // Filter allowed fields for update
    const updatePayload: any = {};
    if (body.display_name !== undefined) updatePayload.display_name = body.display_name;
    if (body.avatar_url !== undefined) updatePayload.avatar_url = body.avatar_url;
    if (body.timezone !== undefined) updatePayload.timezone = body.timezone;
    if (body.location_text !== undefined) updatePayload.location_text = body.location_text;
    if (body.location_lat !== undefined) updatePayload.location_lat = body.location_lat;
    if (body.location_lon !== undefined) updatePayload.location_lon = body.location_lon;
    if (body.notification_prefs !== undefined) updatePayload.notification_prefs = body.notification_prefs;

    const { data: settings, error } = await supabase
      .from("user_settings")
      .upsert({ user_id: userId, ...updatePayload })
      .select()
      .single();

    if (error) throw error;

    // Log audit event
    await supabase.from("audit_events").insert({
      user_id: userId,
      event_type: "settings_changed",
      metadata: { keys: Object.keys(updatePayload) }
    });

    return new Response(JSON.stringify(settings), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }
});
