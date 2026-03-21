import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-api-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ORCHESTRATOR_SYSTEM_PROMPT = `You are the Executive Briefing Orchestrator v2. You generate personalized morning briefings as structured JSON scripts for AI avatar video rendering.

Your output MUST be valid JSON matching this exact schema:
{
  "briefing_metadata": {
    "generated_at": "ISO8601 timestamp",
    "persona": "string",
    "total_estimated_segments": number
  },
  "timeline": [
    {
      "segment_id": sequential integer starting at 1,
      "segment_type": "greeting|calendar_overview|email_highlights|project_updates|weather|hackathon_schedule|closing",
      "dialogue": "Natural spoken text for the avatar to read",
      "grounding_source_id": "ID(s) from user_data that ground this segment",
      "runware_b_roll_prompt": "Image generation prompt or null",
      "ui_action_card": {
        "is_active": boolean,
        "card_type": "calendar_join|link_open|email_reply|jira_open|github_review|weather_widget" (if active),
        "title": "string",
        "description": "string",
        "action_label": "string",
        "action_payload": "URL or action string"
      }
    }
  ]
}

Rules:
- segment_ids MUST be sequential starting at 1
- total_estimated_segments MUST match timeline array length
- Every segment MUST have a grounding_source_id
- Dialogue should be conversational, concise, executive-appropriate
- Never include API keys, tokens, emails, or secrets in output
- Always start with a greeting segment and end with a closing segment`;

const DEVELOPER_PROMPT_TEMPLATE = `Generate an executive morning briefing script for the following user.

User Preferences:
{user_preferences}

User Data:
{user_data}

Generate the briefing as valid JSON matching the system prompt schema. Be concise and actionable.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth check
  const internalKey = req.headers.get("x-internal-api-key");
  const expectedKey = Deno.env.get("INTERNAL_API_KEY");
  if (!expectedKey || internalKey !== expectedKey) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { user_preferences, user_data } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Redact any potential secrets from user_data
    let sanitizedData = JSON.stringify(user_data);
    const secretPatterns = [/sk-[a-zA-Z0-9]{20,}/g, /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g];
    for (const pattern of secretPatterns) {
      sanitizedData = sanitizedData.replace(pattern, "[REDACTED]");
    }

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    let scriptJson;

    if (openaiKey) {
      const prompt = DEVELOPER_PROMPT_TEMPLATE
        .replace("{user_preferences}", JSON.stringify(user_preferences, null, 2))
        .replace("{user_data}", sanitizedData);

      const llmResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: ORCHESTRATOR_SYSTEM_PROMPT },
            { role: "user", content: prompt },
          ],
          response_format: { type: "json_object" },
          temperature: 0.7,
        }),
      });

      if (!llmResponse.ok) {
        throw new Error(`LLM API error: ${llmResponse.status}`);
      }

      const llmData = await llmResponse.json();
      scriptJson = JSON.parse(llmData.choices[0].message.content);
    } else {
      // Fallback: generate a basic script from the data
      scriptJson = generateFallbackScript(user_preferences, JSON.parse(sanitizedData));
    }

    // Validate
    if (!scriptJson.timeline || !Array.isArray(scriptJson.timeline)) {
      throw new Error("Invalid script: missing timeline array");
    }
    if (scriptJson.briefing_metadata?.total_estimated_segments !== scriptJson.timeline.length) {
      scriptJson.briefing_metadata.total_estimated_segments = scriptJson.timeline.length;
    }
    for (let i = 0; i < scriptJson.timeline.length; i++) {
      if (scriptJson.timeline[i].segment_id !== i + 1) {
        scriptJson.timeline[i].segment_id = i + 1;
      }
      if (!scriptJson.timeline[i].grounding_source_id) {
        scriptJson.timeline[i].grounding_source_id = "system";
      }
    }

    // Save to DB
    const { data, error } = await supabase
      .from("briefing_scripts")
      .insert({
        persona: user_preferences?.persona || "default",
        script_json: scriptJson,
      })
      .select("id")
      .single();

    if (error) throw error;

    return new Response(JSON.stringify({ script_id: data.id, script_json: scriptJson }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function generateFallbackScript(prefs: any, data: any) {
  const timeline = [];
  let segId = 1;

  timeline.push({
    segment_id: segId++,
    segment_type: "greeting",
    dialogue: `Good morning! Here's your briefing for ${data.date || "today"}.`,
    grounding_source_id: "system",
    runware_b_roll_prompt: null,
    ui_action_card: { is_active: false },
  });

  if (data.calendar_events?.length) {
    const events = data.calendar_events.map((e: any) => e.title).join(", ");
    timeline.push({
      segment_id: segId++,
      segment_type: "calendar_overview",
      dialogue: `You have ${data.calendar_events.length} events today: ${events}.`,
      grounding_source_id: data.calendar_events.map((e: any) => e.id).join(","),
      runware_b_roll_prompt: null,
      ui_action_card: data.calendar_events[0]?.join_url
        ? {
            is_active: true,
            card_type: "calendar_join",
            title: data.calendar_events[0].title,
            description: data.calendar_events[0].location,
            action_label: "Join",
            action_payload: data.calendar_events[0].join_url,
          }
        : { is_active: false },
    });
  }

  timeline.push({
    segment_id: segId++,
    segment_type: "closing",
    dialogue: "That's your briefing. Have a great day!",
    grounding_source_id: "system",
    runware_b_roll_prompt: null,
    ui_action_card: { is_active: false },
  });

  return {
    briefing_metadata: {
      generated_at: new Date().toISOString(),
      persona: prefs?.persona || "default",
      total_estimated_segments: timeline.length,
    },
    timeline,
  };
}
