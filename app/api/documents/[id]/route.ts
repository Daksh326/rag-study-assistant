import { getDb } from "@/lib/db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(_request: Request, ctx: RouteContext<"/api/documents/[id]">) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return Response.json({ error: "Invalid document id." }, { status: 400 });
  }
  const db = await getDb();
  const deleted = await db.query(`DELETE FROM documents WHERE id = $1 RETURNING id`, [id]);
  if (deleted.length === 0) {
    return Response.json({ error: "Document not found." }, { status: 404 });
  }
  return new Response(null, { status: 204 });
}
