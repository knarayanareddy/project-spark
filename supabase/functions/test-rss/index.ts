import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Parser from "https://esm.sh/rss-parser@3.13.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-api-key, x-user-id, x-preview-user-id",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const parser = new Parser();

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { url } = await req.json();
    if (!url) throw new Error("URL is required");

    const res = await fetch(url, { headers: { "User-Agent": "Morning-Briefing-Bot/1.0" } });
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);

    const xml = await res.text();
    const feed = await parser.parseString(xml);

    return new Response(JSON.stringify({
      ok: true,
      title: feed.title,
      itemCount: feed.items?.length || 0,
      description: feed.description
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      status: 200, // Return 200 so the UI can show the error gracefully
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
