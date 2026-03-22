import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { config, validateConfig } from "../_shared/config.ts";
import { authorizeRequest } from "../_shared/auth.ts";

validateConfig();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
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
    const userId = auth.user_id;

    // Try to get settings
    const { data: existingSettings, error: fetchError } = await supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    let settings = existingSettings;

    // Seed if missing
    if (!settings) {
      // Cast auth to any for email access if type is incomplete
      const authData = auth as any;
      const { data: newUser, error: createError } = await supabase
        .from("user_settings")
        .insert({
          user_id: userId,
          display_name: authData.email?.split('@')[0] || "User",
          timezone: "UTC",
          notification_prefs: {
            edgeFailures: true,
            newLogin: true,
            vaultRotation: false,
            genComplete: true,
            genError: true,
            dailyDigest: false,
            rateLimit: true
          }
        })
        .select()
        .single();
      
      if (createError) throw createError;
      settings = newUser;
    }

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
