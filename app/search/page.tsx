import { prisma } from "@/db/client";
import { searchNeoId } from "@/queries/searchNeoId";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const results = q ? await searchNeoId(prisma, q) : [];

  return (
    <main className="max-w-2xl mx-auto p-6">
      <h1 className="text-xl font-semibold mb-4">Search Neo ID</h1>
      <form className="mb-6">
        <input
          name="q"
          defaultValue={q}
          placeholder="e.g. 3D8V (partial match works)"
          className="border rounded px-3 py-2 w-full"
        />
      </form>
      {q && results.length === 0 && <p className="text-gray-500 text-sm">No matches for &quot;{q}&quot;.</p>}
      <ul className="space-y-2">
        {results.map((r) => (
          <li key={r.id} className="border rounded p-3 flex justify-between">
            <span className="font-mono">{r.neoId}</span>
            {r.mailEvent.company && (
              <Link href={`/companies/${r.mailEvent.company.id}`} className="text-blue-600 hover:underline">
                {r.mailEvent.company.name}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
