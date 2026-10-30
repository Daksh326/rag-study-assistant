import { IngestError, ingestPdf } from "@/lib/ingest";

// Parsing + embedding a long PDF can take a while on a cold serverless function.
export const maxDuration = 60;

const MAX_BYTES = 20 * 1024 * 1024;

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  const subject = String(form.get("subject") ?? "").trim() || null;

  if (!(file instanceof File)) {
    return Response.json({ error: "Attach a PDF in the 'file' field." }, { status: 400 });
  }
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return Response.json({ error: "Only PDF files are supported." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "PDF is larger than 20 MB." }, { status: 413 });
  }

  try {
    const document = await ingestPdf({
      name: file.name,
      subject,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    return Response.json({ document }, { status: 201 });
  } catch (err) {
    if (err instanceof IngestError) {
      return Response.json({ error: err.message }, { status: 422 });
    }
    console.error("ingest failed", err);
    return Response.json({ error: "Ingestion failed. Check the server logs." }, { status: 500 });
  }
}
