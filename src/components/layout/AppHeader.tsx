import React from "react";
import { 
  Bell, 
  ShieldCheck, 
  Rocket,
  User,
  Power,
  ChevronDown,
  RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDevMode } from "@/lib/devMode";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";

export default function AppHeader({ onSync }: { onSync: () => void }) {
  const { isDevMode, toggleDevMode } = useDevMode();
  const [user, setUser] = React.useState<any>(null);

  React.useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setUser(session?.user ?? null));
  }, []);

  return (
    <header className="h-20 border-b border-white/5 flex items-center justify-between px-8 bg-[#0B0E14]/50 backdrop-blur-md sticky top-0 z-50">
      <div className="flex items-center gap-8">
        <h2 className="text-xl font-bold tracking-tight text-white">Orchestrator</h2>
        
        <nav className="flex items-center gap-6">
          <button className="text-sm font-semibold text-white/90 hover:text-white transition-colors">Live Mode</button>
          <button 
            onClick={toggleDevMode}
            className={`text-sm font-semibold transition-colors ${isDevMode ? 'text-[#5789FF]' : 'text-white/40 hover:text-white/60'}`}
          >
            Developer Mode
          </button>
        </nav>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-4 border-r border-white/10 pr-6">
          <button className="text-white/40 hover:text-white transition-colors">
            <Bell className="w-5 h-5" />
          </button>
          <button className="text-[#5789FF]">
            <ShieldCheck className="w-5 h-5" />
          </button>
        </div>

        <Button className="bg-[#111928] border border-white/10 text-white hover:bg-white/5 px-6 h-10 rounded-xl flex items-center gap-2">
          <Rocket className="w-4 h-4 text-[#5789FF]" />
          <span>Deploy</span>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-200 to-orange-400 flex items-center justify-center border border-white/10 hover:shadow-[0_0_15px_rgba(87,137,255,0.2)] transition-all">
               <User className="w-5 h-5 text-orange-900" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 sa-card border-white/10 text-white p-2">
            <div className="px-2 py-1.5 text-xs text-muted-foreground uppercase font-bold tracking-widest">Account</div>
            <DropdownMenuItem className="focus:bg-white/5 focus:text-white cursor-pointer rounded-lg">
              Profile Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-white/5" />
            <DropdownMenuItem 
              onClick={() => supabase.auth.signOut()}
              className="text-red-400 focus:bg-red-400/10 focus:text-red-400 cursor-pointer rounded-lg flex items-center gap-2"
            >
              <Power className="w-4 h-4" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
