import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { authorizeRequest } from "../_shared/auth.ts"
import { config } from "../_shared/config.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-api-key',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authResult = await authorizeRequest(req, config);
    if (!authResult.ok) {
      return new Response(JSON.stringify(authResult.body), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: authResult.status,
      });
    }

    // STUB: Gmail sync requires OAuth which is slated for v1.1
    // This hook is here to satisfy the Milestone 3 architectural requirement.
    
    return new Response(JSON.stringify({ 
      ok: true, 
      items_synced: 0,
      message: "Gmail sync is currently a stub (OAuth required for v1.1)"
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: error.message === 'Unauthorized' ? 401 : 400,
    })
  }
})
