import { prisma } from "@/db/client";
import { reportIssue } from "./actions";

export const dynamic = "force-dynamic";

export default async function ReportIssuePage({ searchParams }: { searchParams: Promise<{ companyId?: string }> }) {
  const { companyId } = await searchParams;
  const company = companyId ? await prisma.company.findUnique({ where: { id: companyId } }) : null;

  return (
    <main className="max-w-xl mx-auto p-6">
      <h1 className="text-xl font-semibold mb-4">Report an issue</h1>
      {company && <p className="text-sm text-gray-500 mb-3">Reporting about: {company.name}</p>}
      <form action={reportIssue} className="space-y-3">
        {company && <input type="hidden" name="companyId" value={company.id} />}
        <textarea
          name="description"
          required
          rows={4}
          placeholder="What looks wrong?"
          className="border rounded w-full px-3 py-2"
        />
        <button type="submit" className="bg-black text-white rounded px-4 py-2">
          Submit
        </button>
      </form>
    </main>
  );
}
