import { prisma } from "@/db/client";
import { reportIssue } from "./actions";

export const dynamic = "force-dynamic";

export default async function ReportIssuePage({ searchParams }: { searchParams: Promise<{ companyId?: string }> }) {
  const { companyId } = await searchParams;
  const company = companyId ? await prisma.company.findUnique({ where: { id: companyId } }) : null;

  return (
    <div className="view">
      <div className="phead">
        <p className="eye">Help keep it accurate</p>
        <h1>Report an issue</h1>
        <p>
          Found a wrong date, CTC, eligibility, or a mail that didn&rsquo;t show up? Tell us what&rsquo;s off — an admin
          will re-check it against the original mail.
        </p>
      </div>

      {company && (
        <div className="callout" style={{ marginBottom: 16 }}>
          <span className="ci">i</span>
          <div>
            Reporting about <b>{company.name}</b>.
          </div>
        </div>
      )}

      <form action={reportIssue} className="panel">
        {company && <input type="hidden" name="companyId" value={company.id} />}
        <div className="field">
          <label htmlFor="description">What&rsquo;s wrong?</label>
          <span className="fh">Be specific — what the tracker shows vs. what the mail says.</span>
          <textarea
            id="description"
            name="description"
            required
            rows={5}
            placeholder="The case interview date shows 28 Jul, but the mail says 29 Jul."
          />
        </div>
        <div className="formrow">
          <button type="submit" className="btn pri">
            Send report
          </button>
          <span className="mono" style={{ fontSize: ".72rem", color: "var(--muted)" }}>
            Goes to the admin console
          </span>
        </div>
      </form>
    </div>
  );
}
