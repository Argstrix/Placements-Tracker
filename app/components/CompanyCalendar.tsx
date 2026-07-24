import Link from "next/link";
import type { Company } from "@prisma/client";

export default function CompanyCalendar({ companies }: { companies: Company[] }) {
  const byDate = new Map<string, Company[]>();
  for (const c of companies) {
    if (!c.visitDate) continue;
    const key = c.visitDate.toISOString().slice(0, 10);
    byDate.set(key, [...(byDate.get(key) ?? []), c]);
  }

  return (
    <div className="space-y-3">
      {[...byDate.entries()].map(([date, list]) => (
        <div key={date} className="border rounded p-3">
          <div className="text-sm font-medium text-gray-500">{date}</div>
          <ul className="mt-1 space-y-1">
            {list.map((c) => (
              <li key={c.id}>
                <Link href={`/companies/${c.id}`} className="text-blue-600 hover:underline">
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {byDate.size === 0 && <p className="text-gray-500 text-sm">No visits in this range.</p>}
    </div>
  );
}
