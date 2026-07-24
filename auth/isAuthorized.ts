import type { PrismaClient } from "@prisma/client";

export interface AuthResult {
  allowed: boolean;
  role: "student" | "admin" | null;
}

export async function isAuthorized(email: string, db: PrismaClient): Promise<AuthResult> {
  const normalized = email.toLowerCase();

  const admin = await db.adminUser.findUnique({ where: { email: normalized } });
  if (admin) return { allowed: true, role: "admin" };

  if (normalized.endsWith("@vitstudent.ac.in")) {
    return { allowed: true, role: "student" };
  }

  return { allowed: false, role: null };
}
