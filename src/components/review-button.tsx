"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ReviewButton({ searchId }: { searchId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/search/${searchId}/review`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error ?? "Review failed");
      setBusy(false);
      return;
    }
    router.refresh();
    setBusy(false);
  }

  return (
    <div className="flex items-center gap-3">
      {error && <span className="text-sm text-missing">{error}</span>}
      <button
        onClick={run}
        disabled={busy}
        className="rounded-lg border border-accent px-4 py-2 text-sm font-medium text-accent hover:bg-accent-soft disabled:opacity-60"
        title="Claude writes a short fit summary for the top 10 (about 5 cents)"
      >
        {busy ? "Reviewing top 10…" : "AI review of top 10"}
      </button>
    </div>
  );
}
