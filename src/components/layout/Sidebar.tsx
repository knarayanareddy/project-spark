import React from "react";
import { cn } from "@/lib/utils";
import { 
  LayoutDashboard, 
  Settings, 
  BookOpen, 
  Plus,
  Network,
  Terminal,
  ChevronRight
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";

const SidebarItem = ({ icon: Icon, label, href, active }: any) => (
  <Link 
    to={href}
    className={cn(
      "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group relative",
      active 
        ? "bg-white/5 text-white shadow-[0_0_20px_rgba(87,137,255,0.15)]" 
        : "text-muted-foreground hover:text-white hover:bg-white/5"
    )}
  >
    <Icon className={cn("w-5 h-5 transition-colors", active ? "text-[#5789FF]" : "group-hover:text-white")} />
    <span className="font-medium text-sm">{label}</span>
    {active && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-[#5789FF] rounded-r-full" />}
  </Link>
);

export default function Sidebar() {
  const location = useLocation();

  return (
    <aside className="w-64 h-full bg-[#0B0E14] border-r border-white/5 flex flex-col p-6 animate-in slide-in-from-left duration-700">
      {/* Brand */}
      <div className="flex flex-col gap-1 mb-10 px-2">
        <h1 className="text-xl font-extrabold tracking-tight text-white flex items-center gap-2">
          Silent Architect
        </h1>
        <p className="text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground opacity-50">
          AI ORCHESTRATION
        </p>
      </div>

      {/* Navigation */}
      <div className="flex-1 space-y-2">
        <SidebarItem 
          icon={LayoutDashboard} 
          label="Builder" 
          href="/builder" 
          active={location.pathname === "/builder"} 
        />
        <SidebarItem 
          icon={Network} 
          label="Connectors" 
          href="/connectors" 
          active={location.pathname === "/connectors"} 
        />
        <SidebarItem 
          icon={Terminal} 
          label="Developer Mode" 
          href="/dev-mode" 
          active={location.pathname === "/dev-mode"} 
        />
      </div>

      {/* Footer Actions */}
      <div className="mt-auto space-y-6">
        <Button className="w-full sa-button-primary rounded-2xl py-6 flex items-center gap-2 group">
          <Plus className="w-4 h-4 transition-transform group-hover:rotate-90" />
          <span>New Pipeline</span>
        </Button>

        <div className="space-y-1">
          <SidebarItem icon={Settings} label="Settings" href="/settings" />
          <SidebarItem icon={BookOpen} label="Documentation" href="/docs" />
        </div>
      </div>
    </aside>
  );
}
