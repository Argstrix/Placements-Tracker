import { getServerSession } from "next-auth";
import { buildAuthOptions } from "@/auth/authOptions";

export async function getSessionEmail(): Promise<string | null> {
  const session = await getServerSession(buildAuthOptions());
  return session?.user?.email ?? null;
}
