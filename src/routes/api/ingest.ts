import { createFileRoute } from "@tanstack/react-router";
import { embed, errorResponse } from "@/lib/ai.server";

type Body = { fileName: string; chunks: { content: string; page: number }[] };

export const Route = createFileRoute("/api/ingest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as Body;
          const chunks = (body.chunks ?? []).filter((c) => c.content?.trim()).slice(0, 2000);
          if (!body.fileName || chunks.length === 0)
            return Response.json({ error: "No readable text found in this PDF." }, { status: 400 });

          const vectors = await embed(chunks.map((c) => c.content));
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: doc, error } = await supabaseAdmin
            .from("documents")
            .insert({ file_name: body.fileName.slice(0, 255) })
            .select("id")
            .single();
          if (error || !doc) throw new Error(error?.message ?? "Could not save document");

          const rows = chunks.map((c, i) => ({
            document_id: doc.id,
            content: c.content,
            page_number: c.page,
            embedding: JSON.stringify(vectors[i]),
          }));
          for (let i = 0; i < rows.length; i += 100) {
            const { error: e } = await supabaseAdmin.from("document_chunks").insert(rows.slice(i, i + 100));
            if (e) throw new Error(e.message);
          }
          return Response.json({ documentId: doc.id, chunks: rows.length });
        } catch (e) {
          console.error(e);
          return errorResponse(e);
        }
      },
    },
  },
});
