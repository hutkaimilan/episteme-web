/**
 * Robust JSON extraction from LLM output, per the strict custom protocol:
 * the model must answer with exactly one JSON object and nothing else, but
 * we defensively handle fences, stray prose and nested braces anyway.
 */

/** Strips markdown code fences (```json ... ``` or ``` ... ```) if the whole text is fenced. */
function stripFences(text: string): string {
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenced ? fenced[1] : text;
}

/**
 * Locates the first top-level {...} object via a string-aware brace-counting
 * scan (indexOf/lastIndexOf breaks on nested braces and braces inside strings).
 */
function firstBalancedObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Strict variant: succeeds only when the WHOLE response (minus fences and
 * whitespace) is one JSON object — no substring salvage. The safety net uses
 * this to decide whether suspicious tool syntax co-exists with a clean reply.
 */
export function parseWholeJson(text: string): unknown | null {
  try {
    return JSON.parse(stripFences(text.trim()).trim());
  } catch {
    return null;
  }
}

export function extractJson(text: string): unknown | null {
  const cleaned = stripFences(text.trim()).trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // fall through to the balanced-brace scan
  }

  const candidate = firstBalancedObject(cleaned);
  if (candidate) {
    try {
      return JSON.parse(candidate);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Signs of a hallucinated fake tool-call syntax (XML-ish invocation blocks or
 * a stray "tool": outside parseable JSON). Used by the chat engine's safety
 * net: if these appear but the response did not parse into a valid protocol
 * object, the output must never be surfaced to the guest as a real result.
 */
export function hasSuspiciousToolSyntax(raw: string): boolean {
  return (
    /<function_calls>|<invoke\b|<tool_use\b|function_results/i.test(raw) ||
    /"tool"\s*:/.test(raw)
  );
}
