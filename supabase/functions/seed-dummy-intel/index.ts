import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { config } from "../_shared/config.ts";
import { authorizeRequest } from "../_shared/auth.ts";
import { stableSourceId } from "../_shared/stableId.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-api-key, x-user-id, x-preview-user-id",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await authorizeRequest(req, config);
  if (!auth.ok || !auth.user_id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { 
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }

  const supabase = createClient(config.SUPABASE_URL!, config.SUPABASE_SERVICE_ROLE_KEY!);
  const userId = auth.user_id;

  try {
    const body = await req.json().catch(() => ({}));
    const { include = { rss: true }, mark_connected = true, days_back = 1 } = body;

    const dummyItems = [];
    const now = new Date();

    if (include.rss) {
      const stableId = await stableSourceId("news", "dummy-rss-1");
      dummyItems.push({
        user_id: userId,
        provider: "rss",
        item_type: "news",
        external_id: "dummy-rss-1",
        source_id: stableId,
        occurred_at: new Date(now.getTime() - 1000 * 60 * 60).toISOString(),
        title: "Dummy Financial News: Market Stabilizes",
        url: "https://example.com/dummy-rss-1",
        summary: "In a surprising turn of events, dummy global markets have shown remarkable stability today.",
        payload: { source_name: "Dummy News Network", categories: ["Finance"] }
      });
    }

    if (include.github) {
      const stableId = await stableSourceId("github_pr", "dummy-pr-1");
      dummyItems.push({
        user_id: userId,
        provider: "github",
        item_type: "github_pr",
        external_id: "dummy-pr-1",
        source_id: stableId,
        occurred_at: new Date(now.getTime() - 1000 * 60 * 120).toISOString(),
        title: "feat: implement preflight lab",
        url: "https://github.com/dummy/repo/pull/1",
        summary: "This PR adds a functional integration testing lab to Dev Mode.",
        payload: { repo: "knarayanareddy/project-spark", author: "agent-zero" }
      });
    }

    if (include.slack) {
       const stableId = await stableSourceId("slack_message", "dummy-slack-1");
       dummyItems.push({
         user_id: userId,
         provider: "slack",
         item_type: "slack_message",
         external_id: "dummy-slack-1",
         source_id: stableId,
         occurred_at: new Date(now.getTime() - 1000 * 60 * 30).toISOString(),
         title: "Message from #engineering",
         url: "https://slack.com/dummy/1",
         summary: "Hey team, the E2E lab is ready for testing. Let's run some smoke tests.",
         payload: { channel: "engineering", author: "kiran" }
       });
    }

    if (include.google) {
      const stableId = await stableSourceId("email", "dummy-email-1");
      dummyItems.push({
        user_id: userId,
        provider: "google",
        item_type: "email",
        external_id: "dummy-email-1",
        source_id: stableId,
        occurred_at: new Date(now.getTime() - 1000 * 60 * 45).toISOString(),
        title: "Re: Project Spark Update",
        url: "https://mail.google.com/dummy/1",
        summary: "The latest rendering results look great. fal.ai integration is solid.",
        payload: { from: "manager@example.com", thread_id: "t1", email_id: "e1" }
      });
    }

    const { error: upsertErr } = await supabase
      .from("synced_items")
      .upsert(dummyItems, { onConflict: "user_id, provider, item_type, external_id" });

    if (upsertErr) throw upsertErr;

    if (mark_connected) {
      const healthRows = Object.keys(include)
        .filter(k => include[k])
        .map(provider => ({
          user_id: userId,
          provider,
          status: "active",
          connected: true,
          last_success_at: new Date().toISOString()
        }));

      await supabase.from("connector_health").upsert(healthRows, { onConflict: "user_id, provider" });
    }

    return new Response(JSON.stringify({
      ok: true,
      upserted_count: dummyItems.length,
      providers: Object.keys(include).filter(k => include[k])
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { 
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }
});
