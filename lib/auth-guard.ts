import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

type AuthSession = Awaited<ReturnType<typeof auth.api.getSession>>;
type SessionReader = () => Promise<AuthSession>;

export async function requireAuthSession(
  readSession: SessionReader = async () =>
    auth.api.getSession({ headers: await headers() }),
  redirectToLogin: () => never = () => redirect("/sign-in"),
) {
  const session = await readSession();
  if (!session?.user) redirectToLogin();

  return session;
}
