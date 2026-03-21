import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { config, validateConfig } from "../_shared/config.ts";
import { authorizeRequest } from "../_shared/auth.ts";
import { sanitizeDeep, redactSecrets } from "../_shared/sanitize.ts";
import { stableSourceId } from "../_shared/stableId.ts";
import { decryptString } from "../_shared/crypto.ts";

validateConfig();

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
    // 1. Get GitHub Config (strictly encrypted token parsing ONLY)
    const { data: connSecret, error: connErr } = await supabase
      .from("connector_secrets")
      .select("secret_ciphertext, secret_iv")
      .eq("user_id", userId)
      .eq("provider", "github")
      .single();

    if (connErr || !connSecret?.secret_ciphertext) {
      return new Response(JSON.stringify({ error: "github_not_configured" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const pat = await decryptString(connSecret.secret_ciphertext, connSecret.secret_iv, config.CONNECTOR_SECRET_KEY!);

    // 2. Fetch User Login securely to resolve ambiguous search scopes
    const userRes = await fetch("https://api.github.com/user", {
      headers: {
        "Authorization": `token ${pat}`,
        "User-Agent": "Morning-Briefing-Bot"
      }
    });

    if (!userRes.ok) throw new Error("Failed to validate GitHub identity.");
    const userData = await userRes.json();
    const login = userData.login;

    // 3. Fetch PRs deterministically based on parsed identity
    const query = `is:pr is:open archived:false review-requested:${login}`;
    const ghResponse = await fetch(`https://api.github.com/search/issues?q=${encodeURIComponent(query)}&sort=updated&order=desc`, {
      headers: {
        "Authorization": `token ${pat}`,
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "Morning-Briefing-Bot"
      }
    });

    if (!ghResponse.ok) {
      const err = await ghResponse.text();
      throw new Error(`GitHub API Error: ${err}`);
    }

    const prData = await ghResponse.json();
    const syncedItems = [];

    for (const pr of prData.items) {
      const externalId = pr.node_id || pr.html_url;
      if (!externalId) continue;
      const stableId = await stableSourceId("pr", externalId);

      syncedItems.push({
        user_id: userId,
        provider: "github",
        item_type: "github_pr",
        external_id: externalId,
        source_id: stableId,
        occurred_at: pr.updated_at,
        title: pr.title,
        author: pr.user.login,
        url: pr.html_url,
        summary: sanitizeDeep(pr.body?.slice(0, 500) || "No description provided"),
        payload: sanitizeDeep({
          repo: pr.repository_url.split("/").slice(-2).join("/"),
          status: pr.state || "open",
          author: pr.user?.login || "Unknown",
          updated_at: pr.updated_at,
        }),
      });
    }

    // 3. Batched Upsert
    if (syncedItems.length > 0) {
      const { error: upsertErr } = await supabase
        .from("synced_items")
        .upsert(syncedItems, { onConflict: "user_id, provider, item_type, external_id" });
      
      if (upsertErr) throw upsertErr;
    }

    return new Response(JSON.stringify({ 
      ok: true, 
      items_synced: syncedItems.length,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (e: any) {
    console.error("sync-github error:", e.message);
    return new Response(JSON.stringify({ error: redactSecrets(e.message) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
