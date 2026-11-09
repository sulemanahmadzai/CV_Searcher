"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const EXAMPLES = [
  {
    label: "Finance officer (ACCA)",
    text: `Finance Officer
We are looking for an ACCA-qualified (or ACCA candidate) Finance Officer to manage NGO accounts.
Requirements:
- ACCA qualification required
- 5+ years of experience in financial management, budgeting and donor reporting
- Strong skills in QuickBooks and Microsoft Excel
- Experience with audits is an advantage`,
  },
  {
    label: "React developer",
    text: `Frontend Developer
Must have strong experience with React and JavaScript/TypeScript, building production web applications.
Nice to have: React Native, Node.js, REST APIs, Git.
Minimum 3 years of experience.`,
  },
  {
    label: "Tailoring trainer",
    text: `Tailoring Trainer (vocational training for women)
Must have practical tailoring and garment-making skills and experience teaching or training others.
Experience with embroidery is a plus. Fluent in Dari or Pashto.`,
  },
  {
    label: "MEAL officer",
    text: `MEAL Officer
Required: 4+ years of monitoring, evaluation, accountability and learning (MEAL / M&E) experience in NGO projects.
Skills: data collection tools (KoboToolbox/ODK), data analysis (Excel, SPSS), report writing.
Bachelor's degree in a relevant field.`,
  },
];

const STEPS = ["Reading the job description…", "Matching skills across all CVs…", "Ranking candidates by evidence…"];

export function SearchForm() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 3500);
    return () => clearInterval(t);
  }, [busy]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStep(0);
    setError(null);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobDescription: text }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Search failed");
      router.push(`/search/${json.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="rounded-xl border border-border bg-surface p-4 shadow-sm sm:p-5">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"Paste a job description, or just describe who you need, e.g. “ACCA-qualified accountant with QuickBooks experience”"}
        rows={9}
        disabled={busy}
        className="w-full resize-y rounded-lg border border-border-strong bg-surface px-3 py-2.5 text-sm leading-relaxed outline-none placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:opacity-70"
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-faint">Try:</span>
        {EXAMPLES.map((ex) => (
          <button
            key={ex.label}
            type="button"
            disabled={busy}
            onClick={() => setText(ex.text)}
            className="rounded-full border border-border px-3 py-1 text-xs text-muted hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {ex.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-3">
          {busy && <span className="text-sm text-muted">{STEPS[step]}</span>}
          <button
            disabled={busy || text.trim().length < 3}
            className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {busy ? "Searching…" : "Find candidates"}
          </button>
        </div>
      </div>
      {error && <p className="mt-3 rounded-md bg-missing-soft px-3 py-2 text-sm text-missing">{error}</p>}
    </form>
  );
}
