import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Loader2, Zap, Settings2, Share2, CheckCircle2, AlertCircle, XCircle, ChevronDown, ChevronUp, ArrowLeft, RefreshCw } from "lucide-react";
import { getProfiles, upsertProfile, BriefingProfile, assembleUserData, previewPlan, getModuleCatalog, PublicModuleDefinition } from "@/lib/api";
import { generateScript, startRender, setInternalApiKey } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";

const PROVIDER_LABEL: Record<string, string> = {
  rss: "RSS", github: "GitHub", google: "Gmail", calendar: "Calendar", jira: "Jira", weather: "Weather",
};

type ConnectorStatusSummary = Array<{ provider: string; status: "active" | "missing" | "error" }>;

export default function BriefingBuilder() {
  const [catalog, setCatalog] = useState<PublicModuleDefinition[]>([]);
  const [profiles, setProfiles] = useState<BriefingProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(
    localStorage.getItem("selectedProfileId") !== "mock-default"
      ? localStorage.getItem("selectedProfileId")
      : null
  );
  const [enabledModules, setEnabledModules] = useState<Set<string>>(new Set());
  const [moduleSettings, setModuleSettings] = useState<Record<string, any>>({});
  const [expandedModule, setExpandedModule] = useState<string | null>(null);
  const [connectorStatus, setConnectorStatus] = useState<ConnectorStatusSummary>([]);
  const [isLoadingConnectors, setIsLoadingConnectors] = useState(false);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [keywordInput, setKeywordInput] = useState<Record<string, string>>({});
  const [hasSession, setHasSession] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [previewPlans, setPreviewPlans] = useState<any[] | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setHasSession(!!session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setHasSession(!!s));
    return () => subscription.unsubscribe();
  }, []);

  // ── Load Catalog ──────────────────────────────────────────────────────────
  useEffect(() => {
    setIsLoadingCatalog(true);
    getModuleCatalog()
      .then(setCatalog)
      .catch(err => {
        console.error("Failed to load catalog:", err);
        setStatusMsg("Failed to load module catalog.");
      })
      .finally(() => setIsLoadingCatalog(false));
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
    if (!selectedProfileId) {
        // Reset to defaults if no profile selected
        setEnabledModules(new Set());
        setModuleSettings({});
        return;
    }
    const profile = profiles.find(p => p.id === selectedProfileId);
    if (profile) {
      setEnabledModules(new Set(profile.enabled_modules));
      setModuleSettings(profile.module_settings || {});
    }
  }, [selectedProfileId, profiles]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const toggleModule = (id: string) => {
    setEnabledModules(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const updateSetting = (modId: string, key: string, value: any) => {
    setModuleSettings(prev => ({ ...prev, [modId]: { ...prev[modId], [key]: value } }));
  };

  const handleMultiselect = (modId: string, key: string, val: string) => {
    const current = (moduleSettings[modId]?.[key] || []) as string[];
    const next = current.includes(val) ? current.filter(v => v !== val) : [...current, val];
    updateSetting(modId, key, next);
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
  const handleSync = async (force = false) => {
    if (!hasSession && !apiKey) {
      setStatusMsg("Authentication required to sync sources.");
      return;
    }
    
    setIsSyncing(true);
    setStatusMsg(null);
    try {
      if (selectedProfileId) {
        const { syncRequiredConnectors } = await import("@/lib/api");
        const res = await syncRequiredConnectors(selectedProfileId, force ? "force" : "best_effort");
        const summary = res.results.map(r => `${PROVIDER_LABEL[r.provider] || r.provider}: ${r.outcome}${r.items_synced ? ` (+${r.items_synced})` : ""}`).join(", ");
        setStatusMsg(`✓ Sync complete: ${summary}`);
      } else {
        // Fallback for mock mode
        const { syncNews, syncGithub } = await import("@/lib/api");
        const tasks = [];
        if (enabledModules.has("ai_news_delta")) tasks.push(syncNews());
        if (enabledModules.has("github_prs") || enabledModules.has("github_mentions")) tasks.push(syncGithub());
        await Promise.allSettled(tasks);
        setStatusMsg("✓ Sources synced (Mock Mode)");
      }
      await loadConnectorStatus();
    } catch (e: any) {
      setStatusMsg("Sync error: " + e.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePreview = async () => {
    if (!selectedProfileId) {
      setStatusMsg("Save profile first to preview.");
      return;
    }
    setIsPreviewing(true);
    setStatusMsg(null);
    try {
      const { previewPlan } = await import("@/lib/api");
      const res = await previewPlan(selectedProfileId);
      setPreviewPlans(res.plan_summary.ordered);
      // Optional: Store the whole response if needed, but for now just the ordered list
      // In a real app we might want to show the by_module breakdown too.
    } catch (e: any) {
      setStatusMsg("Preview error: " + e.message);
    } finally {
      setIsPreviewing(false);
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

          <div className="border-t border-border pt-3 mt-1 overflow-y-auto">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">Selected Modules</p>
            <div className="flex flex-col gap-1">
              {[...enabledModules].map(id => {
                const mod = catalog.find(m => m.id === id);
                return (
                  <span key={id} className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-mono truncate">
                    {mod?.label ?? id}
                  </span>
                );
              })}
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

            {isLoadingCatalog ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
                    <Loader2 className="w-8 h-8 animate-spin" />
                    <p>Loading module catalog...</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {catalog.map(mod => {
                    const modId = mod.id;
                    const isEnabled = enabledModules.has(modId);
                    const isExpanded = expandedModule === modId;
                    const settings = moduleSettings[modId] || {};
                    const isComingSoon = mod.availability === "coming_soon";

                    return (
                    <div
                        key={modId}
                        className={`rounded-xl border transition-all duration-200 ${isEnabled ? "border-primary/40 bg-primary/5" : "border-border bg-card"} ${isComingSoon ? "opacity-60" : ""}`}
                    >
                        <div className="p-4 flex items-start gap-3">
                        <Switch
                            id={`module-${modId}`}
                            disabled={isComingSoon}
                            checked={isEnabled}
                            onCheckedChange={() => toggleModule(modId)}
                            className="mt-0.5 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <label htmlFor={`module-${modId}`} className={`font-semibold text-sm ${isComingSoon ? "cursor-not-allowed" : "cursor-pointer"}`}>
                                    {mod.label}
                                </label>
                                {mod.availability !== "ready" && (
                                    <Badge variant="outline" className={`text-[9px] px-1.5 py-0 uppercase ${mod.availability === "beta" ? "text-blue-400 border-blue-500/30" : "text-muted-foreground"}`}>
                                        {mod.availability}
                                    </Badge>
                                )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{mod.description}</p>

                            {mod.requiredConnectors.length > 0 && !isComingSoon && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                                {mod.requiredConnectors.map(c => {
                                const st = connectorStatusFor(c.provider);
                                return (
                                    <ConnectorPill
                                    key={c.provider}
                                    provider={c.provider}
                                    label={PROVIDER_LABEL[c.provider] ?? c.provider}
                                    status={st}
                                    />
                                );
                                })}
                            </div>
                            )}
                        </div>

                        {isEnabled && mod.settingsUi.length > 0 && (
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

                        {isEnabled && isExpanded && (
                        <div className="px-4 pb-4 border-t border-border/50 pt-3 space-y-4">
                            {mod.settingsUi.map(ui => (
                                <div key={ui.key} className="space-y-2">
                                    <label className="text-xs font-medium text-muted-foreground">{ui.label}</label>
                                    
                                    {ui.type === "number" && (
                                        <div className="flex items-center gap-3">
                                            <Input
                                                type="number"
                                                value={settings[ui.key] ?? mod.defaults.settings[ui.key] ?? 0}
                                                onChange={e => updateSetting(modId, ui.key, parseInt(e.target.value))}
                                                className="w-24 h-8 text-xs"
                                            />
                                        </div>
                                    )}

                                    {ui.type === "text" && (
                                        <Input
                                            value={settings[ui.key] ?? mod.defaults.settings[ui.key] ?? ""}
                                            onChange={e => updateSetting(modId, ui.key, e.target.value)}
                                            className="h-8 text-xs"
                                        />
                                    )}

                                    {ui.type === "multiselect" && (
                                        <div className="flex flex-wrap gap-1.5">
                                            {ui.options?.map(opt => {
                                                const isActive = (settings[ui.key] || mod.defaults.settings[ui.key] || []).includes(opt);
                                                return (
                                                    <button
                                                        key={opt}
                                                        onClick={() => handleMultiselect(modId, ui.key, opt)}
                                                        className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${isActive ? "bg-primary/20 border-primary/40 text-primary" : "bg-muted border-border text-muted-foreground hover:border-muted-foreground"}`}
                                                    >
                                                        {opt}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                        )}
                    </div>
                    );
                })}
                </div>
            )}

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

            {statusMsg && (
              <div className={`text-sm px-4 py-2 rounded-lg ${statusMsg.startsWith("✓") ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-destructive/10 text-destructive border border-destructive/20"}`}>
                {statusMsg}
              </div>
            )}
          </div>

          {/* Preview Overlay */}
          {previewPlans && (
            <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
              <div className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl overflow-hidden">
                <div className="p-4 border-b border-border flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-primary" />
                    <h3 className="font-bold">Briefing Plan Preview</h3>
                    <Badge variant="secondary" className="ml-2">{previewPlans.length} Segments</Badge>
                  </div>
                  <button onClick={() => setPreviewPlans(null)} className="text-muted-foreground hover:text-foreground">
                    <XCircle className="w-5 h-5" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {previewPlans.map((p, idx) => (
                    <div key={idx} className="flex gap-4 p-3 rounded-lg bg-secondary/30 border border-border/50">
                      <div className="w-8 h-8 rounded bg-primary/10 text-primary flex items-center justify-center shrink-0 font-bold text-xs">
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm">{p.title || "Untitled Segment"}</span>
                          <Badge variant="outline" className="text-[10px] py-0">{p.segment_kind}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 truncate">Grounding: {p.grounding_source_ids.slice(0, 2).join(", ")}</p>
                        {p.action?.is_active && (
                          <div className="mt-2 text-[10px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 inline-block border border-blue-500/20">
                            Action: {p.action.action_button_text}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {previewPlans.length === 0 && (
                    <div className="text-center py-12 space-y-4">
                      <div className="text-muted-foreground italic">
                        No segments will be generated with current data.
                      </div>
                      <Button variant="outline" size="sm" onClick={() => { setPreviewPlans(null); handleSync(); }}>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Sync Sources Now
                      </Button>
                    </div>
                  )}
                </div>
                <div className="p-4 border-t border-border flex justify-end">
                  <Button onClick={() => setPreviewPlans(null)}>Close Preview</Button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Bottom action bar */}
      <footer className="border-t border-border bg-card px-6 py-3 flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-1">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => handleSync(false)} 
            disabled={isSyncing || (selectedProfileId === null && enabledModules.size === 0)}
            className="rounded-r-none border-r-0"
          >
            {isSyncing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Sync Sources
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleSync(true)}
            disabled={isSyncing || !selectedProfileId}
            className="rounded-l-none px-2"
            title="Force sync (bypass cooldown)"
          >
            <Zap className="w-3.5 h-3.5" />
          </Button>
        </div>
        <div className="flex-1" />
        <span className="text-xs text-muted-foreground">{enabledModules.size} module{enabledModules.size !== 1 ? "s" : ""} selected</span>
        <Button variant="outline" size="sm" onClick={handleSave} disabled={isSaving}>
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Save Profile
        </Button>
        <Button variant="outline" size="sm" onClick={handlePreview} disabled={isPreviewing || enabledModules.size === 0}>
           {isPreviewing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Settings2 className="w-4 h-4 mr-2" />}
           Preview Plan
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

function ConnectorPill({
  provider, label, status
}: { provider: string; label: string; status: "active" | "missing" | "error" | null }) {
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
      {label}
    </span>
  );
}
