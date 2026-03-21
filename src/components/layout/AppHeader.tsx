import { useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw, User, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getProfiles, BriefingProfile, syncRequiredConnectors } from "@/lib/api";

const PAGE_TITLES: Record<string, string> = {
  "/today": "Today's Briefing",
  "/builder": "Briefing Builder",
  "/connectors": "Data Connectors",
  "/reading-list": "Reading List",
  "/history": "Briefing History",
};

export default function AppHeader() {
  const location = useLocation();
  const [profiles, setProfiles] = useState<BriefingProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(localStorage.getItem("selectedProfileId"));
  const [isSyncing, setIsSyncing] = useState(false);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setUser(session?.user ?? null));
    getProfiles().then(setProfiles).catch(console.error);
  }, []);

  const currentTitle = PAGE_TITLES[location.pathname] || "Morning Brief";

  const handleSync = async () => {
    if (!selectedProfileId) return;
    setIsSyncing(true);
    try {
      await syncRequiredConnectors(selectedProfileId, "best_effort");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSignOut = () => supabase.auth.signOut();

  return (
    <header className="h-16 border-b border-border bg-card px-6 flex items-center justify-between shrink-0">
      <h2 className="font-semibold text-lg">{currentTitle}</h2>
      
      <div className="flex items-center gap-4">
        {/* Profile Picker */}
        <select
          className="h-9 px-3 text-xs rounded-md bg-secondary border border-border text-foreground outline-none focus:ring-1 focus:ring-primary min-w-[140px]"
          value={selectedProfileId || ""}
          onChange={(e) => {
            const val = e.target.value;
            setSelectedProfileId(val);
            localStorage.setItem("selectedProfileId", val);
          }}
        >
          <option value="" disabled>Select Profile</option>
          {profiles.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        <Button 
          variant="outline" 
          size="sm" 
          className="h-9 px-3 gap-2 border-zinc-800" 
          onClick={handleSync}
          disabled={isSyncing || !selectedProfileId}
        >
          <RefreshCw className={isSyncing ? "w-4 h-4 animate-spin" : "w-4 h-4"} />
          <span className="hidden sm:inline">Sync</span>
        </Button>

        <div className="w-px h-6 bg-border mx-1" />

        {user ? (
          <Button variant="ghost" size="sm" className="h-9 px-2 gap-2 text-muted-foreground hover:text-foreground" onClick={handleSignOut}>
            <LogOut className="w-4 h-4" />
          </Button>
        ) : (
          <Button variant="ghost" size="sm" className="h-9 px-2 gap-2 text-muted-foreground hover:text-foreground">
            <User className="w-4 h-4" />
          </Button>
        )}
      </div>
    </header>
  );
}
