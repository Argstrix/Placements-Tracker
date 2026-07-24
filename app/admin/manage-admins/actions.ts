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

export async function addAdmin(formData: FormData): Promise<void> {
  const actingEmail = await requireAdmin();
  const newEmail = String(formData.get("email")).toLowerCase();
  await prisma.adminUser.create({ data: { email: newEmail, addedBy: actingEmail } });
  revalidatePath("/admin/manage-admins");
}

export async function removeAdmin(id: string): Promise<void> {
  await requireAdmin();
  await prisma.adminUser.delete({ where: { id } });
  revalidatePath("/admin/manage-admins");
}
