import React from "react";
import { cn } from "@/lib/utils";
import { X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function ConfigModal({ isOpen, onClose, title }: any) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      
      <div className="sa-card w-full max-w-xl p-10 space-y-8 relative animate-in zoom-in-95 duration-300 shadow-[0_0_100px_rgba(0,0,0,0.5)]">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h2 className="text-3xl font-extrabold tracking-tight text-white">{title}</h2>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.5)]" />
              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Connected</span>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors">
            <X className="w-5 h-5 text-white/40" />
          </button>
        </div>

        <div className="space-y-8">
          <div className="space-y-3">
            <Label className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">Repository URL</Label>
            <Input 
              defaultValue="github.com/silent-architect/core-orchestrator"
              className="h-14 bg-black/40 border-white/5 rounded-xl text-white font-medium focus:ring-1 focus:ring-[#5789FF]/50"
            />
          </div>

          <div className="space-y-3">
            <Label className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">Sync Frequency</Label>
            <Select defaultValue="realtime">
              <SelectTrigger className="h-14 bg-black/40 border-white/5 rounded-xl text-white font-medium">
                <SelectValue placeholder="Select frequency" />
              </SelectTrigger>
              <SelectContent className="sa-card border-white/10 text-white">
                <SelectItem value="realtime">Real-time</SelectItem>
                <SelectItem value="hourly">Every Hour</SelectItem>
                <SelectItem value="daily">Once Daily</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-4">
            <Label className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">Data Types to Index</Label>
            <div className="grid grid-cols-2 gap-3">
              <ConfigCheckbox label="PRs" checked />
              <ConfigCheckbox label="Issues" checked />
              <ConfigCheckbox label="Commit Messages" />
              <ConfigCheckbox label="Wiki" />
            </div>
          </div>

          <div className="p-6 bg-[#111928] border border-white/5 rounded-2xl flex items-center gap-4 group">
            <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-[#5789FF]">
               <Check className="w-5 h-5" />
            </div>
            <div className="flex-1">
               <span className="text-[9px] font-black uppercase tracking-widest text-white/30">Authentication</span>
               <p className="text-xs font-bold text-white/80">Using Vault Secret ID: <span className="text-[#5789FF]">gh_enterprise_pat_v1</span></p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-4 pt-4">
          <button onClick={onClose} className="text-[11px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors">Cancel</button>
          <Button className="sa-button-primary h-14 px-10 rounded-xl text-[11px] font-bold uppercase tracking-widest shadow-[0_10px_30px_rgba(87,137,255,0.3)]">
            Save Configuration
          </Button>
        </div>
      </div>
    </div>
  );
}

function ConfigCheckbox({ label, checked: initialChecked }: any) {
  const [checked, setChecked] = React.useState(!!initialChecked);
  return (
    <div 
      onClick={() => setChecked(!checked)}
      className={cn(
        "flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all",
        checked ? "bg-[#5789FF]/10 border-[#5789FF]/30" : "bg-black/40 border-white/5 opacity-50 hover:opacity-100"
      )}
    >
      <div className={cn(
        "w-5 h-5 rounded flex items-center justify-center transition-all",
        checked ? "bg-[#5789FF] text-white" : "border border-white/20"
      )}>
        {checked && <Check className="w-3 h-3" />}
      </div>
      <span className="text-xs font-bold text-white/90">{label}</span>
    </div>
  );
}
