import { prisma } from "@/db/client";
import { getCompaniesInRange } from "@/queries/getCompaniesInRange";
import CompanyCalendar from "../components/CompanyCalendar";

export const dynamic = "force-dynamic";

interface RangeParams {
  from?: string;
  to?: string;
  month?: string;
}

function parseRange(searchParams: RangeParams): { from: Date; to: Date } {
  if (searchParams.month) {
    const [year, month] = searchParams.month.split("-").map(Number);
    const from = new Date(year, month - 1, 1);
    const to = new Date(year, month, 0, 23, 59, 59);
    return { from, to };
  }
  if (searchParams.from && searchParams.to) {
    return { from: new Date(searchParams.from), to: new Date(searchParams.to) };
  }
  const now = new Date();
  return {
    from: new Date(now.getFullYear(), now.getMonth(), 1),
    to: new Date(now.getFullYear(), now.getMonth() + 1, 0),
  };
}

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<RangeParams> }) {
  const params = await searchParams;
  const { from, to } = parseRange(params);
  const companies = await getCompaniesInRange(prisma, from, to);

  return (
    <main className="max-w-3xl mx-auto p-6">
      <h1 className="text-xl font-semibold mb-4">Company Visits</h1>
      <form className="flex gap-2 mb-6 text-sm items-end flex-wrap">
        <label className="flex flex-col">
          Month
          <input type="month" name="month" defaultValue={params.month} className="border rounded px-2 py-1" />
        </label>
        <span className="text-gray-400 pb-1">or</span>
        <label className="flex flex-col">
          From
          <input type="date" name="from" defaultValue={params.from} className="border rounded px-2 py-1" />
        </label>
        <label className="flex flex-col">
          To
          <input type="date" name="to" defaultValue={params.to} className="border rounded px-2 py-1" />
        </label>
        <button type="submit" className="bg-black text-white rounded px-3 py-1">
          Filter
        </button>
      </form>
      <CompanyCalendar companies={companies} />
    </main>
  );
}
