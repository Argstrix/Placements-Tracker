"use client";
import { useEffect, useState } from "react";

interface Sheet {
  name: string;
  rows: unknown[][];
}

export default function XlsxViewer({ renderUrl }: { renderUrl: string }) {
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [active, setActive] = useState(0);
  useEffect(() => {
    fetch(renderUrl)
      .then((r) => r.json())
      .then((data) => setSheets(data.sheets));
  }, [renderUrl]);
  if (sheets.length === 0) return <p className="text-sm text-gray-500">Loading spreadsheet…</p>;

  return (
    <div className="border rounded">
      <div className="flex border-b overflow-x-auto">
        {sheets.map((s, i) => (
          <button
            key={s.name}
            onClick={() => setActive(i)}
            className={`px-3 py-2 text-sm ${i === active ? "font-semibold border-b-2 border-black" : "text-gray-500"}`}
          >
            {s.name}
          </button>
        ))}
      </div>
      <div className="overflow-auto max-h-[70vh]">
        <table className="text-sm w-full">
          <tbody>
            {sheets[active].rows.map((row, ri) => (
              <tr key={ri} className="border-b">
                {row.map((cell, ci) => (
                  <td key={ci} className="px-2 py-1 whitespace-nowrap">
                    {String(cell ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
