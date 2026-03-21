import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import Parser from "https://esm.sh/rss-parser@3.13.0";
import { stableSourceId } from "../stableId.ts";
import { sanitizeDeep } from "../sanitize.ts";
import { recordSyncAttemptStart, recordSyncSuccess, recordSyncFailure } from "../connectorHealth.ts";

const parser = new Parser();

export async function syncRssForUser(
  supabase: SupabaseClient,
  { userId, runId: existingRunId }: { userId: string; runId?: string }
) {
  const provider = "rss";
  const runId = existingRunId || await recordSyncAttemptStart(supabase, { userId, provider });

  try {
    // 1. Get RSS Config for this user
    const { data: configRow, error: cfgErr } = await supabase
      .from("connector_configs")
      .select("config")
      .eq("user_id", userId)
      .eq("provider", "rss")
      .single();

    if (cfgErr || !configRow) {
      throw new Error("rss_not_configured: RSS configuration not found.");
    }

    const feeds = configRow.config.feeds || [];
    const maxItemsPerRun = configRow.config.max_items_per_run || 30;
    const syncedItems = [];
    let itemsFoundCount = 0;

    // 2. Process each feed
    for (const feed of feeds) {
      try {
        const feedData = await parser.parseURL(feed.url);
        itemsFoundCount += feedData.items.length;
        
        for (const entry of feedData.items.slice(0, maxItemsPerRun)) {
          const externalId = entry.guid || entry.link || entry.title;
          if (!externalId) continue;

          const stableId = await stableSourceId("news", externalId);
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
              missing_date: !entry.isoDate && !entry.pubDate
            }),
          });
        }
      } catch (feedErr: any) {
        console.error(`Error syncing RSS feed ${feed.url}:`, feedErr.message);
      }
    }

    // 3. Batched Upsert into synced_items
    if (syncedItems.length > 0) {
      const { error: upsertErr } = await supabase
        .from("synced_items")
        .upsert(syncedItems, { onConflict: "user_id, provider, item_type, external_id" });
      
      if (upsertErr) throw upsertErr;
    }

    // 4. Record Success
    await recordSyncSuccess(supabase, {
      runId,
      userId,
      provider,
      itemsFound: itemsFoundCount,
      itemsUpserted: syncedItems.length,
      meta: { feed_count: feeds.length }
    });

    return { ok: true, items_synced: syncedItems.length };

  } catch (e: any) {
    console.error("syncRssForUser error:", e.message);
    
    await recordSyncFailure(supabase, {
      runId,
      userId,
      provider,
      errorCode: e.message.includes("rss_not_configured") ? "rss_not_configured" : "rss_sync_error",
      errorMessage: e.message
    });

    throw e;
  }
}
