import { NextResponse, type NextRequest } from "next/server";
import { ingestFile } from "@/lib/ingest";
import { CV_BUCKET } from "@/lib/supabase/db";
import { createClient, getUserClaims } from "@/lib/supabase/server";

// The browser uploads the file straight to Supabase Storage (avoiding request
// size limits), then calls this route to have Claude read it.
export const maxDuration = 300;

type Body = { storagePath: string; filename: string; sha256: string; sizeBytes: number; mimeType: string };

export async function POST(request: NextRequest) {
  const db = await createClient();
  if (!(await getUserClaims(db))) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body?.storagePath || !body.filename || !/^[a-f0-9]{64}$/.test(body.sha256 ?? "")) {
    return NextResponse.json({ error: "Missing file details." }, { status: 400 });
  }
  if (!body.storagePath.startsWith(`${body.sha256}/`)) {
    return NextResponse.json({ error: "Storage path does not match the file hash." }, { status: 400 });
  }

  const { data: blob, error } = await db.storage.from(CV_BUCKET).download(body.storagePath);
  if (error || !blob) {
    return NextResponse.json({ error: `Could not read the uploaded file: ${error?.message ?? "not found"}` }, { status: 400 });
  }

  const bytes = new Uint8Array(await blob.arrayBuffer());
  const outcome = await ingestFile(db, {
    bytes,
    filename: body.filename,
    sha256: body.sha256,
    sizeBytes: bytes.byteLength,
    storagePath: body.storagePath,
    mimeType: body.mimeType || "application/octet-stream",
  });
  return NextResponse.json(outcome);
}
