# DocIntel — AI Document Intelligence (RAG)

A full-stack, AI-powered document chat application that allows users to upload PDFs and ask questions based on the document's content.

**Live Demo:** [docintel-rag.lovable.app](https://docintel-rag.lovable.app)

## 🚀 Features

- **PDF Parsing:** Extracts text client-side using `pdfjs-dist`.
- **Real RAG Pipeline:** Chunks text, generates vector embeddings, and stores them in Supabase using the `pgvector` extension.
- **AI-Powered Answers:** Uses Lovable's built-in AI Gateway (Gemini models) to generate context-aware answers.
- **Source Citations:** Every answer includes page-number pills linking back to the exact page in the uploaded document.
- **No Login Required:** Designed as a frictionless, public demo tool.

## 🛠️ Tech Stack

- **Frontend:** React, TypeScript, Tailwind CSS
- **Database:** Supabase (PostgreSQL + pgvector)
- **AI/LLM:** Lovable AI Gateway (Gemini 3.8 Flash)
- **PDF Extraction:** pdfjs-dist

## 📦 Run Locally

If you want to run this project locally:

1. Clone the repo:

   ```bash
   git clone https://github.com/Xhenzouu/docintel-rag.git
   cd docintel-rag
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Set up your `.env` file with your Supabase credentials.

4. Start the development server:

   ```bash
   npm run dev
   ```
