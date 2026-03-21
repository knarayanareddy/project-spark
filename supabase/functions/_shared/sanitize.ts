export function redactSecrets(text: string): string {
  if (!text) return text;
  
  const patterns = [
    /sk-[a-zA-Z0-9]{20,}/g, // OpenAI-like
    /ghp_[a-zA-Z0-9]{36}/g, // GitHub PAT
    /github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59}/g, // GitHub Fine-grained PAT
    /Bearer\s+[a-zA-Z0-9._~+/-]+=*/gi, // Bearer Token
    /[a-zA-Z0-9-_]+\.[a-zA-Z0-9-_]+\.[a-zA-Z0-9-_]+/g, // JWT-like (broad)
    /AIza[0-9A-Za-z-_]{35}/g, // Google API Key
  ];

  let redacted = text;
  for (const pattern of patterns) {
    redacted = redacted.replace(pattern, "[REDACTED_SECRET]");
  }
  return redacted;
}

export function stripPII(text: string): string {
  if (!text) return text;
  
  const patterns = [
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, // Email
    /\b(?:\+\d{1,3}[- ]?)?\(?\d{3}\)?[- ]?\d{3}[- ]?\d{4}\b/g, // Phone (US-centric)
  ];

  let stripped = text;
  for (const pattern of patterns) {
    stripped = stripped.replace(pattern, "[REDACTED_PII]");
  }
  return stripped;
}

export function sanitizeUserData(userData: any): any {
  if (!userData) return userData;
  
  const MAX_STRING_LENGTH = 500;
  
  const sanitizeValue = (val: any): any => {
    if (typeof val === "string") {
      let sanitized = redactSecrets(val);
      sanitized = stripPII(sanitized);
      if (sanitized.length > MAX_STRING_LENGTH) {
        sanitized = sanitized.substring(0, MAX_STRING_LENGTH) + "... [TRUNCATED]";
      }
      return sanitized;
    }
    if (Array.isArray(val)) {
      return val.map(sanitizeValue);
    }
    if (val !== null && typeof val === "object") {
      const obj: any = {};
      for (const [k, v] of Object.entries(val)) {
        // Skip potentially sensitive keys entirely if they match common patterns
        if (/password|secret|key|token|auth/i.test(k)) {
          obj[k] = "[REDACTED_BY_KEY]";
        } else {
          obj[k] = sanitizeValue(v);
        }
      }
      return obj;
    }
    return val;
  };

  return sanitizeValue(userData);
}
