import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { ArrowLeft, Rss, Github, RefreshCw, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { syncNews, syncGithub } from "@/lib/api";

export default function Connectors() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [rssFeeds, setRssFeeds] = useState<any[]>([]);
  const [githubPat, setGithubPat] = useState("");
  const [keywords, setKeywords] = useState("");
  const [lastSync, setLastSync] = useState<string | null>(null);

  useEffect(() => {
    loadConfigs();
  }, []);

  async function loadConfigs() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Load RSS
    const { data: rssData } = await (supabase as any)
      .from("connector_configs")
      .select("config")
      .eq("user_id", user.id)
      .eq("provider", "rss")
      .single();
    
    if (rssData) {
      setRssFeeds(rssData.config.feeds || []);
      setKeywords(rssData.config.keywords?.join(", ") || "");
    }

    // Load GitHub Status
    const { data: ghData } = await (supabase as any)
      .from("connector_connections")
      .select("metadata")
      .eq("user_id", user.id)
      .eq("provider", "github")
      .single();
    
    if (ghData?.metadata?.encrypted_pat) {
      setGithubPat("REDACTED_TOKEN_SAVED");
    }

    // Load Last Sync
    const { data: state } = await (supabase as any)
      .from("briefing_user_state")
      .select("last_news_sync_at")
      .eq("user_id", user.id)
      .single();
    
    if (state) setLastSync(state.last_news_sync_at);
  }

  async function saveRssConfig() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const feeds = rssFeeds.filter(f => f.url);
    const kwList = keywords.split(",").map(k => k.trim()).filter(Boolean);

    const { error } = await (supabase as any)
      .from("connector_configs")
      .upsert({
        user_id: user.id,
        provider: "rss",
        config: { feeds, keywords: kwList, max_items_per_run: 20 }
      }, { onConflict: "user_id, provider" });

    if (error) toast.error("Failed to save RSS config");
    else toast.success("RSS configuration saved");
  }

  async function saveGithubConnection() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("User not authenticated.");
        return;
      }
      if (!githubPat || githubPat === "REDACTED_TOKEN_SAVED") {
        toast.error("Please enter a valid GitHub PAT.");
        return;
      }

      const { data, error } = await supabase.functions.invoke("set-connector-secret", {
        body: { provider: "github", secret: githubPat },
        headers: { "Authorization": `Bearer ${session?.access_token}` }
      });

      if (error || (data && data.error)) {
        throw new Error(error?.message || data?.error || "Unknown error from function.");
      }

      toast.success("GitHub connected successfully", {
        description: "Token is securely encrypted and stored server-side (never readable from the client)."
      });
      setGithubPat("REDACTED_TOKEN_SAVED");
    } catch (err: any) {
      toast.error("Failed to save GitHub token", {
        description: err.message || "An unexpected error occurred."
      });
    }
  }

  async function handleSync(type: "news" | "github") {
    setLoading(true);
    try {
      if (type === "news") {
        const res = await syncNews();
        toast.success(`Synced ${res.items_synced} news items`);
      } else {
        const res = await syncGithub();
        toast.success(`Synced ${res.items_synced} GitHub PRs`);
      }
      loadConfigs();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background text-foreground p-8">
      <div className="max-w-4xl mx-auto w-full space-y-8">

        <div className="grid md:grid-cols-2 gap-8">
          {/* RSS SECTION */}
          <Card className="bg-card border-border text-foreground">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <Rss className="w-5 h-5 text-orange-500" />
                AI News (RSS)
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                Sync latest developments from your favorite blogs and feeds.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-400">RSS Feeds</label>
                {rssFeeds.map((feed, idx) => (
                  <div key={idx} className="flex gap-2">
                    <Input 
                      placeholder="Feed URL" 
                      value={feed.url} 
                      onChange={(e) => {
                        const newFeeds = [...rssFeeds];
                        newFeeds[idx].url = e.target.value;
                        setRssFeeds(newFeeds);
                      }}
                      className="bg-secondary border-border"
                    />
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => setRssFeeds(rssFeeds.filter((_, i) => i !== idx))}
                      className="hover:bg-red-500/20 text-red-500"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setRssFeeds([...rssFeeds, { title: "New Feed", url: "" }])}
                  className="w-full border-border hover:bg-secondary"
                >
                  <Plus className="w-4 h-4 mr-2" /> Add Feed
                </Button>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-400">Keywords (comma-separated)</label>
                <Input 
                  placeholder="agent, reasoning, multimodal..." 
                  value={keywords} 
                  onChange={(e) => setKeywords(e.target.value)}
                  className="bg-secondary border-border"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button className="flex-1" onClick={saveRssConfig}>Save Config</Button>
                <Button variant="secondary" onClick={() => handleSync("news")} disabled={loading}>
                  {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                </Button>
              </div>
              {lastSync && (
                <p className="text-xs text-zinc-500">Last synced: {new Date(lastSync).toLocaleString()}</p>
              )}
            </CardContent>
          </Card>

          {/* GITHUB SECTION */}
          <Card className="bg-card border-border text-foreground">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <Github className="w-5 h-5 text-muted-foreground" />
                GitHub (MVP)
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                Sync open PRs and notifications to your executive briefing.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-400">Personal Access Token (PAT)</label>
                <Input 
                  type="password"
                  placeholder="ghp_..." 
                  value={githubPat} 
                  onChange={(e) => setGithubPat(e.target.value)}
                  className="bg-secondary border-border"
                />
                <p className="text-[10px] text-zinc-500 italic">Token is stored encrypted for the sync worker.</p>
              </div>

              <div className="flex gap-2 pt-2">
                <Button className="flex-1" onClick={saveGithubConnection}>Connect GitHub</Button>
                <Button variant="secondary" onClick={() => handleSync("github")} disabled={loading}>
                  {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* GMAIL STUB */}
        <div className="p-6 border border-border rounded-lg bg-card/50">
          <div className="flex items-center justify-between opacity-50">
            <div>
              <h3 className="font-semibold text-lg text-foreground">Google Workspace (Gmail)</h3>
              <p className="text-sm text-muted-foreground">Scheduled for v1.1 — Requires gmail.readonly scope.</p>
            </div>
            <div className="px-3 py-1 bg-secondary rounded-full text-xs text-muted-foreground">Coming Soon</div>
          </div>
        </div>
      </div>
    </div>
  );
}
