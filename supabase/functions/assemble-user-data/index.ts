import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { config, validateConfig } from "../_shared/config.ts";
import { authorizeRequest } from "../_shared/auth.ts";
import { sanitizeDeep, redactSecrets } from "../_shared/sanitize.ts";
import { AssembledUserData } from "../_shared/userData.ts";

validateConfig();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-api-key",
};

serve(async (req) => {
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
    // 1. Get user state (last_briefed_at)
    const { data: userState } = await supabase
      .from("briefing_user_state")
      .select("last_briefed_at")
      .eq("user_id", userId)
      .single();

    const since = userState?.last_briefed_at || new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

    // 2. Get connector config (keywords)
    const { data: rssConfig } = await supabase
      .from("connector_configs")
      .select("config")
      .eq("user_id", userId)
      .eq("provider", "rss")
      .single();

    const keywords = rssConfig?.config?.keywords || [];

    // 3. Fetch synced items since last briefing
    const { data: items, error: fetchErr } = await supabase
      .from("synced_items")
      .select("*")
      .eq("user_id", userId)
      .gt("occurred_at", since)
      .order("occurred_at", { ascending: false })
      .limit(100);

    if (fetchErr) throw fetchErr;

    // 4. Rank items (pure code, deterministic)
    const scoredItems = items.map(item => {
      let score = 0;
      const searchSpace = `${item.title} ${item.summary}`.toLowerCase();
      
      keywords.forEach(kw => {
        if (searchSpace.includes(kw.toLowerCase())) score += 3;
      });

      // Recency bonus: within last 6 hours
      const ageMs = Date.now() - new Date(item.occurred_at).getTime();
      if (ageMs < 6 * 60 * 60 * 1000) score += 2;

      return { ...item, score };
    });

    // Sort by score then recency
    scoredItems.sort((a, b) => b.score - a.score || new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());

    // 5. Select top N
    const topNews = scoredItems
      .filter(i => i.item_type === "news")
      .slice(0, 5)
      .map(i => ({
        source_id: i.source_id,
        title: i.title,
        source_name: i.payload?.source_name || "RSS",
        url: i.url,
        published_time_iso: i.occurred_at,
        snippet: i.summary?.slice(0, 300),
      }));

    const topPRs = scoredItems
      .filter(i => i.item_type === "github_pr")
      .slice(0, 2)
      .map(i => ({
        source_id: i.source_id,
        repo: i.payload?.repo || "Unknown Repo",
        title: i.title,
        url: i.url,
        author_display: i.author,
        status: i.payload?.status || "open",
        updated_time_iso: i.occurred_at,
      }));

    const userData: AssembledUserData = {
      news_items: topNews,
      github_prs: topPRs,
    };

    return new Response(JSON.stringify({
      user_data: userData,
      meta: {
        since,
        news_count_total: items.filter(i => i.item_type === "news").length,
        news_count_included: topNews.length
      }
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (e: any) {
    console.error("assemble-user-data error:", e.message);
    return new Response(JSON.stringify({ error: redactSecrets(e.message) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
