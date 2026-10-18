import { createFileRoute } from "@tanstack/react-router";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { streamText, type ModelMessage } from "ai";
import { CHAT_MODEL, embed, errorResponse, getApiKey } from "@/lib/ai.server";

type Body = {
  documentId: string | null;
  question: string;
  history: { role: "user" | "assistant"; content: string }[];
};

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as Body;
          const question = body.question?.trim();
          if (!question) return Response.json({ error: "Empty question" }, { status: 400 });

          let context = "";
          let pages: number[] = [];
          if (body.documentId) {
            const [qv] = await embed([question]);
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { data, error } = await supabaseAdmin.rpc("match_chunks", {
              query_embedding: JSON.stringify(qv),
              doc_id: body.documentId,
              match_count: 4,
            });
            if (error) throw new Error(error.message);
            const hits = data ?? [];
            pages = [...new Set(hits.map((h) => h.page_number))].sort((a, b) => a - b);
            context = hits.map((h) => `[Page ${h.page_number}]\n${h.content}`).join("\n\n---\n\n");
          }

          const system = body.documentId
            ? `You are a careful document assistant. Answer using ONLY the excerpts below from the user's document. When you use information, cite it inline as [Page N]. If the excerpts don't contain the answer, say so plainly.\n\nEXCERPTS:\n${context}`
            : "You are a helpful assistant. No document is loaded; if the user asks about a document, ask them to upload a PDF using the + button.";

          const messages: ModelMessage[] = [
            ...(body.history ?? []).slice(-8).map((m) => ({ role: m.role, content: m.content }) as ModelMessage),
            { role: "user", content: question },
          ];

          const lovable = createOpenAICompatible({
            name: "lovable",
            baseURL: "https://ai.gateway.lovable.dev/v1",
            headers: { "Lovable-API-Key": getApiKey(), "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
          });
          const result = streamText({
            model: lovable(CHAT_MODEL),
            system,
            messages,
            maxRetries: 0,
            abortSignal: request.signal,
          });
          return result.toTextStreamResponse({
            headers: { "X-Citation-Pages": pages.join(","), "Cache-Control": "no-cache, no-transform" },
          });
        } catch (e) {
          console.error(e);
          return errorResponse(e);
        }
      },
    },
  },
});
