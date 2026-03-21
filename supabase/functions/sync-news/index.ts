import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Parser from "https://esm.sh/rss-parser@3.13.0";
import { config, validateConfig } from "../_shared/config.ts";
import { authorizeRequest } from "../_shared/auth.ts";
import { sanitizeDeep, redactSecrets } from "../_shared/sanitize.ts";

validateConfig();

const parser = new Parser();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-api-key",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const auth = await authorizeRequest(req, config);
  if (!auth.ok) {
    return new Response(JSON.stringify(auth.body), { status: auth.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const userId = auth.user_id;
  const supabase = createClient(config.SUPABASE_URL!, config.SUPABASE_SERVICE_ROLE_KEY!);

  try {
    // 1. Get RSS Config for this user
    const { data: configRow, error: cfgErr } = await supabase
      .from("connector_configs")
      .select("config")
      .eq("user_id", userId)
      .eq("provider", "rss")
      .single();

    if (cfgErr || !configRow) {
      throw new Error("RSS configuration not found. Please set up feeds first.");
    }

    const feeds = configRow.config.feeds || [];
    const maxItemsPerRun = configRow.config.max_items_per_run || 30;
    const syncedItems = [];

    // 2. Process each feed
    for (const feed of feeds) {
      console.log(`Syncing feed: ${feed.title} (${feed.url})`);
      try {
        const feedData = await parser.parseURL(feed.url);
        
        for (const entry of feedData.items.slice(0, maxItemsPerRun)) {
          const externalId = entry.guid || entry.link || entry.title;
          if (!externalId) continue;

          // Stable source_id derived from guid/link
          const stableId = `news_${btoa(externalId).slice(0, 16)}`;
          const publishedAt = entry.isoDate || entry.pubDate || new Date().toISOString();

          syncedItems.push({
            user_id: userId,
            provider: "rss",
            item_type: "news",
            external_id: externalId,
            source_id: stableId,
            occurred_at: publishedAt,
            title: entry.title,
            author: entry.creator || entry.author,
            url: entry.link,
            summary: entry.contentSnippet || entry.description,
            payload: sanitizeDeep({
              source_name: feed.title,
              categories: entry.categories,
            }),
          });
        }
      } catch (feedErr: any) {
        console.error(`Error syncing feed ${feed.title}:`, feedErr.message);
      }
    }

    // 3. Batched Upsert into synced_items
    if (syncedItems.length > 0) {
      const { error: upsertErr } = await supabase
        .from("synced_items")
        .upsert(syncedItems, { onConflict: "user_id, provider, item_type, external_id" });
      
      if (upsertErr) throw upsertErr;
    }

    // 4. Update user state
    await supabase
      .from("briefing_user_state")
      .upsert({ user_id: userId, last_news_sync_at: new Date().toISOString() }, { onConflict: "user_id" });

    return new Response(JSON.stringify({ 
      ok: true, 
      items_synced: syncedItems.length,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (e: any) {
    console.error("sync-news error:", e.message);
    return new Response(JSON.stringify({ error: redactSecrets(e.message) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
