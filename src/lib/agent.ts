/**
 * Antigravity managed-agent integration ("Agent Mode", opt-in).
 *
 * When Agent Mode is ON, EVERY Gemini step in the pipeline (blueprint, quiz,
 * tutor prompt, podcast prompts, and every grading step) is run by the managed
 * agent (`antigravity-preview-05-2026`) via the Interactions API — using the
 * EXACT SAME system instruction the normal call uses, grounded ONLY in the same
 * material (`tools: []` → no web search). The agent's autonomous reasoning loop
 * does each step more thoroughly, step by step.
 *
 * Wiring lives in gemini-retry.ts: `generateContentWithRetry(..., agentMode)`
 * renders the request to text and calls `runAgent`; on any failure it falls back
 * to the normal gemini-3.5-flash call. We hit the REST endpoint directly (no
 * @google/genai version dependency).
 *
 * SAFETY CONTRACT: `runAgent` never throws. It returns the agent's text on
 * success, or **null** on ANY problem (missing key, non-2xx, timeout,
 * unparseable/empty response, or a raw-JSON blob). The caller then falls back to
 * the normal model call — so Agent Mode can never break or empty a step. Every
 * fallback is surfaced via `onProgress` (visible in the UI) and logged `[agent]`.
 */

const AGENT_MODEL = "antigravity-preview-05-2026";
const INTERACTIONS_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const API_REVISION = "2026-05-20";
/** Bounded per step so the whole pipeline can still finish within maxDuration. */
const AGENT_TIMEOUT_MS = 240_000;
/** Keep the payload sane; the agent compacts context internally anyway. */
const MAX_MATERIAL_CHARS = 120_000;

/** Best-effort extraction of the agent's final text from the REST response. */
function extractOutputText(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const d = data as Record<string, unknown>;
  if (typeof d.output_text === "string") return d.output_text;
  if (typeof d.outputText === "string") return d.outputText as string;
  const out = d.output ?? d.outputs;
  if (Array.isArray(out)) {
    const parts: string[] = [];
    for (const item of out) {
      if (typeof item === "string") parts.push(item);
      else if (item && typeof item === "object") {
        const rec = item as Record<string, unknown>;
        const t = rec.text ?? rec.content ?? rec.output_text;
        if (typeof t === "string") parts.push(t);
      }
    }
    if (parts.length) return parts.join("\n");
  }
  return "";
}

/**
 * Run ONE pipeline step with the managed agent, using the given system
 * instruction (the SAME prompt the normal call uses) and the step's material as
 * text. Returns the agent's output, or `null` on any failure (caller falls back
 * to the normal gemini-3.5-flash call).
 */
export async function runAgent(params: {
  instruction: string;
  material: string;
  label?: string;
  onProgress?: (msg: string) => void;
}): Promise<string | null> {
  const { instruction, material, label = "Schritt", onProgress } = params;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    onProgress?.("Agent: kein GEMINI_API_KEY — normale Generierung wird genutzt.");
    return null;
  }

  const input = [
    instruction,
    "",
    "=== MATERIAL / KONTEXT (stütze dich AUSSCHLIESSLICH hierauf, erfinde nichts) ===",
    (material || "").slice(0, MAX_MATERIAL_CHARS) || "(kein Text)",
    "",
    "Arbeite die obigen System-Instruktionen Schritt für Schritt gründlich ab und gib JETZT die finale Ausgabe aus — EXAKT im dort geforderten Format, inkl. aller ===MARKER=== Blöcke. Kein JSON-Objekt, keine Vorrede, keine Code-Blöcke, kein zusätzlicher Kommentar.",
  ].join("\n");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AGENT_TIMEOUT_MS);
  try {
    onProgress?.(`Agent arbeitet an: ${label} (nur dein Material)…`);
    const res = await fetch(INTERACTIONS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
        "Api-Revision": API_REVISION,
      },
      // tools: [] → grounded reasoning only (no web search, URL fetch, or code).
      body: JSON.stringify({ agent: AGENT_MODEL, input, environment: "remote", tools: [] }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[agent] Interactions API ${res.status} on "${label}" — fallback to normal model. ${detail.slice(0, 400)}`);
      onProgress?.(`Agent nicht erreichbar (HTTP ${res.status}) bei ${label} — normale Generierung.`);
      return null;
    }

    const data = await res.json().catch(() => null);
    const out = extractOutputText(data).trim();
    // Reject empty output AND raw-JSON blobs (no pipeline step emits a JSON
    // object — they emit markdown with ===MARKER=== blocks). This is the
    // universal guard against the "agent returned JSON" breakage.
    const isJsonBlob = out.startsWith("{") && out.endsWith("}");
    if (out && !isJsonBlob) {
      console.log(`[agent] "${label}": ${out.length} chars via managed agent.`);
      return out;
    }
    console.warn(`[agent] "${label}": empty or JSON-blob output — fallback. Head: ${out.slice(0, 160)}`);
    onProgress?.(`Agent-Ausgabe ungültig bei ${label} — normale Generierung.`);
    return null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[agent] "${label}": call failed — fallback. ${msg}`);
    onProgress?.(`Agent-Fehler bei ${label} — normale Generierung.`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
