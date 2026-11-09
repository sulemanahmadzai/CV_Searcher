// File-type helpers shared by the browser uploader and the server.

export type FileKind = "pdf" | "docx" | "doc" | "image" | "unsupported";
export type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

export const ACCEPTED_EXTENSIONS = [".pdf", ".docx", ".doc", ".jpg", ".jpeg", ".png", ".webp"];

export function fileKind(filename: string): FileKind {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf") return "pdf";
  if (ext === "docx") return "docx";
  if (ext === "doc") return "doc";
  if (["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) return "image";
  return "unsupported";
}

export function imageMediaType(name: string): ImageMediaType | null {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "gif") return "image/gif";
  if (ext === "webp") return "image/webp";
  return null;
}

export function mimeFor(filename: string): string {
  const map: Record<FileKind, string> = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    doc: "application/msword",
    image: imageMediaType(filename) ?? "image/jpeg",
    unsupported: "application/octet-stream",
  };
  return map[fileKind(filename)];
}
