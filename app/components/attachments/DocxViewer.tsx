"use client";
import { useEffect, useState } from "react";
import DOMPurify from "dompurify";

export default function DocxViewer({ renderUrl }: { renderUrl: string }) {
  const [html, setHtml] = useState<string | null>(null);
  useEffect(() => {
    fetch(renderUrl)
      .then((r) => r.json())
      .then((data) => setHtml(DOMPurify.sanitize(data.html)));
  }, [renderUrl]);
  if (!html) return <p className="text-sm text-gray-500">Loading document…</p>;
  // The mail-sourced .docx is converted to HTML server-side by mammoth, then
  // sanitized client-side before rendering — external content never reaches
  // the DOM unsanitized, regardless of what the source attachment contains.
  return <div className="prose max-w-none border rounded p-4" dangerouslySetInnerHTML={{ __html: html }} />;
}
