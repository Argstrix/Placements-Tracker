import type { PrismaClient } from "@prisma/client";

export interface AuthResult {
  allowed: boolean;
  role: "student" | "admin" | null;
}

// Access is restricted to the CURRENT placement batch. Companies share job
// descriptions and shortlists on the condition that only the batch they're
// recruiting from can see them, so we cannot open this to every VIT student.
// The current batch's vitstudent.ac.in addresses always contain "2023"; other
// batches (juniors/seniors) are intentionally locked out. Admins on the
// allowlist bypass the batch check.
const CURRENT_BATCH_MARKER = "2023";

export async function isAuthorized(email: string, db: PrismaClient): Promise<AuthResult> {
  const normalized = email.toLowerCase();

  const admin = await db.adminUser.findUnique({ where: { email: normalized } });
  if (admin) return { allowed: true, role: "admin" };

  if (normalized.endsWith("@vitstudent.ac.in") && normalized.includes(CURRENT_BATCH_MARKER)) {
    return { allowed: true, role: "student" };
  }

  return { allowed: false, role: null };
}
