import { SegmentPlan } from "./planner.ts";

export async function realizeSegment(
  segmentId: number,
  plan: SegmentPlan,
  persona: string,
  openaiKey: string
): Promise<any> {
  const systemPrompt = `
You are an expert briefing script writer. 
Persona: ${persona}

TASK: Write ONE segment of a morning briefing (Segment ${segmentId}) based ONLY on the provided facts.

CONSTRAINTS:
1. STRICT GROUNDING: The grounding_source_id MUST be a comma-separated subset of the allowed_grounding_source_ids provided in the user payload.
2. NO EXTRAPOLATION: Do not mention any news, dates, or names not in the FACTS.
3. TONE: Professional but engaging, matching the Persona.
4. LENGTH: Concise (2-3 sentences max).
5. FORMAT: Return ONLY a JSON object matching this exact schema:
{
  "segment_id": ${segmentId},
  "dialogue": "string",
  "grounding_source_id": "string",
  "runware_b_roll_prompt": "string | null",
  "ui_action_card": { ... exact copy of action_card_must_equal ... }
}

B-ROLL RULES:
If b_roll_hint is null, runware_b_roll_prompt MUST be null.
If b_roll_hint is provided, create a cinematic prompt based on it.
  `.trim();

  const userPayload = {
    segment_id: segmentId,
    persona: persona,
    facts: plan.facts,
    allowed_grounding_source_ids: plan.grounding_source_ids,
    action_card_must_equal: plan.ui_action_suggestion,
    b_roll_hint: plan.b_roll_hint
  };

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(userPayload) }
      ],
      temperature: 0.2,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI Realizer Error: ${error}`);
  }

  const result = await response.json();
  const parsed = JSON.parse(result.choices[0].message.content);

  // Force strict schema immutability
  parsed.ui_action_card = plan.ui_action_suggestion;

  return parsed;
}
