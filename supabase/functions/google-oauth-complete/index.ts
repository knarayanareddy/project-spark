import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { config, validateConfig } from "../_shared/config.ts";
import { authorizeRequest } from "../_shared/auth.ts";

validateConfig();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-api-key, x-user-id, x-preview-user-id",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, DELETE, PUT",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await authorizeRequest(req, config);
  if (!auth.ok) {
    return new Response(JSON.stringify(auth.body), { status: auth.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Google OAuth completion logic stub
  // In a real implementation, this would exchange 'code' for tokens and save to connector_secrets.
  return new Response(JSON.stringify({ 
    ok: true, 
    message: "Google OAuth completion (Stub). Token exchange successful." 
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
});
