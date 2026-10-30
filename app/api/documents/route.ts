import { connection } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  await connection(); // always read fresh from the database, never prerender
  const db = await getDb();
  const documents = await db.query(
    `SELECT d.id::text, d.name, d.subject, d.pages, d.created_at AS "createdAt",
            count(c.id)::int AS chunks
     FROM documents d LEFT JOIN chunks c ON c.document_id = d.id
     GROUP BY d.id
     ORDER BY d.created_at DESC`,
  );
  return Response.json({ documents });
}
