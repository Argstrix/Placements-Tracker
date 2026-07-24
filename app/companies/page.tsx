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
    <div className="view">
      <div className="phead">
        <p className="eye">Company visits</p>
        <h1>Companies</h1>
        <p>Drives by visit date. Pick a month or a custom range, then open any company for its full timeline and mail history.</p>
      </div>

      <form className="panel" style={{ marginBottom: 18 }}>
        <div className="formrow" style={{ alignItems: "flex-end" }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="month">Month</label>
            <input id="month" type="month" name="month" defaultValue={params.month} />
          </div>
          <span className="mono" style={{ color: "var(--muted)", paddingBottom: 10, fontSize: ".72rem" }}>
            or
          </span>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="from">From</label>
            <input id="from" type="date" name="from" defaultValue={params.from} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="to">To</label>
            <input id="to" type="date" name="to" defaultValue={params.to} />
          </div>
          <button type="submit" className="btn pri">
            Filter
          </button>
        </div>
      </form>

      <CompanyCalendar companies={companies} />
    </div>
  );
}
