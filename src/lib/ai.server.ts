const GATEWAY = "https://ai.gateway.lovable.dev/v1";
export const EMBED_MODEL = "google/gemini-embedding-2";
export const CHAT_MODEL = "google/gemini-3.7-flash";

export class GatewayError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function getApiKey() {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new GatewayError(401, "AI is not configured.");
  return key;
}

async function postEmbeddings(input: string[], attempt = 1): Promise<Response> {
  const res = await fetch(`${GATEWAY}/embeddings`, {
    method: "POST",
    headers: { Authorization: `Bearer ${getApiKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, input }),
  });
  if ((res.status === 429 || res.status >= 500) && attempt < 4) {
    await res.body?.cancel();
    const ra = Number(res.headers.get("Retry-After"));
    await new Promise((r) => setTimeout(r, (ra > 0 ? ra * 1000 : 1000 * 2 ** attempt) + Math.random() * 500));
    return postEmbeddings(input, attempt + 1);
  }
  return res;
}

export async function embed(texts: string[], batchSize = 50): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const res = await postEmbeddings(batch);
    if (!res.ok) {
      let msg = `Embedding failed (${res.status})`;
      try {
        const j = await res.json();
        msg = j?.error?.message ?? j?.message ?? msg;
      } catch {}
      throw new GatewayError(res.status, msg);
    }
    const j = (await res.json()) as { data: { index: number; embedding: number[] }[] };
    const ordered: number[][] = new Array(batch.length);
    for (const d of j.data) ordered[d.index] = d.embedding;
    if (ordered.some((v) => !v)) throw new GatewayError(500, "Missing embedding result");
    out.push(...ordered);
  }
  return out;
}

export function errorResponse(e: unknown) {
  const status = e instanceof GatewayError ? e.status : 500;
  const message =
    status === 402
      ? "Out of AI credits. Add credits in Settings → Plans & credits."
      : status === 429
        ? "Too many requests right now. Please try again in a moment."
        : e instanceof Error
          ? e.message
          : "Something went wrong.";
  return Response.json({ error: message }, { status });
}
