import React from "react";
import { 
  CheckCircle2, 
  AlertCircle, 
  Zap, 
  RefreshCw,
  Github,
  Mail,
  Rss,
  Slack,
  BookOpen,
  Plus,
  Key
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatCard } from "@/components/connectors/ConnectorCard";
import ConnectorCard from "@/components/connectors/ConnectorCard";
import SystemEvents, { OrchestrationHealth } from "@/components/connectors/DashboardPanels";
import ConfigModal from "@/components/connectors/ConfigModal";

export default function Connectors() {
  const [isConfigOpen, setIsConfigOpen] = React.useState(false);
  const [configTitle, setConfigTitle] = React.useState("");
  const [selectedProvider, setSelectedProvider] = React.useState<string | null>(null);

  const handleConfigure = (title: string, provider: string) => {
    setConfigTitle(title);
    setSelectedProvider(provider);
    setIsConfigOpen(true);
  };

  return (
    <div className="px-10 py-8 space-y-12 animate-in fade-in duration-1000">
      {/* Header Section */}
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <h1 className="text-4xl font-extrabold tracking-tight text-white leading-tight">Connectors</h1>
          <p className="text-sm text-muted-foreground max-w-xl leading-relaxed">
            Manage external integrations, data ingestion points, and secure vault credentials for your AI pipelines.
          </p>
        </div>
        <div className="flex items-center gap-4 pt-2">
          <Button variant="outline" className="h-12 bg-white/5 border-white/10 hover:bg-white/10 rounded-xl text-[10px] font-bold uppercase tracking-widest text-white/80 flex items-center gap-2 px-6">
            <Key className="w-4 h-4 text-[#5789FF]" />
            Manage Vault Secrets
          </Button>
          <Button className="sa-button-primary h-12 rounded-xl text-[10px] font-bold uppercase tracking-widest px-8 shadow-[0_10px_20px_rgba(87,137,255,0.2)]">
            <Plus className="w-4 h-4 mr-2" /> Add Connector
          </Button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-4 gap-6">
        <StatCard 
          icon={CheckCircle2} 
          label="Total Healthy" 
          value="12/14" 
          colorClass="bg-emerald-500/10 text-emerald-500 border-emerald-500/10" 
        />
        <StatCard 
          icon={AlertCircle} 
          label="Active Incidents" 
          value="02" 
          colorClass="bg-rose-500/10 text-rose-500 border-rose-500/10" 
        />
        <StatCard 
          icon={Zap} 
          label="Latency (Avg)" 
          value="124ms" 
          colorClass="bg-amber-500/10 text-amber-500 border-amber-500/10" 
        />
        <StatCard 
          icon={RefreshCw} 
          label="Sync Volume (24h)" 
          value="1.4 GB" 
          colorClass="bg-indigo-500/10 text-indigo-500 border-indigo-500/10" 
        />
      </div>

      {/* Connectors Grid */}
      <div className="grid grid-cols-3 gap-8">
        <ConnectorCard 
          icon={Github}
          iconBg="bg-white/10 text-white"
          title="GitHub Enterprise"
          description="Automated code reviews and PR analysis synchronization."
          status="healthy"
          statusLabel="Healthy"
          stats={[{label: 'Last Sync', value: '2 mins ago'}, {label: 'Uptime', value: '99.98%'}]}
          onConfigure={() => handleConfigure("GitHub Enterprise", "github")}
        />
        <ConnectorCard 
          icon={Mail}
          iconBg="bg-blue-500/20 text-blue-400"
          title="Gmail Workspace"
          description="Semantic search over inbox and automated task triage."
          status="error"
          statusLabel="Connection Lost"
          stats={[{label: 'Auth Error', value: 'Token Expired'}, {label: 'Last Sync', value: '4h 12m ago'}]}
          onConfigure={() => handleConfigure("Gmail Workspace", "google")}
        />
        <ConnectorCard 
          icon={Rss}
          iconBg="bg-orange-500/20 text-orange-400"
          title="Global Tech News"
          description="Multi-source RSS feed for real-time market sentiment analysis."
          status="healthy"
          statusLabel="Healthy"
          stats={[{label: 'Feeds', value: '14 Active'}, {label: 'Last Sync', value: '12s ago'}]}
          onConfigure={() => handleConfigure("Global Tech News", "rss")}
        />
        <ConnectorCard 
          icon={Slack}
          iconBg="bg-[#3EB489]/20 text-[#3EB489]"
          title="Slack Dev Hub"
          description="Relay pipeline alerts and receive human-in-the-loop approvals."
          status="healthy"
          statusLabel="Healthy"
          stats={[{label: 'Last Sync', value: 'Just now'}, {label: 'Events', value: '1.2k today'}]}
          onConfigure={() => handleConfigure("Slack Dev Hub", "slack")}
        />
        <ConnectorCard 
          icon={BookOpen}
          iconBg="bg-amber-500/20 text-amber-400"
          title="Notion Knowledge Base"
          description="Vector indexing of technical documentation and internal wikis."
          status="warning"
          statusLabel="Warning"
          stats={[{label: 'Status', value: 'Partial Sync'}, {label: 'Latency', value: '850ms'}]}
          onConfigure={() => handleConfigure("Notion Knowledge Base", "notion")}
        />
        
        {/* Integrate New Service Card */}
        <div className="sa-card p-10 border-dashed border-white/10 flex flex-col items-center justify-center text-center space-y-4 group cursor-pointer hover:border-[#5789FF]/50 transition-all">
          <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-white/20 group-hover:text-[#5789FF] group-hover:bg-[#5789FF]/10 transition-all">
             <Plus className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h4 className="font-bold text-white/40">Integrate New Service</h4>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest">S3, Postgres, Twilio, and more.</p>
          </div>
        </div>
      </div>

      {/* Footer System Panels */}
      <div className="grid grid-cols-3 gap-8 pb-12">
        <div className="col-span-2">
          <SystemEvents />
        </div>
        <div className="col-span-1 space-y-8">
          <OrchestrationHealth />
          
          <div className="sa-card p-8 bg-gradient-to-br from-[#111928] to-black border-none relative overflow-hidden group">
            <div className="absolute top-[-20%] right-[-20%] w-[150px] h-[150px] bg-[#5789FF]/5 rounded-full blur-[40px] group-hover:bg-[#5789FF]/10 transition-all duration-700" />
            <div className="space-y-4 relative z-10">
              <h4 className="text-white font-bold text-lg">Vault Auto-Rotate</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Automatic credential rotation is enabled for 8/12 connectors. Your security posture is optimized.
              </p>
              <button className="text-[10px] font-black uppercase tracking-widest text-[#5789FF] hover:underline flex items-center gap-2">
                Audit Vault Settings <Zap className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <ConfigModal 
        isOpen={isConfigOpen} 
        onClose={() => setIsConfigOpen(false)} 
        title={configTitle} 
        provider={selectedProvider}
      />
    </div>
  );
}
