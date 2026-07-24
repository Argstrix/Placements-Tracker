import { prisma } from "@/db/client";
import { getServerSession } from "next-auth";
import { buildAuthOptions } from "@/auth/authOptions";
import { setNeoId } from "./actions";
import DeleteMyDataButton from "./DeleteMyDataButton";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getServerSession(buildAuthOptions());
  if (!session?.user?.email) return <p className="p-6">Please sign in.</p>;

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { interests: { include: { company: true } } },
  });

  const shortlistedFor = user?.neoId
    ? await prisma.shortlistEntry.findMany({
        where: { neoId: user.neoId },
        include: { mailEvent: { include: { company: true } } },
      })
    : [];

  return (
    <main className="max-w-2xl mx-auto p-6 space-y-6">
      <h1 className="text-xl font-semibold">My Dashboard</h1>
      <form action={setNeoId} className="flex gap-2 items-end text-sm">
        <label className="flex flex-col">
          Your Neo ID (optional, for auto shortlist alerts)
          <input name="neoId" defaultValue={user?.neoId ?? ""} className="border rounded px-2 py-1 font-mono" />
        </label>
        <button type="submit" className="bg-black text-white rounded px-3 py-1">
          Save
        </button>
      </form>

      {shortlistedFor.length > 0 && (
        <div>
          <h2 className="font-medium mb-2">You&apos;re shortlisted for:</h2>
          <ul className="space-y-1">
            {shortlistedFor.map(
              (s) =>
                s.mailEvent.company && (
                  <li key={s.id}>
                    <Link href={`/companies/${s.mailEvent.company.id}`} className="text-blue-600 hover:underline">
                      {s.mailEvent.company.name}
                    </Link>
                  </li>
                )
            )}
          </ul>
        </div>
      )}

      <div>
        <h2 className="font-medium mb-2">My tracked companies</h2>
        <ul className="space-y-1">
          {user?.interests.map((i) => (
            <li key={i.id}>
              <Link href={`/companies/${i.companyId}`} className="text-blue-600 hover:underline">
                {i.company.name}
              </Link>
              <span className="text-gray-500 text-sm ml-2">({i.status})</span>
            </li>
          ))}
        </ul>
      </div>

      {user && (
        <div className="pt-4 border-t">
          <DeleteMyDataButton />
        </div>
      )}
    </main>
  );
}
