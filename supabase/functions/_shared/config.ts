export const config = {
  INTERNAL_API_KEY: Deno.env.get("INTERNAL_API_KEY"),
  OPENAI_API_KEY: Deno.env.get("OPENAI_API_KEY"),
  RUNWARE_API_KEY: Deno.env.get("RUNWARE_API_KEY"),
  FAL_KEY: Deno.env.get("FAL_KEY"),
  VEED_API_KEY: Deno.env.get("VEED_API_KEY"),
  SUPABASE_URL: Deno.env.get("SUPABASE_URL"),
  SUPABASE_SERVICE_ROLE_KEY: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
  AVATAR_PROVIDER: Deno.env.get("AVATAR_PROVIDER") || "fal",
  ENABLE_RUNWARE: Deno.env.get("ENABLE_RUNWARE") !== "false",
  MAX_BROLL_SEGMENTS: parseInt(Deno.env.get("MAX_BROLL_SEGMENTS") || "5", 10),
};

export function validateConfig() {
  const missing = [];
  if (!config.INTERNAL_API_KEY) missing.push("INTERNAL_API_KEY");
  
  if (missing.length > 0) {
    console.warn(`Critical environment variables missing: ${missing.join(", ")}`);
  }
  
  const missingAI = [];
  if (!config.OPENAI_API_KEY) missingAI.push("OPENAI_API_KEY");
  if (!config.FAL_KEY && !config.VEED_API_KEY) missingAI.push("FAL_KEY or VEED_API_KEY");
  
  if (missingAI.length > 0) {
    console.warn(`AI Provider keys missing: ${missingAI.join(", ")}. Fallbacks will be used.`);
  }
}
