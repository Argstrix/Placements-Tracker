"use client";
import { useState } from "react";

export default function ManualIngestForm() {
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = (e.currentTarget.elements.namedItem("file") as HTMLInputElement).files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const res = await fetch("/api/ingest/manual", { method: "POST", body: await file.arrayBuffer() });
      const json = await res.json();
      setResult(JSON.stringify(json, null, 2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="file">Raw message file (.eml)</label>
          <span className="fh">In Gmail: open the mail → ⋮ → Download message, then upload the .eml here.</span>
          <input id="file" type="file" name="file" accept=".eml" required />
        </div>
        <div className="formrow">
          <button type="submit" className="btn pri" disabled={busy}>
            {busy ? "Running…" : "Run extraction"}
          </button>
          <span className="mono" style={{ fontSize: ".72rem", color: "var(--muted)" }}>
            Runs the full pipeline
          </span>
        </div>
      </form>
      {result && (
        <pre
          className="mono"
          style={{
            marginTop: 14,
            fontSize: ".76rem",
            background: "var(--card-2)",
            border: "1px solid var(--hair)",
            borderRadius: 10,
            padding: 13,
            overflow: "auto",
            color: "var(--ink)",
          }}
        >
          {result}
        </pre>
      )}
    </div>
  );
}
