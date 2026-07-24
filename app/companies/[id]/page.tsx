import { prisma } from "@/db/client";
import { getCompanyTimeline } from "@/queries/getCompanyTimeline";
import MailEventCard from "../../components/MailEventCard";
import { notFound } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const company = await getCompanyTimeline(prisma, id);
  if (!company) notFound();

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{company.name}</h1>
        {company.category && <p className="text-gray-600">{company.category}</p>}
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          {company.ctc && (
            <>
              <dt className="text-gray-500">CTC</dt>
              <dd>{company.ctc}</dd>
            </>
          )}
          {company.stipend && (
            <>
              <dt className="text-gray-500">Stipend</dt>
              <dd>{company.stipend}</dd>
            </>
          )}
          {company.eligibleBranches.length > 0 && (
            <>
              <dt className="text-gray-500">Branches</dt>
              <dd>{company.eligibleBranches.join(", ")}</dd>
            </>
          )}
          {company.eligibilityCriteria && (
            <>
              <dt className="text-gray-500">Eligibility</dt>
              <dd>{company.eligibilityCriteria}</dd>
            </>
          )}
        </dl>
        {company.enrichmentSummary && (
          <div className="mt-4 text-sm bg-gray-50 border rounded p-3">
            <p className="text-gray-500 text-xs mb-1">Auto-generated overview (unofficial):</p>
            <p>{company.enrichmentSummary}</p>
            <p className="mt-1 text-xs">
              Sources:{" "}
              {company.enrichmentSources.map((s, i) => (
                <a key={s} href={s} className="text-blue-600 underline mr-2" target="_blank" rel="noreferrer">
                  [{i + 1}]
                </a>
              ))}
            </p>
          </div>
        )}
      </div>
      <div className="space-y-4">
        {company.mailEvents.map((event) => (
          <MailEventCard key={event.id} event={event} />
        ))}
      </div>
      <Link href={`/report-issue?companyId=${company.id}`} className="text-sm text-gray-500 hover:underline">
        Something wrong on this page? Report an issue.
      </Link>
    </main>
  );
}
