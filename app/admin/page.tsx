import { prisma } from "@/db/client";
import { getIngestionLogSummary } from "@/queries/getIngestionLogSummary";
import { retryOne } from "./actions";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { buildAuthOptions } from "@/auth/authOptions";
import { isAuthorized } from "@/auth/isAuthorized";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await getServerSession(buildAuthOptions());
  const role = session?.user?.email ? (await isAuthorized(session.user.email, prisma)).role : null;
  if (role !== "admin") notFound();

  const [logs, issues] = await Promise.all([
    getIngestionLogSummary(prisma),
    prisma.reportedIssue.findMany({ orderBy: { createdAt: "desc" }, take: 50, include: { company: true } }),
  ]);

  return (
    <main className="max-w-4xl mx-auto p-6 space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-semibold">Admin Dashboard</h1>
        <div className="flex gap-4">
          <Link href="/admin/manual-ingest" className="text-blue-600 hover:underline text-sm">
            Manual Ingest
          </Link>
          <Link href="/admin/manage-admins" className="text-blue-600 hover:underline text-sm">
            Manage Admins
          </Link>
        </div>
      </div>

      <section>
        <h2 className="font-medium mb-2">Ingestion Log</h2>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left border-b">
              <th className="py-1">Mail</th>
              <th>Status</th>
              <th>Error</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-b">
                <td className="py-1 font-mono text-xs">{log.gmailMessageId}</td>
                <td className={log.status === "SUCCESS" ? "text-green-600" : "text-red-600"}>{log.status}</td>
                <td className="text-xs text-gray-500">{log.errorDetail}</td>
                <td>
                  {log.status === "FAILED" && (
                    <form action={retryOne.bind(null, log.gmailMessageId)}>
                      <button type="submit" className="text-blue-600 text-xs">
                        Retry
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={4} className="py-3 text-gray-500 text-sm">
                  No mail processed yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="font-medium mb-2">Reported Issues</h2>
        <ul className="space-y-2">
          {issues.map((i) => (
            <li key={i.id} className="border rounded p-3 text-sm">
              <div className="text-gray-500 text-xs">
                {i.createdAt.toLocaleString()} — {i.reporterEmail}
                {i.company && ` — ${i.company.name}`}
              </div>
              <p>{i.description}</p>
            </li>
          ))}
          {issues.length === 0 && <p className="text-gray-500 text-sm">No reported issues.</p>}
        </ul>
      </section>
    </main>
  );
}
