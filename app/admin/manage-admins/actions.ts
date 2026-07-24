"use server";
import { prisma } from "@/db/client";
import { isAuthorized } from "@/auth/isAuthorized";
import { getSessionEmail } from "./getSessionEmail";
import { revalidatePath } from "next/cache";

async function requireAdmin(): Promise<string> {
  const email = await getSessionEmail();
  if (!email) throw new Error("Not authorized: no session");
  const { role } = await isAuthorized(email, prisma);
  if (role !== "admin") throw new Error("Not authorized: admin role required");
  return email;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function addAdmin(formData: FormData): Promise<void> {
  const actingEmail = await requireAdmin();
  const raw = formData.get("email");
  const newEmail = raw ? String(raw).trim().toLowerCase() : "";
  if (!EMAIL_PATTERN.test(newEmail)) {
    throw new Error("Enter a valid email address");
  }

  const existing = await prisma.adminUser.findUnique({ where: { email: newEmail } });
  if (existing) {
    throw new Error(`${newEmail} is already an admin`);
  }

  await prisma.adminUser.create({ data: { email: newEmail, addedBy: actingEmail } });
  revalidatePath("/admin/manage-admins");
}

export async function removeAdmin(id: string): Promise<void> {
  await requireAdmin();
  // Removing the last admin would lock everyone out of every admin route
  // with no self-service way back in — refuse rather than allow that.
  const count = await prisma.adminUser.count();
  if (count <= 1) {
    throw new Error("Cannot remove the last remaining admin");
  }
  await prisma.adminUser.delete({ where: { id } });
  revalidatePath("/admin/manage-admins");
}
