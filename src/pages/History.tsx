import React from "react";
import { Clock, History as HistoryIcon } from "lucide-react";

export default function History() {
  return (
    <div className="flex-1 flex items-center justify-center p-8 text-center animate-in fade-in duration-700 h-full">
      <div className="space-y-4 flex flex-col items-center">
        <div className="w-16 h-16 rounded-3xl bg-white/5 flex items-center justify-center border border-white/10 mb-4">
           <HistoryIcon className="w-8 h-8 text-[#5789FF]" />
        </div>
        <h2 className="text-2xl font-bold text-white">Briefing History</h2>
        <p className="text-muted-foreground italic max-w-sm">
          Your past daily briefings will be archived here soon. This feature is part of the v1.2 roadmap.
        </p>
      </div>
    </div>
  );
}
