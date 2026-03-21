import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getProfiles, upsertProfile, getModuleCatalog } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Settings, Rocket, Database, Activity, Clock, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDevMode, isDevModeEnabled } from "@/lib/devMode";
import { ProfileCard, TokenStatus } from "@/components/builder/SilentComponents";

import ModuleList from "@/components/builder/ModuleList";
import ModuleSettingsPanel from "@/components/builder/ModuleSettingsPanel";
import PreviewPanel from "@/components/builder/PreviewPanel";

export default function BriefingBuilder() {
  const [profiles, setProfiles] = useState<any[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [moduleCatalog, setModuleCatalog] = useState<any[]>([]);
  const [enabledModuleIds, setEnabledModuleIds] = useState<string[]>([]);
  const [moduleSettings, setModuleSettings] = useState<Record<string, any>>({});
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const [profileName, setProfileName] = useState("");
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [previewResult, setPreviewResult] = useState<any>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [connectorStatus, setConnectorStatus] = useState<Record<string, any>>({});
  const { isDevMode } = useDevMode();
  
  const [loginEmail, setLoginEmail] = useState("");
  const [isSendingMagicLink, setIsSendingMagicLink] = useState(false);

  useEffect(() => {
    checkSession();
    const handleDevModeSync = () => loadInitialData();
    window.addEventListener("storage_dev_mode", handleDevModeSync);
    window.addEventListener("storage", handleDevModeSync);
    return () => {
      window.removeEventListener("storage_dev_mode", handleDevModeSync);
      window.removeEventListener("storage", handleDevModeSync);
    };
  }, [authenticated, isDevMode]);

  async function checkSession() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setAuthenticated(false);
      if (isDevModeEnabled()) {
        loadInitialData();
        return;
      }
      setLoading(false);
      return;
    }
    setAuthenticated(true);
    loadInitialData();
  }

  async function loadInitialData() {
    setLoading(true);
    let profs: any[] = [];
    let catalog: any[] = [];

    if (isDevModeEnabled()) {
      profs = [
        { 
          id: "mock-1", 
          name: "CTO Technical Brief", 
          description: "Focuses on infrastructure, AI benchmarks, and security vulnerabilities.",
          enabled_modules: ["rss", "github"], 
          module_settings: {},
          persona: "Technical CTO",
          timezone: "UTC",
          updated_at: new Date().toISOString()
        },
        { 
          id: "mock-2", 
          name: "Venture Capitalist", 
          description: "Market trends, funding rounds, and emerging startup signals.",
          enabled_modules: ["rss"], 
          module_settings: {},
          persona: "Investor",
          timezone: "UTC",
          updated_at: new Date().toISOString()
        }
      ];
    }

    try {
      const [realProfs, realCatalog] = await Promise.all([
        getProfiles().catch(() => []), 
        getModuleCatalog().catch(() => [])
      ]);
      if (realProfs && realProfs.length > 0) profs = [...profs, ...realProfs];
      catalog = realCatalog || [];
    } catch (err: any) {
      console.warn("Builder API fail", err);
    } finally {
      setProfiles(profs);
      setModuleCatalog(catalog);
      const lastId = localStorage.getItem("selectedProfileId");
      if (lastId && profs.find(p => p.id === lastId)) {
        handleProfileSelect(lastId, profs);
      } else if (profs.length > 0) {
        handleProfileSelect(profs[0].id, profs);
      }
      setLoading(false);
    }
  }

  const handleProfileSelect = (id: string, profList = profiles) => {
    const p = (profList || []).find(x => x.id === id);
    if (!p) return;
    setSelectedProfileId(id);
    setProfileName(p.name);
    setEnabledModuleIds(p.enabled_modules || []);
    setModuleSettings(p.module_settings || {});
    localStorage.setItem("selectedProfileId", id);
    if (p.enabled_modules?.length > 0 && !selectedModuleId) {
       setSelectedModuleId(p.enabled_modules[0]);
    }
  };

  const handleLoginWithEmail = async () => {
    if (!loginEmail) return;
    setIsSendingMagicLink(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({ email: loginEmail });
      if (error) throw error;
      toast.success("Magic link sent!");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSendingMagicLink(false);
    }
  };

  if (loading) return <div className="p-8 animate-pulse text-muted-foreground">Loading Silent Architect...</div>;

  if (authenticated === false && !isDevMode) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6">
        <div className="w-20 h-20 rounded-3xl bg-white/5 flex items-center justify-center mb-4 border border-white/10">
           <Database className="w-10 h-10 text-[#5789FF]" />
        </div>
        <div className="space-y-2">
          <h2 className="text-3xl font-bold tracking-tight">Access Restricted</h2>
          <p className="text-muted-foreground max-w-sm">
            Sign in with your email to access the Silent Architect Orchestration Engine.
          </p>
        </div>
        <div className="flex flex-col gap-3 w-full max-w-sm">
          <Input 
            placeholder="your@email.com" 
            value={loginEmail} 
            onChange={e => setLoginEmail(e.target.value)}
            className="h-12 bg-white/5 border-white/10 text-center rounded-xl"
          />
          <Button onClick={handleLoginWithEmail} disabled={isSendingMagicLink || !loginEmail} className="sa-button-primary h-12 rounded-xl">
            {isSendingMagicLink ? "Sending..." : "Request Access"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-8 py-6 grid grid-cols-12 gap-10 min-h-full animate-in fade-in duration-1000">
      
      {/* COLUMN 1: Profiles & Frequency */}
      <div className="col-span-3 space-y-10">
        <section className="space-y-6">
          <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-white/40">Executive Profile</h3>
          <div className="space-y-4">
            {profiles.map(p => (
              <ProfileCard 
                key={p.id}
                title={p.name}
                description={p.description || "Personalized AI briefing profile for strategic oversight."}
                active={selectedProfileId === p.id}
                onClick={() => handleProfileSelect(p.id)}
              />
            ))}
          </div>
        </section>

        <section className="space-y-6">
          <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-white/40">Briefing Frequency</h3>
          <div className="grid grid-cols-2 gap-3">
             <Button variant="outline" className="h-14 bg-white/[0.02] border-white/5 hover:bg-white/5 rounded-xl font-bold text-[10px] uppercase tracking-widest text-white/60">Daily Morning</Button>
             <Button className="h-14 sa-button-primary rounded-xl font-bold text-[10px] uppercase tracking-widest">As-it-Happens</Button>
             <Button variant="outline" className="h-14 bg-white/[0.02] border-white/5 hover:bg-white/5 rounded-xl font-bold text-[10px] uppercase tracking-widest text-white/60">Weekly Recap</Button>
             <Button variant="outline" className="h-14 bg-white/[0.02] border-white/5 hover:bg-white/5 rounded-xl font-bold text-[10px] uppercase tracking-widest text-white/60">Custom Cron</Button>
          </div>
        </section>

        <TokenStatus used={12000} total={15000} />
      </div>

      {/* COLUMN 2: Intelligence Sources */}
      <div className="col-span-4 space-y-6">
        <div className="space-y-1">
          <h2 className="text-3xl font-extrabold tracking-tight text-white leading-tight">
            Configure Intelligence Sources
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Select and prioritize the data modules for the AI agent to ingest.
          </p>
        </div>

        <div className="space-y-4 pt-4">
          <ModuleList 
            modules={moduleCatalog}
            enabledModuleIds={enabledModuleIds}
            selectedModuleId={selectedModuleId}
            onToggle={(id) => setEnabledModuleIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])}
            onSelect={setSelectedModuleId}
            connectorStatus={connectorStatus}
            layout="silent" // We'll update ModuleList to handle this prop
          />
        </div>
      </div>

      {/* COLUMN 3: Briefing Preview */}
      <div className="col-span-5 flex flex-col">
        <div className="space-y-6 flex-1">
          <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-white/40">Briefing Preview</h3>
          <PreviewPanel 
            onPreview={() => {}}
            isLoading={isPreviewLoading}
            result={previewResult}
            layout="silent" // We'll update PreviewPanel to handle this prop
          />
        </div>
      </div>
    </div>
  );
}
