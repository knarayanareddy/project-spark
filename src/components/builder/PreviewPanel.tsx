import React from "react";
import { cn } from "@/lib/utils";
import { Play, PlayCircle, Clock, Zap, Save, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PreviewPanel({ onPreview, isLoading, result, layout }: any) {
  if (layout === "silent") {
    return (
      <div className="flex flex-col h-full space-y-8 animate-in slide-in-from-right-4 duration-1000">
        
        {/* Video Stage */}
        <div className="relative aspect-video rounded-3xl overflow-hidden bg-[#111928] border border-white/5 shadow-2xl group cursor-pointer">
          <img 
            src="https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=60" 
            className="w-full h-full object-cover opacity-60 transition-transform duration-700 group-hover:scale-105"
            alt="Briefing Stage"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0B0E14] to-transparent opacity-80" />
          
          {/* Centered Play Button Mock */}
          <div className="absolute inset-0 flex items-center justify-center">
             <div className="w-16 h-16 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 transition-all group-hover:bg-[#5789FF] group-hover:border-[#5789FF] group-hover:scale-110 shadow-[0_0_30px_rgba(87,137,255,0.3)]">
                <Play className="w-6 h-6 text-white fill-current" />
             </div>
          </div>

          {/* Status Overlay */}
          <div className="absolute bottom-6 left-6 flex items-center gap-3">
             <div className="bg-red-500 text-white text-[9px] font-black px-2 py-1 rounded-sm uppercase tracking-tighter">GEN-4</div>
             <span className="text-xs text-white/90 font-semibold tracking-wide flex items-center gap-2">
               <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
               Drafting Script...
             </span>
          </div>
        </div>

        {/* Generated Summary Scrollbox */}
        <div className="flex-1 sa-card border-none bg-white/[0.02] p-8 overflow-y-auto space-y-8 relative">
          <div className="flex items-center gap-2 pb-4 border-b border-white/5 opacity-30">
             <div className="h-[1px] flex-1 bg-white" />
             <span className="text-[9px] font-bold uppercase tracking-[0.3em] whitespace-nowrap">Generated Summary</span>
             <div className="h-[1px] flex-1 bg-white" />
          </div>

          <div className="space-y-10 prose prose-invert max-w-none">
            <section className="space-y-3">
              <h4 className="text-white text-lg font-extrabold flex items-center gap-3">
                <div className="w-1 h-3 bg-[#5789FF] rounded-full" />
                Infrastructure Signal:
              </h4>
              <p className="text-muted-foreground text-sm leading-[1.8] pl-4 italic">
                "Critical vulnerabilities detected in Kubernetes v1.28 cluster. Patches required for all edge nodes before 09:00 UTC."
              </p>
            </section>

            <section className="space-y-3">
              <h4 className="text-white text-lg font-extrabold flex items-center gap-3">
                <div className="w-1 h-3 bg-[#5789FF] rounded-full" />
                AI Research:
              </h4>
              <p className="text-muted-foreground text-sm leading-[1.8] pl-4">
                LangChain released a major update to memory orchestration. This could reduce our LLM latency by approximately 14%.
              </p>
            </section>

            <section className="space-y-3">
              <h4 className="text-white text-lg font-extrabold flex items-center gap-3">
                <div className="w-1 h-3 bg-[#5789FF] rounded-full" />
                Industry Outlook:
              </h4>
              <p className="text-muted-foreground text-sm leading-[1.8] pl-4">
                Competitor A has pivot to vertical AI integration. Recommend shifting focus of Q3 sprint to automated reasoning modules.
              </p>
            </section>

            <div className="pt-6 animate-pulse">
               <p className="text-[11px] text-[#5789FF]/60 font-medium italic">Processing Gmail threads for project 'Phoenix'...</p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-4 pb-4">
           <Button variant="outline" className="h-16 bg-white/[0.02] border-white/5 text-muted-foreground hover:bg-white/5 hover:text-white rounded-2xl font-bold uppercase tracking-widest text-xs flex items-center gap-3">
              <Save className="w-4 h-4" /> Save Draft
           </Button>
           <Button className="h-16 sa-button-primary rounded-2xl font-bold uppercase tracking-widest text-xs flex items-center gap-3 shadow-[0_10px_30px_rgba(87,137,255,0.3)]">
              <CheckCircle2 className="w-4 h-4" /> Finalize
           </Button>
        </div>
      </div>
    );
  }

  // Fallback...
  return null;
}
