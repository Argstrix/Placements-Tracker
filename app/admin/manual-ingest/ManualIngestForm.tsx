"use client";
import { useState } from "react";

export default function ManualIngestForm() {
  const [result, setResult] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = (e.currentTarget.elements.namedItem("file") as HTMLInputElement).files?.[0];
    if (!file) return;
    const res = await fetch("/api/ingest/manual", { method: "POST", body: await file.arrayBuffer() });
    const json = await res.json();
    setResult(JSON.stringify(json, null, 2));
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input type="file" name="file" accept=".eml" required />
        <button type="submit" className="bg-black text-white rounded px-4 py-2">
          Ingest
        </button>
      </form>
      {result && <pre className="mt-4 text-xs bg-gray-50 border rounded p-3 overflow-auto">{result}</pre>}
    </>
  );
}
