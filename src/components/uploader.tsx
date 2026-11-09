"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ACCEPTED_EXTENSIONS, mimeFor } from "@/lib/extract/accepted";
import { createClient } from "@/lib/supabase/client";
import { CV_BUCKET, storagePathFor } from "@/lib/supabase/db";
import type { IngestOutcome } from "@/lib/ingest";

type Item = {
  key: string;
  file: File;
  state: "queued" | "uploading" | "reading" | IngestOutcome["status"];
  detail?: string;
  candidateId?: string;
};

const PARALLEL = 2;

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const STATE_STYLE: Record<Item["state"], string> = {
  queued: "text-faint",
  uploading: "text-good",
  reading: "text-good",
  processed: "text-strong",
  duplicate: "text-weak",
  skipped: "text-weak",
  failed: "text-missing",
};

const STATE_LABEL: Record<Item["state"], string> = {
  queued: "Queued",
  uploading: "Uploading…",
  reading: "Reading with Claude…",
  processed: "Added",
  duplicate: "Duplicate",
  skipped: "Skipped",
  failed: "Failed",
};

export function Uploader() {
  const [items, setItems] = useState<Item[]>([]);
  const [running, setRunning] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function update(key: string, patch: Partial<Item>) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    const accepted = [...list].filter((f) => ACCEPTED_EXTENSIONS.some((ext) => f.name.toLowerCase().endsWith(ext)));
    setItems((prev) => [
      ...prev,
      ...accepted.map((file) => ({ key: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`, file, state: "queued" as const })),
    ]);
  }

  async function processOne(item: Item) {
    const supabase = createClient();
    try {
      update(item.key, { state: "uploading" });
      const sha256 = await sha256Hex(item.file);
      const storagePath = storagePathFor(sha256, item.file.name);
      const mimeType = mimeFor(item.file.name);
      const { error } = await supabase.storage
        .from(CV_BUCKET)
        .upload(storagePath, item.file, { contentType: mimeType, upsert: true });
      if (error) throw new Error(`Upload failed: ${error.message}`);

      update(item.key, { state: "reading" });
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storagePath, filename: item.file.name, sha256, sizeBytes: item.file.size, mimeType }),
      });
      const outcome = (await res.json()) as IngestOutcome & { error?: string };
      if (!res.ok) throw new Error(outcome.error ?? "Processing failed");
      update(item.key, { state: outcome.status, detail: outcome.detail, candidateId: outcome.candidateId });
    } catch (err) {
      update(item.key, { state: "failed", detail: err instanceof Error ? err.message : String(err) });
    }
  }

  async function start() {
    setRunning(true);
    const queue = items.filter((i) => i.state === "queued");
    let next = 0;
    await Promise.all(
      Array.from({ length: PARALLEL }, async () => {
        while (next < queue.length) await processOne(queue[next++]);
      }),
    );
    setRunning(false);
  }

  const queued = items.filter((i) => i.state === "queued").length;
  const done = items.filter((i) => ["processed", "duplicate", "skipped", "failed"].includes(i.state)).length;

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
          dragging ? "border-accent bg-accent-soft" : "border-border-strong bg-surface hover:border-accent"
        }`}
      >
        <p className="font-medium">Drop CV files here, or click to choose</p>
        <p className="mt-1 text-sm text-muted">{ACCEPTED_EXTENSIONS.join(" ")} · several files at once is fine</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED_EXTENSIONS.join(",")}
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {items.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">
            {items.length} file{items.length > 1 ? "s" : ""} · {done} done{queued ? ` · ${queued} waiting` : ""}
          </p>
          <div className="flex gap-2">
            {!running && done > 0 && (
              <button
                onClick={() => setItems((prev) => prev.filter((i) => !["processed", "duplicate", "skipped"].includes(i.state)))}
                className="rounded-lg border border-border-strong px-3 py-2 text-sm hover:bg-surface-muted"
              >
                Clear finished
              </button>
            )}
            <button
              onClick={start}
              disabled={running || queued === 0}
              className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {running ? "Processing…" : `Process ${queued} file${queued === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      )}

      {items.length > 0 && (
        <div className="divide-y divide-border rounded-xl border border-border bg-surface">
          {items.map((it) => (
            <div key={it.key} className="flex items-start gap-3 px-4 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{it.file.name}</p>
                {it.detail && <p className="text-muted">{it.detail}</p>}
              </div>
              <div className="shrink-0 text-right">
                <p className={`font-medium ${STATE_STYLE[it.state]}`}>{STATE_LABEL[it.state]}</p>
                {it.candidateId && (
                  <Link href={`/candidates/${it.candidateId}`} className="text-xs text-accent hover:underline">
                    View profile
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
