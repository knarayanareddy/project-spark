import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { config, validateConfig } from "../_shared/config.ts";
import { authorizeRequest } from "../_shared/auth.ts";
import { planSegments } from "../_shared/planner.ts";
import { AssembledUserData } from "../_shared/userData.ts";
import { ModuleId } from "../_shared/moduleCatalog.ts";

validateConfig();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-api-key",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await authorizeRequest(req, config);
  if (!auth.ok) {
    return new Response(JSON.stringify(auth.body), { status: auth.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const supabase = createClient(config.SUPABASE_URL!, config.SUPABASE_SERVICE_ROLE_KEY!);
  const userId = auth.user_id!;

  try {
    const { profile_id } = await req.json().catch(() => ({}));
    if (!profile_id) throw new Error("Missing profile_id");

    // 1. Fetch profile
    const { data: profile } = await supabase
      .from("briefing_profiles")
      .select("enabled_modules, module_settings")
      .eq("id", profile_id)
      .eq("user_id", userId)
      .single();

    if (!profile) throw new Error("Profile not found");

    // 2. Call assemble-user-data internally
    const assembleUrl = `${config.SUPABASE_URL}/functions/v1/assemble-user-data`;
    const assembleRes = await fetch(assembleUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.SUPABASE_SERVICE_ROLE_KEY}`,
        "apikey": config.SUPABASE_SERVICE_ROLE_KEY!,
      },
      body: JSON.stringify({ profile_id }),
    });

    if (!assembleRes.ok) throw new Error("Data assembly failed for preview");

    const assembled = await assembleRes.json();
    const userData = assembled.user_data as AssembledUserData;
    const enabledModules = (assembled.meta?.enabled_modules || profile.enabled_modules) as ModuleId[];
    const moduleSettings = profile.module_settings || {};

    // 3. Run Planner (Pure logic)
    const previewPlans = planSegments({ enabledModules, moduleSettings, userData });

    return new Response(JSON.stringify({ preview: previewPlans }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
