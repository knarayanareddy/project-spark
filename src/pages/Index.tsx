import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { VideoPlayer } from "@/components/VideoPlayer";
import { ActionCard } from "@/components/ActionCard";
import { DebugPanel } from "@/components/DebugPanel";
import { SegmentPlaylist } from "@/components/SegmentPlaylist";
import { generateScript, startRender, getJobStatus, setInternalApiKey, type SegmentStatus } from "@/lib/api";
import { mockUserPreferences, mockUserData, mockScriptJson } from "@/lib/mockData";
import { Loader2, Play, Clapperboard, Database, Zap } from "lucide-react";

type AppState = "idle" | "generating" | "script_ready" | "rendering" | "ready" | "playing";

export default function Index() {
  const [state, setState] = useState<AppState>("idle");
  const [useMock, setUseMock] = useState(true);
  const [scriptId, setScriptId] = useState<string | null>(null);
  const [scriptJson, setScriptJson] = useState<unknown>(null);
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
    try {
      if (useMock) {
        // Use mock data directly — skip edge function for demo resilience
        const fakeId = crypto.randomUUID();
        setScriptId(fakeId);
        setScriptJson(mockScriptJson);
        // Build mock segments from the script
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
        setInternalApiKey(apiKey);
        const res = await generateScript(mockUserPreferences, mockUserData);
        setScriptId(res.script_id);
        setScriptJson(res.script_json);
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
        // Simulate rendering
        const rendered = segments.map((s) => ({
          ...s,
          status: "complete" as const,
          // Use sample public domain video for demo
          avatar_video_url: null,
          b_roll_image_url: mockScriptJson.timeline.find((t) => t.segment_id === s.segment_id)?.runware_b_roll_prompt
            ? `https://picsum.photos/seed/seg${s.segment_id}/800/450`
            : null,
        }));
        setSegments(rendered);
        setJobStatus("complete");
        setState("ready");
      } else {
        setInternalApiKey(apiKey);
        const res = await startRender(scriptId);
        setJobId(res.job_id);
        // Start polling
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
            addError(e.message);
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
  const timeline = (scriptJson as any)?.timeline;

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
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Top bar */}
      <header className="border-b border-border bg-card px-4 py-3 flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-primary" />
          <h1 className="font-semibold text-foreground text-lg">Executive Briefing</h1>
        </div>
        <div className="flex-1" />

        {!useMock && (
          <input
            type="password"
            placeholder="Internal API Key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="h-8 px-3 text-xs rounded-md bg-muted border border-border text-foreground w-48 font-mono"
          />
        )}

        <button
          onClick={() => setUseMock(!useMock)}
          className={`h-8 px-3 text-xs rounded-md border transition-colors font-mono ${
            useMock
              ? "bg-success/20 border-success/30 text-success"
              : "bg-secondary border-border text-muted-foreground"
          }`}
        >
          <Database className="w-3 h-3 inline mr-1" />
          {useMock ? "Mock Data ON" : "Mock Data OFF"}
        </button>

        <Button
          variant="glow"
          size="sm"
          onClick={handleGenerateScript}
          disabled={state === "generating" || state === "rendering"}
        >
          {state === "generating" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
          Generate Briefing
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={handleRender}
          disabled={state !== "script_ready"}
        >
          <Clapperboard className="w-4 h-4" />
          Render Media
        </Button>

        {state === "ready" && (
          <Button variant="success" size="sm" onClick={handlePlay}>
            <Play className="w-4 h-4" />
            Play
          </Button>
        )}
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Segment playlist */}
        {segments.length > 0 && (
          <aside className="w-56 shrink-0 border-r border-border bg-card p-3 overflow-y-auto">
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
        <main className="flex-1 flex items-center justify-center p-6 overflow-hidden">
          {segments.length === 0 ? (
            <div className="text-center space-y-4 max-w-md">
              <div className="w-20 h-20 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center">
                <Zap className="w-10 h-10 text-primary" />
              </div>
              <h2 className="text-xl font-semibold text-foreground">Your AI Executive Briefing</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Generate a personalized morning briefing with AI avatar video segments and interactive action cards.
                Click <strong>Generate Briefing</strong> to get started.
              </p>
            </div>
          ) : (
            <div className="w-full max-w-3xl">
              <VideoPlayer
                videoUrl={currentSegment?.avatar_video_url || null}
                bRollUrl={currentSegment?.b_roll_image_url || null}
                segmentLabel={`Segment ${currentSegment?.segment_id || 1}: ${timeline?.[currentIdx]?.segment_type || "loading"}`}
                onEnded={handleVideoEnd}
                isPlaying={state === "playing"}
              />
              {currentSegment && !currentSegment.avatar_video_url && (
                <div className="mt-4 p-4 rounded-lg bg-muted/50 border border-border">
                  <p className="text-sm text-foreground leading-relaxed italic">"{currentSegment.dialogue}"</p>
                  <p className="text-xs text-muted-foreground mt-2 font-mono">
                    Source: {currentSegment.grounding_source_id}
                  </p>
                </div>
              )}
            </div>
          )}
        </main>

        {/* Right: Action Cards */}
        {segments.length > 0 && (
          <aside className="w-80 shrink-0 border-l border-border bg-card p-4 overflow-y-auto space-y-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Action Card</p>
            <ActionCard
              card={currentSegment?.ui_action_card as any}
              dialogue={currentSegment?.dialogue || ""}
              segmentIndex={currentIdx}
              totalSegments={segments.length}
            />
            {/* Show all segment dialogues below */}
            <div className="pt-4 border-t border-border space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Full Script</p>
              {segments.map((seg, i) => (
                <button
                  key={seg.segment_id}
                  onClick={() => setCurrentIdx(i)}
                  className={`w-full text-left p-3 rounded-md text-xs transition-colors ${
                    i === currentIdx ? "bg-primary/10 border border-primary/20" : "bg-muted/50 hover:bg-muted"
                  }`}
                >
                  <p className="font-medium text-foreground mb-1">Segment {seg.segment_id}</p>
                  <p className="text-muted-foreground line-clamp-2">{seg.dialogue}</p>
                </button>
              ))}
            </div>
          </aside>
        )}
      </div>

      {/* Debug Panel */}
      <DebugPanel scriptJson={scriptJson} jobStatus={jobStatus} errors={errors} />
    </div>
  );
}
