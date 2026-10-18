// Browser-only: pdfjs is loaded dynamically so SSR never imports it.
export async function extractPdfPages(file: File): Promise<{ page: number; text: string }[]> {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages: { page: number; text: string }[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const content = await (await pdf.getPage(i)).getTextContent();
    const text = content.items
      .map((it) => ("str" in it ? it.str + (it.hasEOL ? "\n" : " ") : ""))
      .join("")
      .replace(/[ \t]+/g, " ")
      .trim();
    if (text) pages.push({ page: i, text });
  }
  return pages;
}

export function chunkPages(pages: { page: number; text: string }[], size = 500, overlap = 50) {
  const out: { content: string; page: number }[] = [];
  for (const { page, text } of pages) {
    for (let start = 0; start < text.length; start += size - overlap) {
      const content = text.slice(start, start + size).trim();
      if (content) out.push({ content, page });
      if (start + size >= text.length) break;
    }
  }
  return out;
}
