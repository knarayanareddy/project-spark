import { SegmentPlan } from "./planner.ts";

export async function realizeSegment(
  plan: SegmentPlan,
  persona: string,
  openaiKey: string
): Promise<any> {
  const prompt = `
    You are an expert briefing script writer. 
    Persona: ${persona}

    TASK: Write ONE segment of a morning briefing based on the facts provided below.
    
    FACTS:
    ${JSON.stringify(plan.facts, null, 2)}

    CONSTRAINTS:
    1. STRICT GROUNDING: Use ONLY the grounding_source_id: ${plan.grounding_source_ids.join(", ")}.
    2. NO EXTRAPOLATION: Do not mention any news, dates, or names not in the FACTS above.
    3. TONE: Professional but engaging, matching the Persona.
    4. LENGTH: Concise (2-3 sentences max).
    5. FORMAT: Return ONLY a JSON object matching this schema:
    {
      "dialogue": "string",
      "grounding_source_id": "string",
      "runware_b_roll_prompt": "string",
      "ui_action_card": {
        "is_active": true,
        "card_type": "${plan.ui_action_suggestion.card_type}",
        "title": "${plan.ui_action_suggestion.title}",
        "action_button_text": "${plan.ui_action_suggestion.action_button_text}",
        "action_payload": "${plan.ui_action_suggestion.action_payload}"
      }
    }

    B-ROLL HINT: ${plan.b_roll_hint}
  `;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: prompt }],
      temperature: 0.2,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI Realizer Error: ${error}`);
  }

  const result = await response.json();
  return JSON.parse(result.choices[0].message.content);
}
