import { z } from "https://esm.sh/zod@3.22.4";

export const ActionCardSchema = z.object({
  is_active: z.boolean(),
  card_type: z.enum([
    "calendar_join",
    "link_open",
    "email_reply",
    "jira_open",
    "github_review",
    "weather_widget",
  ]).optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  action_label: z.string().optional(),
  action_payload: z.string().optional(),
});

export const BriefingSegmentSchema = z.object({
  segment_id: z.number().int().positive(),
  segment_type: z.string(),
  dialogue: z.string().min(1),
  grounding_source_id: z.string().min(1),
  runware_b_roll_prompt: z.string().nullable().optional(),
  ui_action_card: ActionCardSchema,
});

export const BriefingScriptSchema = z.object({
  briefing_metadata: z.object({
    generated_at: z.string().datetime(),
    persona: z.string(),
    total_estimated_segments: z.number().int().positive(),
  }),
  timeline: z.array(BriefingSegmentSchema).min(1),
});

export type BriefingScript = z.infer<typeof BriefingScriptSchema>;
export type BriefingSegment = z.infer<typeof BriefingSegmentSchema>;

export function validateBriefingScript(json: unknown) {
  const result = BriefingScriptSchema.safeParse(json);
  if (!result.success) {
    return { ok: false, error: result.error.format() };
  }
  
  const script = result.data;
  const isSequential = assertSequentialSegments(script.timeline);
  if (!isSequential) {
    return { ok: false, error: "Segments are not sequential starting at 1" };
  }

  if (script.briefing_metadata.total_estimated_segments !== script.timeline.length) {
    return { ok: false, error: "total_estimated_segments does not match timeline length" };
  }

  return { ok: true, data: script };
}

export function assertSequentialSegments(segments: BriefingSegment[]): boolean {
  for (let i = 0; i < segments.length; i++) {
    if (segments[i].segment_id !== i + 1) {
      return false;
    }
  }
  return true;
}
