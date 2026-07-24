import { prisma } from "@/db/client";
import { addAdmin, removeAdmin } from "./actions";
import { getServerSession } from "next-auth";
import { buildAuthOptions } from "@/auth/authOptions";
import { isAuthorized } from "@/auth/isAuthorized";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ManageAdminsPage() {
  const session = await getServerSession(buildAuthOptions());
  const role = session?.user?.email ? (await isAuthorized(session.user.email, prisma)).role : null;
  if (role !== "admin") notFound();

  const admins = await prisma.adminUser.findMany({ orderBy: { createdAt: "asc" } });
  return (
    <main className="max-w-xl mx-auto p-6">
      <h1 className="text-xl font-semibold mb-4">Manage Admins</h1>
      <form action={addAdmin} className="flex gap-2 mb-6">
        <input
          name="email"
          type="email"
          required
          placeholder="new-admin@example.com"
          className="border rounded px-3 py-2 flex-1"
        />
        <button type="submit" className="bg-black text-white rounded px-4 py-2">
          Add
        </button>
      </form>
      <ul className="space-y-2">
        {admins.map((a) => (
          <li key={a.id} className="flex justify-between items-center border rounded px-3 py-2">
            <span>{a.email}</span>
            <form action={removeAdmin.bind(null, a.id)}>
              <button type="submit" className="text-red-600 text-sm">
                Remove
              </button>
            </form>
          </li>
        ))}
      </ul>
    </main>
  );
}
