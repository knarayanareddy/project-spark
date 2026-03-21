import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { config, validateConfig } from "../_shared/config.ts";
import { authorizeRequest } from "../_shared/auth.ts";
import { MODULE_CATALOG, ModuleId } from "../_shared/moduleCatalog.ts";
import { sanitizeDeep } from "../_shared/sanitize.ts";

validateConfig();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const auth = await authorizeRequest(req, config);
  if (!auth.ok || !auth.user_id) {
    return new Response(JSON.stringify({ error: "Authenticated Session required for Profile configuration" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const payload = await req.json();
    let { id, name, persona, timezone, enabled_modules, module_settings } = sanitizeDeep(payload);

    if (!name) throw new Error("Profile name is required");

    // Strictly authorize Module strings mapping back directly to `moduleCatalog.ts` Code schema constants.
    const validModules = [];
    for (const mod of (enabled_modules || [])) {
      if (MODULE_CATALOG[mod as ModuleId]) validModules.push(mod);
    }

    // Secure boundary against DDOS / Overloads modifying settings natively bypassing 20KB Max sizes.
    const settingsStr = JSON.stringify(module_settings || {});
    if (new Blob([settingsStr]).size > 20480) { 
      throw new Error("Module settings exceed 20KB payload limit.");
    }

    const supabase = createClient(config.SUPABASE_URL!, config.SUPABASE_SERVICE_ROLE_KEY!);
    
    let query = supabase.from("briefing_profiles");
    let result;

    const dataObj = {
      user_id: auth.user_id,
      name,
      persona: persona || null,
      timezone: timezone || null,
      enabled_modules: validModules,
      module_settings: module_settings || {},
      updated_at: new Date().toISOString()
    };

    if (id) {
      result = await query.update(dataObj).eq("id", id).eq("user_id", auth.user_id).select().single();
    } else {
      result = await query.insert(dataObj).select().single();
    }

    if (result.error) throw result.error;

    return new Response(JSON.stringify(result.data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
