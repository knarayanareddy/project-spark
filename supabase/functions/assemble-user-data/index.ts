import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { config, validateConfig } from "../_shared/config.ts";
import { authorizeRequest } from "../_shared/auth.ts";
import { sanitizeDeep, redactSecrets } from "../_shared/sanitize.ts";
import { AssembledUserData, ConnectorStatus } from "../_shared/userData.ts";
import { getModule, ModuleId } from "../_shared/moduleManifest.ts";
import { migrateProfileIfNeeded } from "../_shared/profileMigration.ts";

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
        .select("enabled_modules, module_settings, module_catalog_version")
        .eq("id", profile_id)
        .eq("user_id", userId)
        .single();

      if (profile) {
        // Migrate on read to ensure we use valid module IDs/settings
        const migrated = migrateProfileIfNeeded(profile as any);
        enabledModules = (migrated.enabled_modules || []) as ModuleId[];
        moduleSettings = migrated.module_settings || {};
      }
    }

    // If no profile or empty, use a sensible server-side default from manifest
    if (enabledModules.length === 0) {
      enabledModules = ["ai_news_delta", "github_prs"] as ModuleId[];
    }

    // 2. Derive required providers and buckets from manifest
    const requiredProviders = new Set<string>();
    const requiredBuckets = new Set<string>();
    for (const modId of enabledModules) {
      const mod = getModule(modId);
      if (!mod || mod.availability === "coming_soon") continue;
      
      mod.requiredConnectors.forEach(c => requiredProviders.add(c.provider));
      mod.requiredBuckets.forEach(b => requiredBuckets.add(b));
    }

    // 3. Fetch connector connections for this user
    const { data: connections } = await supabase
      .from("connector_connections")
      .select("provider, status, last_sync_at")
      .eq("user_id", userId);

    const connectionMap = new Map<string, { status: string; last_sync_at: string | null }>();
    (connections || []).forEach((c: any) => connectionMap.set(c.provider, c));

    // Derive latest synced_items timestamp per provider
    const { data: latestSynced } = await supabase
      .from("synced_items")
      .select("item_type, occurred_at")
      .eq("user_id", userId)
      .order("occurred_at", { ascending: false })
      .limit(50);

    const latestByType = new Map<string, string>();
    (latestSynced || []).forEach((row: any) => {
      if (!latestByType.has(row.item_type)) latestByType.set(row.item_type, row.occurred_at);
    });

    // 4. Build connector_status[]
    const connector_status: ConnectorStatus[] = [];
    for (const provider of requiredProviders) {
      const conn = connectionMap.get(provider);
      const itemType = PROVIDER_ITEM_TYPE[provider];
      const lastSyncFromItems = itemType ? (latestByType.get(itemType) || null) : null;
      const lastSyncFromConn = conn?.last_sync_at || null;
      const lastSync = lastSyncFromConn || lastSyncFromItems;

      let status: ConnectorStatus["status"];
      let message: string;
      
      if (provider === "weather") {
          status = "active"; // Weather is public for now
          message = "Weather service is active.";
      } else if (!conn) {
        status = "missing";
        message = `${capitalize(provider)} connector is not linked.`;
      } else if (conn.status === "error") {
        status = "error";
        message = `${capitalize(provider)} connector reported an error.`;
      } else {
        status = "active";
        message = `${capitalize(provider)} connector is active.`;
      }

      connector_status.push(sanitizeDeep({
        source_id: `connector_${provider}_status`,
        provider,
        connected: status === "active",
        last_sync_time_iso: lastSync,
        status,
        message,
      }) as ConnectorStatus);
    }

    // 5. Per-module delta
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

    for (const mod of enabledModules) {
      if (!sinceByModule[mod]) sinceByModule[mod] = defaultSince;
    }

    // 6. Get RSS config keywords
    const { data: rssConfig } = await supabase
      .from("connector_configs")
      .select("config")
      .eq("user_id", userId)
      .eq("provider", "rss")
      .maybeSingle();

    const globalKeywords: string[] = rssConfig?.config?.keywords || [];

    // 7. Assemble buckets
    const userData: AssembledUserData = {
      news_items: [],
      github_prs: [],
      emails_unread: [],
      calendar_events: [],
      jira_tasks: [],
      weather: [],
      connector_status,
    };

    // WEATHER
    if (requiredBuckets.has("weather")) {
      const mod = getModule("weather")!;
      const settings = moduleSettings["weather"] || mod.defaults.settings;
      const days = settings.caps ?? 1;
      userData.weather = [{
        source_id: "weather_placeholder",
        location: "Your Area",
        current_temp_f: 72,
        forecast_high_f: 75,
        forecast_low_f: 65,
        summary: `Mainly sunny today with a high of 75F. Outlook for ${days} day(s) remains clear.`,
      }];
    }

    // NEWS
    if (requiredBuckets.has("news_items")) {
      const mod = getModule("ai_news_delta")!;
      const newsSince = sinceByModule["ai_news_delta"] || defaultSince;
      const rssConnected = connector_status.find(c => c.provider === "rss")?.connected !== false;
      
      if (rssConnected) {
        const { data: newsItems } = await supabase
          .from("synced_items")
          .select("*")
          .eq("user_id", userId)
          .eq("item_type", "news")
          .gt("occurred_at", newsSince)
          .order("occurred_at", { ascending: false })
          .limit(30);

        const settings = moduleSettings["ai_news_delta"] || mod.defaults.settings;
        const caps = settings.caps ?? mod.defaults.maxSegments;
        const activeKeywords = settings.filter_keywords?.length > 0 ? settings.filter_keywords : globalKeywords;
        
        const scored = scoreItems(newsItems || [], activeKeywords);
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

    // GITHUB PRs
    if (requiredBuckets.has("github_prs")) {
      const mod = getModule("github_prs")!;
      const githubStatus = connector_status.find(c => c.provider === "github");
      if (githubStatus?.connected) {
        const settings = moduleSettings["github_prs"] || mod.defaults.settings;
        const caps = settings.caps ?? mod.defaults.maxSegments;
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
    }

    // EMAILS
    if (requiredBuckets.has("emails_unread")) {
      const mod = getModule("inbox_triage")!;
      const emailStatus = connector_status.find(c => c.provider === "google");
      if (emailStatus?.connected) {
        const settings = moduleSettings["inbox_triage"] || mod.defaults.settings;
        const caps = settings.caps ?? mod.defaults.maxSegments;
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

    // CALENDAR
    if (requiredBuckets.has("calendar_events")) {
        const mod = getModule("calendar_today")!;
        const calStatus = connector_status.find(c => c.provider === "google");
        if (calStatus?.connected) {
            const settings = moduleSettings["calendar_today"] || mod.defaults.settings;
            const caps = settings.caps ?? mod.defaults.maxSegments;
            userData.calendar_events = [{
                source_id: "cal_1",
                title: "Example Meeting",
                start_time_iso: new Date().toISOString(),
                end_time_iso: new Date(Date.now() + 3600000).toISOString(),
                location: "Zoom",
                join_url: "https://zoom.us/j/123",
            }].slice(0, caps);
        }
    }

    // JIRA
    if (requiredBuckets.has("jira_tasks")) {
        const mod = getModule("jira_tasks")!;
        const jiraStatus = connector_status.find(c => c.provider === "jira");
        if (jiraStatus?.connected) {
            const settings = moduleSettings["jira_tasks"] || mod.defaults.settings;
            const caps = settings.caps ?? mod.defaults.maxSegments;
            userData.jira_tasks = [{
                source_id: "jira_1",
                key: "PROJ-123",
                title: "Example Task",
                status: "In Progress",
                url: "https://jira.com/PROJ-123",
                priority: "High",
            }].slice(0, caps);
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
