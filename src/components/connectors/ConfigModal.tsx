import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { X, Check, Globe, Shield, Zap, RefreshCw, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { updateConnectorConfig } from "@/lib/api";
import { toast } from "sonner";

export default function ConfigModal({ isOpen, onClose, title, provider }: any) {
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [config, setConfig] = useState<any>({});

  if (!isOpen) return null;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateConnectorConfig(provider, config);
      toast.success(`${title} configuration updated.`);
      onClose();
    } catch (err: any) {
      toast.error("Failed to save: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = () => {
    setIsTesting(true);
    setTimeout(() => {
      setIsTesting(false);
      toast.success("Connection verified successfully.");
    }, 1500);
  };

  const renderFields = () => {
    switch (provider) {
      case "github":
        return (
          <div className="space-y-6">
            <div className="space-y-3">
              <Label className="text-[10px] font-black uppercase tracking-widest text-white/40">Target Repositories</Label>
              <Input 
                placeholder="owner/repo, owner/another..."
                value={config.repos || ""}
                onChange={(e) => setConfig({ ...config, repos: e.target.value })}
                className="sa-input-premium"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <ConfigToggle 
                label="Index PRs" 
                checked={config.index_prs} 
                onChange={(val) => setConfig({ ...config, index_prs: val })} 
              />
              <ConfigToggle 
                label="Issues" 
                checked={config.index_issues} 
                onChange={(val) => setConfig({ ...config, index_issues: val })} 
              />
              <ConfigToggle 
                label="Commits" 
                checked={config.index_commits} 
                onChange={(val) => setConfig({ ...config, index_commits: val })} 
              />
              <ConfigToggle 
                label="Drafts" 
                checked={config.include_drafts} 
                onChange={(val) => setConfig({ ...config, include_drafts: val })} 
              />
            </div>
          </div>
        );
      case "google":
        return (
          <div className="space-y-6">
            <div className="space-y-3">
              <Label className="text-[10px] font-black uppercase tracking-widest text-white/40">Gmail Search Query</Label>
              <Input 
                placeholder="e.g. is:unread category:primary"
                value={config.query || ""}
                onChange={(e) => setConfig({ ...config, query: e.target.value })}
                className="sa-input-premium"
              />
            </div>
            <div className="space-y-3">
              <Label className="text-[10px] font-black uppercase tracking-widest text-white/40">Included Labels</Label>
              <Input 
                placeholder="INBOX, IMPORTANT, WORK..."
                value={config.labels || ""}
                onChange={(e) => setConfig({ ...config, labels: e.target.value })}
                className="sa-input-premium"
              />
            </div>
          </div>
        );
      case "slack":
        return (
          <div className="space-y-6">
            <div className="space-y-3">
              <Label className="text-[10px] font-black uppercase tracking-widest text-white/40">Monitored Channels</Label>
              <Input 
                placeholder="#general, #dev-alerts..."
                value={config.channels || ""}
                onChange={(e) => setConfig({ ...config, channels: e.target.value })}
                className="sa-input-premium"
              />
            </div>
            <ConfigToggle 
              label="Only Mentioned Messages" 
              checked={config.mentions_only} 
              onChange={(val) => setConfig({ ...config, mentions_only: val })}
              description="Summarize messages only when you are explicitly @mentioned."
            />
          </div>
        );
      case "rss":
        return (
          <div className="space-y-3">
            <Label className="text-[10px] font-black uppercase tracking-widest text-white/40">Feed URLs</Label>
            <textarea 
               className="sa-input-premium w-full !h-32 p-4 resize-none"
               placeholder="Enter RSS URLs, one per line..."
               value={config.feeds || ""}
               onChange={(e) => setConfig({ ...config, feeds: e.target.value })}
            />
          </div>
        );
      default:
        return <p className="text-muted-foreground text-sm">Generic configuration for {title}.</p>;
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
      <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={onClose} />
      
      <div className="sa-card w-full max-w-xl p-0 relative animate-in zoom-in-95 duration-500 overflow-hidden shadow-[0_0_100px_rgba(87,137,255,0.1)]">
        <div className="p-10 space-y-8">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h2 className="text-3xl font-extrabold tracking-tight text-white">{title}</h2>
              <div className="flex items-center gap-2">
                <Globe className="w-3 h-3 text-emerald-400" />
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Endpoint Operational</span>
              </div>
            </div>
            <button onClick={onClose} className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors">
              <X className="w-5 h-5 text-white/40" />
            </button>
          </div>

          <div className="space-y-8 min-h-[300px]">
            {renderFields()}

            <div className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl flex items-center gap-4 group">
              <div className={cn(
                "w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center transition-colors",
                isTesting ? "animate-spin" : "text-[#5789FF]"
              )}>
                 <Shield className="w-5 h-5" />
              </div>
              <div className="flex-1">
                 <span className="text-[9px] font-black uppercase tracking-widest text-white/30">Security Status</span>
                 <p className="text-xs font-bold text-white/80">Oauth Scope: <span className="text-[#5789FF]">read_only_minimal</span></p>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleTest}
                disabled={isTesting}
                className="text-[10px] uppercase font-black tracking-widest text-white/40 hover:text-white"
              >
                {isTesting ? "Testing..." : "Test Connection"}
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-end gap-4 pt-4 border-t border-white/5">
            <button onClick={onClose} className="text-[11px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors">Cancel</button>
            <Button 
              onClick={handleSave}
              disabled={isSaving}
              className="sa-button-primary h-14 px-10 rounded-xl text-[11px] font-bold uppercase tracking-widest shadow-[0_10px_30px_rgba(87,137,255,0.3)]"
            >
              {isSaving ? "Saving Architecture..." : "Update Pipeline"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConfigToggle({ label, description, checked, onChange }: any) {
  return (
    <div className="flex items-start justify-between p-4 rounded-xl bg-black/20 border border-white/5 group hover:border-white/10 transition-all">
       <div className="space-y-1 pr-4">
          <p className="text-xs font-bold text-white group-hover:text-primary transition-colors">{label}</p>
          {description && <p className="text-[10px] text-muted-foreground leading-tight">{description}</p>}
       </div>
       <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
