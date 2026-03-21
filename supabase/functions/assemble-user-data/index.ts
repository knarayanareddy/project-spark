import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { config, validateConfig } from "../_shared/config.ts";
import { authorizeRequest } from "../_shared/auth.ts";
import { sanitizeDeep, redactSecrets } from "../_shared/sanitize.ts";
import { AssembledUserData, ConnectorStatus } from "../_shared/userData.ts";
import { MODULE_CATALOG, ModuleId } from "../_shared/moduleCatalog.ts";

validateConfig();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-api-key",
};

// Mapping: provider -> synced_items item_type
const PROVIDER_ITEM_TYPE: Record<string, string> = {
  github: "github_pr",
  rss: "news",
  google: "email",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await authorizeRequest(req, config);
  if (!auth.ok) {
    return new Response(JSON.stringify(auth.body), { status: auth.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const userId = auth.user_id!;
  const supabase = createClient(config.SUPABASE_URL!, config.SUPABASE_SERVICE_ROLE_KEY!);

  try {
    // Parse optional profile_id from body
    let profile_id: string | null = null;
    let enabledModules: ModuleId[] = [];
    let moduleSettings: Record<string, any> = {};

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      profile_id = body.profile_id || null;
    }

    // 1. Resolve profile (if provided)
    if (profile_id) {
      const { data: profile } = await supabase
        .from("briefing_profiles")
        .select("enabled_modules, module_settings")
        .eq("id", profile_id)
        .eq("user_id", userId)
        .single();

      if (profile) {
        enabledModules = (profile.enabled_modules || []) as ModuleId[];
        moduleSettings = profile.module_settings || {};
      }
    }

    // If no profile, use a sensible default
    if (enabledModules.length === 0) {
      enabledModules = ["ai_news_delta", "github_prs"] as ModuleId[];
    }

    // 2. Derive required providers from enabled modules
    const requiredProviders = new Set<string>();
    const requiredBuckets = new Set<string>();
    for (const modId of enabledModules) {
      const mod = MODULE_CATALOG[modId];
      if (!mod) continue;
      mod.requiredConnectors.forEach(c => requiredProviders.add(c.provider));
      mod.requiredUserDataBuckets.forEach(b => requiredBuckets.add(b));
    }

    // 3. Fetch connector connections for this user (no secrets — just existence + status)
    const { data: connections } = await supabase
      .from("connector_connections")
      .select("provider, status, last_sync_at")
      .eq("user_id", userId);

    const connectionMap = new Map<string, { status: string; last_sync_at: string | null }>();
    (connections || []).forEach((c: any) => connectionMap.set(c.provider, c));

    // Derive latest synced_items timestamp per provider as fallback for last_sync_time
    const { data: latestSynced } = await supabase.rpc
      ? await supabase
          .from("synced_items")
          .select("item_type, occurred_at")
          .eq("user_id", userId)
          .order("occurred_at", { ascending: false })
          .limit(50)
      : { data: [] };

    const latestByType = new Map<string, string>();
    (latestSynced || []).forEach((row: any) => {
      if (!latestByType.has(row.item_type)) latestByType.set(row.item_type, row.occurred_at);
    });

    // 4. Build connector_status[] — fully deterministic, code-generated messages only
    const connector_status: ConnectorStatus[] = [];
    for (const provider of requiredProviders) {
      const conn = connectionMap.get(provider);
      const itemType = PROVIDER_ITEM_TYPE[provider];
      const lastSyncFromItems = itemType ? (latestByType.get(itemType) || null) : null;
      const lastSyncFromConn = conn?.last_sync_at || null;
      const lastSync = lastSyncFromConn || lastSyncFromItems;

      let status: ConnectorStatus["status"];
      let message: string;
      if (!conn) {
        status = "missing";
        message = `${capitalize(provider)} connector is not linked. Connect it on the Connectors page.`;
      } else if (conn.status === "error") {
        status = "error";
        message = `${capitalize(provider)} connector reported an error. Please re-authenticate.`;
      } else {
        status = "active";
        message = `${capitalize(provider)} connector is active.`;
      }

      connector_status.push(sanitizeDeep({
        source_id: `connector_${provider}_status`,
        provider,
        connected: !!conn && conn.status !== "error",
        last_sync_time_iso: lastSync,
        status,
        message,
      }) as ConnectorStatus);
    }

    // 5. Per-module delta: get last_seen_at from briefing_module_state
    const defaultSince = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
    const sinceByModule: Record<string, string> = {};

    if (enabledModules.length > 0) {
      const { data: moduleStates } = await supabase
        .from("briefing_module_state")
        .select("module_id, last_seen_at")
        .eq("user_id", userId)
        .in("module_id", enabledModules);

      (moduleStates || []).forEach((s: any) => {
        sinceByModule[s.module_id] = s.last_seen_at || defaultSince;
      });
    }

    // Fill missing modules with defaultSince
    for (const mod of enabledModules) {
      if (!sinceByModule[mod]) sinceByModule[mod] = defaultSince;
    }

    // 6. Get RSS config keywords
    const { data: rssConfig } = await supabase
      .from("connector_configs")
      .select("config")
      .eq("user_id", userId)
      .eq("provider", "rss")
      .single();
    const keywords: string[] = rssConfig?.config?.keywords || [];

    // 7. Assemble buckets — only what the profile needs
    const userData: AssembledUserData = {
      news_items: [],
      github_prs: [],
      emails_unread: [],
      calendar_events: [],
      jira_tasks: [],
      connector_status,
    };

    // NEWS — if ai_news_delta enabled and rss connector active
    if (requiredBuckets.has("news_items")) {
      const newsSince = sinceByModule["ai_news_delta"] || defaultSince;
      const rssConnected = connector_status.find(c => c.provider === "rss")?.connected !== false;
      if (rssConnected || !requiredProviders.has("rss")) {
        const { data: newsItems } = await supabase
          .from("synced_items")
          .select("*")
          .eq("user_id", userId)
          .eq("item_type", "news")
          .gt("occurred_at", newsSince)
          .order("occurred_at", { ascending: false })
          .limit(30);

        const caps = moduleSettings["ai_news_delta"]?.caps ?? MODULE_CATALOG.ai_news_delta.defaultSettings.caps;
        const scored = scoreItems(newsItems || [], keywords);
        userData.news_items = scored.slice(0, caps).map((i: any) => ({
          source_id: i.source_id,
          title: i.title,
          source_name: i.payload?.source_name || "RSS",
          url: i.url,
          published_time_iso: i.occurred_at,
          snippet: i.summary?.slice(0, 300) || "",
        }));
      }
    }

    // GITHUB PRs — if github_prs enabled and github connector active
    if (requiredBuckets.has("github_prs")) {
      const githubStatus = connector_status.find(c => c.provider === "github");
      if (githubStatus?.connected) {
        const caps = moduleSettings["github_prs"]?.caps ?? MODULE_CATALOG.github_prs.defaultSettings.caps;
        const { data: prItems } = await supabase
          .from("synced_items")
          .select("*")
          .eq("user_id", userId)
          .eq("item_type", "github_pr")
          .order("occurred_at", { ascending: false })
          .limit(caps);

        userData.github_prs = (prItems || []).map((i: any) => ({
          source_id: i.source_id,
          repo: i.payload?.repo || "Unknown Repo",
          title: i.title,
          url: i.url,
          author_display: i.payload?.author || "Unknown",
          status: i.payload?.status || "open",
          updated_time_iso: i.occurred_at,
        }));
      }
      // If github missing: github_prs stays [] — connector_status explains why
    }

    // EMAILS — if inbox_triage enabled
    if (requiredBuckets.has("emails")) {
      const emailStatus = connector_status.find(c => c.provider === "google");
      if (emailStatus?.connected) {
        const caps = moduleSettings["inbox_triage"]?.caps ?? MODULE_CATALOG.inbox_triage.defaultSettings.caps;
        const { data: emailItems } = await supabase
          .from("synced_items")
          .select("*")
          .eq("user_id", userId)
          .eq("item_type", "email")
          .order("occurred_at", { ascending: false })
          .limit(caps);

        userData.emails_unread = (emailItems || []).map((i: any) => ({
          source_id: i.source_id,
          from_display: i.payload?.from || "Unknown",
          subject: i.title,
          snippet: i.summary?.slice(0, 200) || "",
          received_time_iso: i.occurred_at,
          email_id: i.payload?.email_id || i.source_id,
          thread_id: i.payload?.thread_id || "",
        }));
      }
    }

    const sanitizedUserData = sanitizeDeep(userData) as AssembledUserData;

    return new Response(JSON.stringify({
      user_data: sanitizedUserData,
      meta: {
        profile_id,
        enabled_modules: enabledModules,
        since_by_module: sinceByModule,
        connector_status_summary: connector_status.map(c => ({ provider: c.provider, status: c.status })),
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

function scoreItems(items: any[], keywords: string[]): any[] {
  return items
    .map(item => {
      let score = 0;
      const searchSpace = `${item.title} ${item.summary || ""}`.toLowerCase();
      keywords.forEach(kw => { if (searchSpace.includes(kw.toLowerCase())) score += 3; });
      const ageMs = Date.now() - new Date(item.occurred_at).getTime();
      if (ageMs < 6 * 60 * 60 * 1000) score += 2;
      return { ...item, score };
    })
    .sort((a, b) => b.score - a.score || new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
