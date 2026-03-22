import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-api-key, x-user-id, x-preview-user-id",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // SECURE: Require INTERNAL_API_KEY for diagnostic access
  const authHeader = req.headers.get("x-internal-api-key");
  const requiredKey = Deno.env.get("INTERNAL_API_KEY");
  if (!authHeader || authHeader !== requiredKey) {
    return new Response(JSON.stringify({ error: "unauthorized", detail: "Internal API Key required for diagnostic access" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  try {
    const status = {
      openai: !!Deno.env.get("OPENAI_API_KEY"),
      fal: !!Deno.env.get("FAL_KEY"),
      runware: !!Deno.env.get("RUNWARE_API_KEY")
    };

    return new Response(JSON.stringify(status), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
