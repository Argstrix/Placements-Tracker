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
    <div className="view">
      <div className="phead">
        <p className="eye">Admin · access</p>
        <h1>Manage admins</h1>
        <p>
          Anyone here can sign in and manage the tracker. The allowlist isn&rsquo;t domain-restricted, so a non-VIT
          co-maintainer can be added too.
        </p>
      </div>

      <form action={addAdmin} className="panel" style={{ marginBottom: 18 }}>
        <h3>Add an admin</h3>
        <p className="psub">They&rsquo;ll get access the next time they sign in with Google.</p>
        <div className="formrow">
          <input
            name="email"
            type="email"
            required
            placeholder="name@vitstudent.ac.in"
            className="mono"
            style={{
              flex: 1,
              minWidth: 200,
              padding: "10px 12px",
              borderRadius: 9,
              border: "1px solid var(--hair)",
              background: "var(--card-2)",
              color: "var(--ink)",
            }}
          />
          <button type="submit" className="btn pri">
            Add admin
          </button>
        </div>
      </form>

      <div className="tablewrap">
        <table className="pb">
          <thead>
            <tr>
              <th>Email</th>
              <th>Added</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {admins.map((a) => (
              <tr key={a.id}>
                <td className="mono">{a.email}</td>
                <td className="mono" style={{ color: "var(--muted)" }}>
                  {a.createdAt.toLocaleDateString()}
                </td>
                <td>
                  <form action={removeAdmin.bind(null, a.id)}>
                    <button type="submit" className="btn danger">
                      Remove
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
