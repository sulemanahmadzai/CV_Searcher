import type Anthropic from "@anthropic-ai/sdk";
import JSZip from "jszip";
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import WordExtractor from "word-extractor";
import { ACCEPTED_EXTENSIONS, fileKind, imageMediaType, type ImageMediaType } from "./accepted";

export { ACCEPTED_EXTENSIONS, fileKind, mimeFor } from "./accepted";

type ContentBlock = Anthropic.Beta.BetaContentBlockParam;

// Fewer words than this means the file is probably a scan or an image.
const MIN_TEXT_WORDS = 60;
const MAX_IMAGES = 8;

export type PreparedDocument =
  | { method: "text"; text: string; wordCount: number }
  | { method: "vision"; blocks: ContentBlock[]; text: string; wordCount: number }
  | { method: "none"; reason: string };

export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function cleanText(text: string): string {
  return text
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function imageBlock(data: Uint8Array, mediaType: ImageMediaType): ContentBlock {
  return {
    type: "image",
    source: { type: "base64", media_type: mediaType, data: Buffer.from(data).toString("base64") },
  };
}

async function pdfText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : text;
}

/** Images embedded in a .docx (for CVs pasted into Word as pictures). */
async function docxImages(bytes: Uint8Array): Promise<ContentBlock[]> {
  const zip = await JSZip.loadAsync(bytes);
  const blocks: ContentBlock[] = [];
  const names = Object.keys(zip.files)
    .filter((n) => n.startsWith("word/media/"))
    .sort();
  for (const name of names) {
    const mediaType = imageMediaType(name);
    if (!mediaType) continue;
    const data = await zip.files[name].async("uint8array");
    if (data.byteLength < 20_000) continue; // skip icons and decorations
    blocks.push(imageBlock(data, mediaType));
    if (blocks.length >= MAX_IMAGES) break;
  }
  return blocks;
}

/**
 * Turns an uploaded file into something Claude can read: plain text when the
 * file has a text layer, otherwise the page images (scans, photos).
 */
export async function prepareDocument(bytes: Uint8Array, filename: string): Promise<PreparedDocument> {
  const kind = fileKind(filename);

  if (kind === "image") {
    const mediaType = imageMediaType(filename)!;
    return { method: "vision", blocks: [imageBlock(bytes, mediaType)], text: "", wordCount: 0 };
  }

  if (kind === "pdf") {
    const text = cleanText(await pdfText(bytes));
    const wordCount = countWords(text);
    if (wordCount >= MIN_TEXT_WORDS) return { method: "text", text, wordCount };
    const block: ContentBlock = {
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: Buffer.from(bytes).toString("base64"),
      },
    };
    return { method: "vision", blocks: [block], text, wordCount };
  }

  if (kind === "docx") {
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    const text = cleanText(value);
    const wordCount = countWords(text);
    if (wordCount >= MIN_TEXT_WORDS) return { method: "text", text, wordCount };
    const blocks = await docxImages(bytes);
    if (blocks.length) return { method: "vision", blocks, text, wordCount };
    if (wordCount > 0) return { method: "text", text, wordCount };
    return { method: "none", reason: "The Word file has no readable text or images." };
  }

  if (kind === "doc") {
    const doc = await new WordExtractor().extract(Buffer.from(bytes));
    const text = cleanText([doc.getBody(), doc.getTextboxes()].join("\n"));
    const wordCount = countWords(text);
    if (wordCount > 0) return { method: "text", text, wordCount };
    return { method: "none", reason: "The .doc file has no readable text." };
  }

  return {
    method: "none",
    reason: `Unsupported file type. Use ${ACCEPTED_EXTENSIONS.join(", ")}.`,
  };
}
