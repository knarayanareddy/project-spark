import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getProfiles, upsertProfile, deleteProfile, getModuleCatalog } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Trash2, Edit3, Settings, Save, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

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
  const [loading, setLoading] = useState(false);
  const [previewResult, setPreviewResult] = useState<any>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [connectorStatus, setConnectorStatus] = useState<Record<string, any>>({});

  useEffect(() => {
    loadInitialData();
  }, []);

  async function loadInitialData() {
    setLoading(true);
    try {
      const [profs, catalog] = await Promise.all([getProfiles(), getModuleCatalog()]);
      setProfiles(profs);
      setModuleCatalog(catalog);
      
      const lastId = localStorage.getItem("selectedProfileId");
      if (lastId && profs.find(p => p.id === lastId)) {
        handleProfileSelect(lastId, profs);
      } else if (profs.length > 0) {
        handleProfileSelect(profs[0].id, profs);
      }
    } catch (err: any) {
      toast.error("Failed to load builder data");
    } finally {
      setLoading(false);
    }
  }

  const handleProfileSelect = (id: string, profList = profiles) => {
    const p = profList.find(x => x.id === id);
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

  const handleToggleModule = (id: string) => {
    setEnabledModuleIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
    if (!selectedModuleId) setSelectedModuleId(id);
  };

  const updateModuleSetting = (key: string, value: any) => {
    if (!selectedModuleId) return;
    setModuleSettings(prev => ({
      ...prev,
      [selectedModuleId]: {
        ...(prev[selectedModuleId] || {}),
        [key]: value
      }
    }));
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const profileData = {
        id: selectedProfileId || undefined,
        user_id: user.id,
        name: profileName || "My Briefing",
        enabled_modules: enabledModuleIds,
        module_settings: moduleSettings,
      };

      const saved = await upsertProfile(profileData);
      toast.success("Profile saved successfully");
      loadInitialData(); // Refresh list
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePreview = async () => {
    if (!selectedProfileId) return;
    setIsPreviewLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("preview-plan", {
        body: { profile_id: selectedProfileId }
      });
      if (error) throw error;
      setPreviewResult(data);
      if (data.connector_status) setConnectorStatus(data.connector_status);
    } catch (err: any) {
      toast.error("Preview failed: " + err.message);
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const selectedModule = moduleCatalog.find(m => m.id === selectedModuleId);

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden animate-in fade-in duration-1000">
      <div className="flex-1 grid grid-cols-1 md:grid-cols-12 overflow-hidden">
        
        {/* Left column: Profiles & Modules */}
        <div className="md:col-span-3 flex flex-col border-r border-border bg-card/10 overflow-hidden">
          <div className="p-4 space-y-4 border-b border-border">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest pl-1">
                Selected Profile
              </label>
              <div className="flex gap-2">
                <select 
                  className="flex-1 h-9 bg-secondary border border-border rounded-md px-3 text-sm outline-none focus:ring-1 focus:ring-primary/20"
                  value={selectedProfileId || ""}
                  onChange={(e) => handleProfileSelect(e.target.value)}
                >
                  {profiles.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => {
                  setSelectedProfileId(null);
                  setProfileName("New Profile");
                  setEnabledModuleIds([]);
                  setModuleSettings({});
                }}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Input
                value={profileName}
                onChange={e => setProfileName(e.target.value)}
                placeholder="Profile Name"
                className="h-8 text-xs bg-transparent border-none focus-visible:ring-0 p-1 font-semibold"
              />
              <Badge variant="secondary" className="text-[9px] uppercase">Active</Badge>
            </div>
          </div>

          <ModuleList 
            modules={moduleCatalog}
            enabledModuleIds={enabledModuleIds}
            selectedModuleId={selectedModuleId}
            onToggle={handleToggleModule}
            onSelect={setSelectedModuleId}
            connectorStatus={connectorStatus}
          />
        </div>

        {/* Center column: Settings */}
        <div className="md:col-span-6 flex flex-col overflow-hidden relative">
          {selectedModule ? (
             <ModuleSettingsPanel 
                module={selectedModule}
                settings={moduleSettings[selectedModuleId!] || {}}
                onUpdate={updateModuleSetting}
                onSave={handleSave}
                isSaving={loading}
             />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-6 grayscale opacity-40">
              <div className="w-20 h-20 rounded-3xl bg-muted flex items-center justify-center">
                <Settings className="w-10 h-10 text-muted-foreground" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold">No Module Selected</h3>
                <p className="text-sm text-muted-foreground max-w-xs">
                  Pick a module from the sidebar to configure its preferences for this profile.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right column: Preview */}
        <div className="md:col-span-3 overflow-hidden">
          <PreviewPanel 
            onPreview={handlePreview}
            isLoading={isPreviewLoading}
            result={previewResult}
          />
        </div>
      </div>
    </div>
  );
}
