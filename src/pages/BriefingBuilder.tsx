import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Loader2, Zap, Settings2, Share2, CheckCircle2, AlertCircle, XCircle, ChevronDown, ChevronUp, ArrowLeft, RefreshCw } from "lucide-react";
import { MODULE_CATALOG, ModuleId } from "@/lib/moduleCatalog";
import { getProfiles, upsertProfile, BriefingProfile, assembleUserData } from "@/lib/api";
import { generateScript, startRender, setInternalApiKey } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";

const MODULE_ORDER: ModuleId[] = [
  "weather", "calendar_today", "inbox_triage", "github_prs",
  "github_mentions", "jira_tasks", "ai_news_delta",
  "newsletters_digest", "focus_plan", "watchlist_alerts",
];

const PROVIDER_LABEL: Record<string, string> = {
  rss: "RSS", github: "GitHub", google: "Gmail", calendar: "Calendar", jira: "Jira", weather: "Weather",
};

type ConnectorStatusSummary = Array<{ provider: string; status: "active" | "missing" | "error" }>;

type ModuleSettings = {
  caps?: number;
  filter_keywords?: string[];
};

export default function BriefingBuilder() {
  const [profiles, setProfiles] = useState<BriefingProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(
    localStorage.getItem("selectedProfileId") !== "mock-default"
      ? localStorage.getItem("selectedProfileId")
      : null
  );
  const [enabledModules, setEnabledModules] = useState<Set<ModuleId>>(new Set(["ai_news_delta", "github_prs"]));
  const [moduleSettings, setModuleSettings] = useState<Record<string, ModuleSettings>>({});
  const [expandedModule, setExpandedModule] = useState<ModuleId | null>(null);
  const [connectorStatus, setConnectorStatus] = useState<ConnectorStatusSummary>([]);
  const [isLoadingConnectors, setIsLoadingConnectors] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [keywordInput, setKeywordInput] = useState<Record<string, string>>({});
  const [hasSession, setHasSession] = useState(false);
  const [apiKey, setApiKey] = useState("");

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setHasSession(!!session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setHasSession(!!s));
    return () => subscription.unsubscribe();
  }, []);

  // ── Load profiles ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (hasSession || apiKey) {
      if (apiKey) setInternalApiKey(apiKey);
      getProfiles().then(setProfiles).catch(console.error);
    }
  }, [hasSession, apiKey]);

  // ── Load connector status ─────────────────────────────────────────────────
  const loadConnectorStatus = useCallback(async () => {
    setIsLoadingConnectors(true);
    try {
      const res = await assembleUserData();
      const meta = (res as any).meta;
      if (meta?.connector_status_summary) setConnectorStatus(meta.connector_status_summary);
    } catch {
      // silently ignore if not authed
    } finally {
      setIsLoadingConnectors(false);
    }
  }, []);

  useEffect(() => {
    if (hasSession || apiKey) loadConnectorStatus();
  }, [hasSession, apiKey, loadConnectorStatus]);

  // ── Load selected profile ─────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedProfileId) return;
    const profile = profiles.find(p => p.id === selectedProfileId);
    if (profile) {
      setEnabledModules(new Set(profile.enabled_modules as ModuleId[]));
      setModuleSettings(profile.module_settings || {});
    }
  }, [selectedProfileId, profiles]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const toggleModule = (id: ModuleId) => {
    setEnabledModules(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const updateSetting = (modId: string, key: string, value: any) => {
    // Client-side validation
    if (key === "caps") {
      const v = parseInt(value, 10);
      if (isNaN(v) || v < 1 || v > 10) return;
      value = v;
    }
    setModuleSettings(prev => ({ ...prev, [modId]: { ...prev[modId], [key]: value } }));
  };

  const addKeyword = (modId: string) => {
    const kw = (keywordInput[modId] || "").trim();
    if (!kw || kw.length > 40) return;
    const current = (moduleSettings[modId]?.filter_keywords || []) as string[];
    if (current.length >= 30 || current.includes(kw)) return;
    updateSetting(modId, "filter_keywords", [...current, kw]);
    setKeywordInput(prev => ({ ...prev, [modId]: "" }));
  };

  const removeKeyword = (modId: string, kw: string) => {
    const current = (moduleSettings[modId]?.filter_keywords || []) as string[];
    updateSetting(modId, "filter_keywords", current.filter(k => k !== kw));
  };

  const connectorStatusFor = (provider: string) =>
    connectorStatus.find(c => c.provider === provider)?.status ?? null;

  // ── Save profile ──────────────────────────────────────────────────────────
  const handleSave = async () => {
    setIsSaving(true);
    setStatusMsg(null);
    try {
      const name = selectedProfileId
        ? (profiles.find(p => p.id === selectedProfileId)?.name ?? "My Profile")
        : window.prompt("Profile name:") || "My Profile";

      const saved = await upsertProfile({
        id: selectedProfileId || undefined,
        name,
        enabled_modules: [...enabledModules],
        module_settings: moduleSettings,
      });

      setProfiles(prev => {
        const idx = prev.findIndex(p => p.id === saved.id);
        return idx >= 0 ? prev.map((p, i) => i === idx ? saved : p) : [saved, ...prev];
      });
      setSelectedProfileId(saved.id);
      localStorage.setItem("selectedProfileId", saved.id);
      setStatusMsg("✓ Profile saved");
    } catch (e: any) {
      setStatusMsg("Error saving: " + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  // ── Generate briefing ─────────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!selectedProfileId) {
      setStatusMsg("Save a profile first to generate a briefing.");
      return;
    }
    setIsGenerating(true);
    setStatusMsg(null);
    try {
      const res = await generateScript({}, null, selectedProfileId);
      await startRender(res.script_id);
      setStatusMsg("✓ Briefing generated! Check the main page.");
    } catch (e: any) {
      setStatusMsg("Error: " + e.message);
    } finally {
      setIsGenerating(false);
    }
  };

  // ── Sync ──────────────────────────────────────────────────────────────────
  const handleSync = async () => {
    setIsSyncing(true);
    setStatusMsg(null);
    try {
      const { syncNews, syncGithub } = await import("@/lib/api");
      const tasks = [];
      if (enabledModules.has("ai_news_delta")) tasks.push(syncNews());
      if (enabledModules.has("github_prs") || enabledModules.has("github_mentions")) tasks.push(syncGithub());
      await Promise.allSettled(tasks);
      await loadConnectorStatus();
      setStatusMsg("✓ Sources synced");
    } catch (e: any) {
      setStatusMsg("Sync error: " + e.message);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card px-6 py-4 flex items-center gap-4 shrink-0">
        <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Zap className="w-5 h-5 text-primary" />
          </div>
          <h1 className="font-bold text-lg tracking-tight">Briefing Builder</h1>
        </div>
        <div className="flex-1" />
        {/* Auth input for internal key */}
        {!hasSession && (
          <input
            type="password"
            placeholder="Internal API Key (optional)"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            className="h-9 px-3 text-xs rounded-md bg-muted border border-border text-foreground w-48 font-mono outline-none"
          />
        )}
        <Link to="/connectors">
          <Button variant="outline" size="sm" className="h-9 border-zinc-800">
            <Share2 className="w-4 h-4 mr-2" />Connectors
          </Button>
        </Link>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar — Profile selector */}
        <aside className="w-64 shrink-0 border-r border-border bg-card/50 p-4 flex flex-col gap-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Profile</p>
          <select
            className="w-full h-9 px-3 text-sm rounded-md bg-secondary border border-border text-foreground font-mono focus:ring-1 focus:ring-primary outline-none"
            value={selectedProfileId || "none"}
            onChange={e => {
              const v = e.target.value;
              setSelectedProfileId(v === "none" ? null : v);
              localStorage.setItem("selectedProfileId", v);
            }}
          >
            <option value="none">— New Profile —</option>
            {profiles.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          <Button variant="outline" size="sm" onClick={handleSave} disabled={isSaving} className="w-full">
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {selectedProfileId ? "Save Profile" : "Create Profile"}
          </Button>

          <div className="border-t border-border pt-3 mt-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">Selected Modules</p>
            <div className="flex flex-col gap-1">
              {[...enabledModules].map(id => (
                <span key={id} className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-mono">
                  {MODULE_CATALOG[id]?.label ?? id}
                </span>
              ))}
              {enabledModules.size === 0 && (
                <span className="text-xs text-muted-foreground">No modules selected</span>
              )}
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xl font-bold">Select Modules</h2>
              <Button variant="ghost" size="sm" onClick={loadConnectorStatus} disabled={isLoadingConnectors}>
                <RefreshCw className={`w-3.5 h-3.5 mr-1 ${isLoadingConnectors ? "animate-spin" : ""}`} />
                Refresh Status
              </Button>
            </div>

            {/* Module grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {MODULE_ORDER.map(modId => {
                const mod = MODULE_CATALOG[modId];
                const isEnabled = enabledModules.has(modId);
                const isExpanded = expandedModule === modId;
                const settings = moduleSettings[modId] || {};

                return (
                  <div
                    key={modId}
                    className={`rounded-xl border transition-all duration-200 ${isEnabled ? "border-primary/40 bg-primary/5" : "border-border bg-card"}`}
                  >
                    {/* Module header */}
                    <div className="p-4 flex items-start gap-3">
                      <Switch
                        id={`module-${modId}`}
                        checked={isEnabled}
                        onCheckedChange={() => toggleModule(modId)}
                        className="mt-0.5 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <label htmlFor={`module-${modId}`} className="font-semibold text-sm cursor-pointer">
                          {mod.label}
                        </label>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{mod.description}</p>

                        {/* Connector requirement pills */}
                        {mod.requiredConnectors.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {mod.requiredConnectors.map(c => {
                              const st = connectorStatusFor(c.provider);
                              return (
                                <ConnectorPill
                                  key={c.provider}
                                  provider={c.provider}
                                  label={PROVIDER_LABEL[c.provider] ?? c.provider}
                                  optional={c.optional}
                                  status={st}
                                />
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Expand settings toggle */}
                      {isEnabled && (
                        <button
                          onClick={() => setExpandedModule(isExpanded ? null : modId)}
                          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors p-1"
                          title="Module settings"
                        >
                          <Settings2 className="w-4 h-4" />
                          {isExpanded ? <ChevronUp className="w-3 h-3 mt-0.5" /> : <ChevronDown className="w-3 h-3 mt-0.5" />}
                        </button>
                      )}
                    </div>

                    {/* Settings panel */}
                    {isEnabled && isExpanded && (
                      <div className="px-4 pb-4 border-t border-border/50 pt-3 space-y-3">
                        {/* Max items cap */}
                        {"caps" in mod.defaultSettings && (
                          <div className="flex items-center gap-3">
                            <label className="text-xs text-muted-foreground w-24">Max items</label>
                            <input
                              type="number"
                              min={1}
                              max={10}
                              value={(settings as any).caps ?? mod.defaultSettings.caps}
                              onChange={e => updateSetting(modId, "caps", e.target.value)}
                              className="w-20 h-8 px-2 text-sm rounded-md bg-muted border border-border text-foreground outline-none focus:ring-1 focus:ring-primary"
                            />
                            <span className="text-xs text-muted-foreground">(1–10)</span>
                          </div>
                        )}

                        {/* Keywords — only for ai_news_delta */}
                        {modId === "ai_news_delta" && (
                          <div className="space-y-2">
                            <label className="text-xs text-muted-foreground">Filter keywords</label>
                            <div className="flex gap-2">
                              <Input
                                value={keywordInput[modId] || ""}
                                onChange={e => setKeywordInput(prev => ({ ...prev, [modId]: e.target.value }))}
                                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addKeyword(modId); } }}
                                placeholder="Add keyword…"
                                className="h-8 text-xs"
                                maxLength={40}
                              />
                              <Button size="sm" variant="outline" className="h-8 px-3 text-xs" onClick={() => addKeyword(modId)}>
                                Add
                              </Button>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {((settings as any).filter_keywords || []).map((kw: string) => (
                                <span key={kw} className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-secondary text-foreground">
                                  {kw}
                                  <button onClick={() => removeKeyword(modId, kw)} className="text-muted-foreground hover:text-destructive ml-0.5">×</button>
                                </span>
                              ))}
                            </div>
                            <p className="text-[10px] text-muted-foreground">Max 30 keywords, each ≤ 40 characters.</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Missing connector CTA */}
            {connectorStatus.some(c => c.status === "missing" || c.status === "error") && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>Some required connectors are missing or have errors.</span>
                <Link to="/connectors">
                  <Button variant="outline" size="sm" className="h-7 text-xs border-amber-500/40">
                    Go to Connectors
                  </Button>
                </Link>
              </div>
            )}

            {/* Status message */}
            {statusMsg && (
              <div className={`text-sm px-4 py-2 rounded-lg ${statusMsg.startsWith("✓") ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-destructive/10 text-destructive border border-destructive/20"}`}>
                {statusMsg}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Bottom action bar */}
      <footer className="border-t border-border bg-card px-6 py-3 flex items-center gap-3 shrink-0">
        <Button variant="outline" size="sm" onClick={handleSync} disabled={isSyncing || enabledModules.size === 0}>
          {isSyncing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          Sync Sources
        </Button>
        <div className="flex-1" />
        <span className="text-xs text-muted-foreground">{enabledModules.size} module{enabledModules.size !== 1 ? "s" : ""} selected</span>
        <Button variant="outline" size="sm" onClick={handleSave} disabled={isSaving}>
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Save Profile
        </Button>
        <Button
          variant="default"
          size="sm"
          onClick={handleGenerate}
          disabled={isGenerating || enabledModules.size === 0}
          className="bg-primary hover:bg-primary/90"
        >
          {isGenerating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Zap className="w-4 h-4 mr-2" />}
          Generate Briefing
        </Button>
      </footer>
    </div>
  );
}

// ── Connector status pill ─────────────────────────────────────────────────────
function ConnectorPill({
  provider, label, optional, status
}: { provider: string; label: string; optional: boolean; status: "active" | "missing" | "error" | null }) {
  const color =
    status === "active" ? "bg-green-500/15 text-green-400 border-green-500/30" :
    status === "error"  ? "bg-red-500/15 text-red-400 border-red-500/30" :
    status === "missing"? "bg-amber-500/15 text-amber-400 border-amber-500/30" :
                          "bg-secondary text-muted-foreground border-border";

  const Icon =
    status === "active"  ? CheckCircle2 :
    status === "error"   ? XCircle :
    status === "missing" ? AlertCircle : null;

  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${color}`}>
      {Icon && <Icon className="w-2.5 h-2.5" />}
      {label}{optional ? " (opt)" : ""}
    </span>
  );
}
