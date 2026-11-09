import { NextResponse, type NextRequest } from "next/server";
import { CV_BUCKET } from "@/lib/supabase/db";
import { createClient, getUserClaims } from "@/lib/supabase/server";

/** Opens the original CV via a short-lived signed URL. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/files/[id]">) {
  const { id } = await ctx.params;
  const db = await createClient();
  if (!(await getUserClaims(db))) return NextResponse.redirect(new URL("/login", request.url));

  const { data: file, error } = await db
    .from("cv_files")
    .select("storage_path, original_filename, mime_type")
    .eq("id", id)
    .maybeSingle();
  if (error || !file?.storage_path) return NextResponse.json({ error: "File not found" }, { status: 404 });

  const viewable = file.mime_type === "application/pdf" || file.mime_type?.startsWith("image/");
  const { data, error: signError } = await db.storage
    .from(CV_BUCKET)
    .createSignedUrl(file.storage_path, 60 * 10, viewable ? undefined : { download: file.original_filename });
  if (signError || !data) return NextResponse.json({ error: "Could not open file" }, { status: 500 });

  return NextResponse.redirect(data.signedUrl);
}
