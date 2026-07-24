"use client";
import { Document, Page, pdfjs } from "react-pdf";
import { useState } from "react";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

export default function PdfViewer({ url }: { url: string }) {
  const [numPages, setNumPages] = useState(0);
  return (
    <div className="border rounded overflow-auto max-h-[80vh]">
      <Document file={url} onLoadSuccess={({ numPages }) => setNumPages(numPages)}>
        {Array.from({ length: numPages }, (_, i) => (
          <Page key={i} pageNumber={i + 1} width={700} />
        ))}
      </Document>
    </div>
  );
}
