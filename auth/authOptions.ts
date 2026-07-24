import type { NextAuthOptions, Session } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "@/db/client";
import { isAuthorized } from "./isAuthorized";
import { getEnv } from "@/env";
import { seedInitialAdmin } from "@/admin/seedInitialAdmin";

export function buildAuthOptions(): NextAuthOptions {
  const env = getEnv();
  return {
    providers: [
      GoogleProvider({
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      }),
    ],
    callbacks: {
      async signIn({ user }) {
        if (!user.email) return false;
        // Idempotent (upsert) — safe to run on every sign-in attempt rather
        // than depending on a separate startup hook, which behaves
        // inconsistently across serverless cold starts.
        await seedInitialAdmin(prisma, env.INITIAL_ADMIN_EMAIL);
        const { allowed } = await isAuthorized(user.email, prisma);
        return allowed;
      },
      async session({ session }: { session: Session }) {
        if (session.user?.email) {
          const { role } = await isAuthorized(session.user.email, prisma);
          (session.user as typeof session.user & { role: string | null }).role = role;
        }
        return session;
      },
    },
    secret: env.NEXTAUTH_SECRET,
  };
}
