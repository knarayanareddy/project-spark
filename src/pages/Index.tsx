import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { VideoPlayer } from "@/components/VideoPlayer";
import { ActionCard } from "@/components/ActionCard";
import { DebugPanel } from "@/components/DebugPanel";
import { SegmentPlaylist } from "@/components/SegmentPlaylist";
import { generateScript, startRender, getJobStatus, setInternalApiKey, type SegmentStatus } from "@/lib/api";
import { mockUserPreferences, mockUserData, mockScriptJson } from "@/lib/mockData";
import { Loader2, Play, Clapperboard, Database, Zap, AlertCircle } from "lucide-react";

type AppState = "idle" | "generating" | "script_ready" | "rendering" | "ready" | "playing";

export default function Index() {
  const [state, setState] = useState<AppState>("idle");
  const [useMock, setUseMock] = useState(true);
  const [scriptId, setScriptId] = useState<string | null>(null);
  const [scriptJson, setScriptJson] = useState<any>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [segments, setSegments] = useState<SegmentStatus[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [apiKey, setApiKey] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const addError = (e: string) => setErrors((prev) => [...prev, e]);

  const handleGenerateScript = useCallback(async () => {
    setState("generating");
    setErrors([]);
    setScriptJson(null);
    setSegments([]);
    
    try {
      if (useMock) {
        // Use mock data directly — skip edge function for demo resilience
        await new Promise(r => setTimeout(r, 1500)); // Simulate delay
        const fakeId = crypto.randomUUID();
        setScriptId(fakeId);
        setScriptJson(mockScriptJson);
        const mockSegs: SegmentStatus[] = mockScriptJson.timeline.map((t) => ({
          segment_id: t.segment_id,
          avatar_video_url: null,
          b_roll_image_url: null,
          ui_action_card: t.ui_action_card,
          dialogue: t.dialogue,
          grounding_source_id: t.grounding_source_id,
          status: "queued",
          error: null,
        }));
        setSegments(mockSegs);
        setCurrentIdx(0);
        setState("script_ready");
      } else {
        if (!apiKey) throw new Error("Internal API Key required for live mode");
        setInternalApiKey(apiKey);
        const res = await generateScript(mockUserPreferences, mockUserData);
        setScriptId(res.script_id);
        setScriptJson(res.script_json);
        
        // Populate segments from the generated script (status = queued)
        const timeline = (res.script_json as any).timeline;
        const initialSegs: SegmentStatus[] = timeline.map((t: any) => ({
          segment_id: t.segment_id,
          avatar_video_url: null,
          b_roll_image_url: null,
          ui_action_card: t.ui_action_card,
          dialogue: t.dialogue,
          grounding_source_id: t.grounding_source_id,
          status: "queued",
          error: null,
        }));
        setSegments(initialSegs);
        setState("script_ready");
      }
    } catch (e: any) {
      addError(e.message);
      setState("idle");
    }
  }, [useMock, apiKey]);

  const handleRender = useCallback(async () => {
    if (!scriptId) return;
    setState("rendering");
    try {
      if (useMock) {
        // Simulate rendering steps
        for (let i = 0; i < segments.length; i++) {
          setSegments(prev => prev.map((s, idx) => 
            idx === i ? { ...s, status: "rendering" } : s
          ));
          await new Promise(r => setTimeout(r, 1000));
          
          setSegments(prev => prev.map((s, idx) => 
            idx === i ? { 
              ...s, 
              status: "complete",
              b_roll_image_url: mockScriptJson.timeline[i].runware_b_roll_prompt
                ? `https://picsum.photos/seed/seg${s.segment_id}/800/450`
                : null,
            } : s
          ));
        }
        setJobStatus("complete");
        setState("ready");
      } else {
        if (!apiKey) throw new Error("Internal API Key required for live mode");
        setInternalApiKey(apiKey);
        const res = await startRender(scriptId);
        setJobId(res.job_id);
        setJobStatus("rendering");

        // Start polling
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = setInterval(async () => {
          try {
            const status = await getJobStatus(res.job_id);
            setJobStatus(status.status);
            setSegments(status.segments);
            
            if (status.status === "complete" || status.status === "failed") {
              if (pollRef.current) clearInterval(pollRef.current);
              setState(status.status === "complete" ? "ready" : "idle");
              if (status.status === "failed") addError("Render job failed");
            }
          } catch (e: any) {
            addError("Polling error: " + e.message);
          }
        }, 3000);
      }
    } catch (e: any) {
      addError(e.message);
      setState("script_ready");
    }
  }, [scriptId, useMock, segments, apiKey]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const currentSegment = segments[currentIdx];
  const timeline = scriptJson?.timeline;

  const handleVideoEnd = () => {
    if (currentIdx < segments.length - 1) {
      setCurrentIdx(currentIdx + 1);
    } else {
      setState("ready");
    }
  };

  const handlePlay = () => {
    setState("playing");
    setCurrentIdx(0);
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background text-foreground">
      {/* Top bar */}
      <header className="border-b border-border bg-card px-4 py-3 flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Zap className="w-5 h-5 text-primary" />
          </div>
          <h1 className="font-bold text-foreground text-lg tracking-tight">Executive Briefing</h1>
        </div>
        
        <div className="flex-1" />

        <div className="flex items-center gap-2">
          {!useMock && (
            <div className="relative">
              <input
                type="password"
                placeholder="Internal API Key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className={`h-9 px-3 text-xs rounded-md bg-muted border ${apiKey ? 'border-border' : 'border-primary/50'} text-foreground w-48 font-mono focus:ring-1 focus:ring-primary outline-none transition-all`}
              />
              {!apiKey && (
                <span className="absolute -top-6 right-0 text-[10px] text-primary font-medium uppercase">Required</span>
              )}
            </div>
          )}

          <button
            onClick={() => setUseMock(!useMock)}
            className={`h-9 px-3 text-xs rounded-md border transition-all font-mono flex items-center gap-2 ${
              useMock
                ? "bg-success/10 border-success/30 text-success"
                : "bg-secondary/50 border-border text-muted-foreground hover:bg-secondary"
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            {useMock ? "Mock Data: ON" : "Live Mode: ON"}
          </button>

          <Button
            variant={state === "script_ready" ? "outline" : "glow"}
            size="sm"
            onClick={handleGenerateScript}
            disabled={state === "generating" || state === "rendering" || state === "playing"}
            className="h-9 transition-all"
          >
            {state === "generating" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            {state === "script_ready" ? "Regenerate Script" : "Generate Briefing"}
          </Button>

          <Button
            variant={state === "script_ready" ? "glow" : "outline"}
            size="sm"
            onClick={handleRender}
            disabled={state !== "script_ready"}
            className="h-9 transition-all"
          >
            {state === "rendering" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clapperboard className="w-4 h-4" />}
            Render Media
          </Button>

          {state === "ready" && (
            <Button variant="success" size="sm" onClick={handlePlay} className="h-9 animate-in zoom-in-95">
              <Play className="w-4 h-4" />
              Play Briefing
            </Button>
          )}
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Segment playlist */}
        {segments.length > 0 && (
          <aside className="w-64 shrink-0 border-r border-border bg-card/50 p-4 overflow-y-auto">
            <SegmentPlaylist
              segments={segments.map((s, i) => ({
                ...s,
                segment_type: timeline?.[i]?.segment_type,
              }))}
              currentIndex={currentIdx}
              onSelect={setCurrentIdx}
            />
          </aside>
        )}

        {/* Center: Video */}
        <main className="flex-1 flex flex-col items-center justify-center p-8 overflow-hidden relative">
          {segments.length === 0 ? (
            <div className="text-center space-y-6 max-w-lg animate-in fade-in slide-in-from-bottom-4 duration-700">
              <div className="w-24 h-24 mx-auto rounded-3xl bg-primary/10 flex items-center justify-center group hover:bg-primary/20 transition-colors">
                <Zap className="w-12 h-12 text-primary group-hover:scale-110 transition-transform" />
              </div>
              <div className="space-y-2">
                <h2 className="text-3xl font-bold text-foreground">Ready for your briefing?</h2>
                <p className="text-muted-foreground leading-relaxed">
                  Generate a personalized morning briefing featuring AI avatars, 
                  bespoke B-roll imagery, and interactive productivity cards.
                </p>
              </div>
              <Button size="lg" variant="glow" onClick={handleGenerateScript} disabled={state === "generating"}>
                {state === "generating" ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Zap className="w-5 h-5 mr-2" />}
                Get Started
              </Button>
            </div>
          ) : (
            <div className="w-full max-w-4xl flex flex-col items-center animate-in fade-in duration-500">
              <div className="w-full relative rounded-2xl overflow-hidden shadow-2xl border border-border bg-black aspect-video">
                <VideoPlayer
                  videoUrl={currentSegment?.avatar_video_url || null}
                  bRollUrl={currentSegment?.b_roll_image_url || null}
                  segmentLabel={`Segment ${currentSegment?.segment_id || 1}: ${timeline?.[currentIdx]?.segment_type || "processing"}`}
                  onEnded={handleVideoEnd}
                  isPlaying={state === "playing"}
                />
                
                {/* Status Overlay */}
                {currentSegment?.status === "rendering" && (
                  <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-4">
                    <Loader2 className="w-10 h-10 text-primary animate-spin" />
                    <p className="text-primary font-medium animate-pulse">Rendering Segment...</p>
                  </div>
                )}
                
                {state === "ready" && !state.includes("playing") && (
                   <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <Button variant="glow" size="lg" onClick={handlePlay} className="rounded-full w-20 h-20 p-0 flex items-center justify-center pl-1">
                      <Play className="w-10 h-10" />
                    </Button>
                  </div>
                )}
              </div>
              
              <div className="w-full mt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 p-6 rounded-xl bg-card border border-border shadow-sm">
                   <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">Live Transcript</p>
                   <p className="text-lg text-foreground leading-relaxed font-medium">"{currentSegment?.dialogue}"</p>
                   <div className="mt-4 flex items-center gap-2">
                     <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-secondary text-muted-foreground uppercase">
                       Grounding: {currentSegment?.grounding_source_id}
                     </span>
                     {currentSegment?.status === "failed" && (
                       <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-destructive/10 text-destructive uppercase flex items-center gap-1">
                         <AlertCircle className="w-2.5 h-2.5" /> Render Failed
                       </span>
                     )}
                   </div>
                </div>
                
                <div className="space-y-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Active Action</p>
                  <ActionCard
                    card={currentSegment?.ui_action_card as any}
                    dialogue={currentSegment?.dialogue || ""}
                    segmentIndex={currentIdx}
                    totalSegments={segments.length}
                  />
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Debug Panel - Collapsible */}
      <DebugPanel scriptJson={scriptJson} jobStatus={jobStatus} errors={errors} />
    </div>
  );
}
