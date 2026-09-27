import { headers } from "next/headers";
import { connection } from "next/server";

import { CardLibrary } from "@/components/card-library";
import { Sidebar } from "@/components/sidebar";
import { auth } from "@/lib/auth";
import { getCards } from "@/lib/cards";
import type { CardListItem } from "@/types/card";
import type { AuthenticatedUser } from "@/types/user";

export default async function CardLibraryPage() {
  await connection();

  let cardResults: CardListItem[] = [];
  let loadError = false;
  let user: AuthenticatedUser | null = null;

  try {
    cardResults = await getCards();
  } catch {
    loadError = true;
  }

  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (session?.user) {
      user = {
        email: session.user.email,
        image: session.user.image ?? null,
        name: session.user.name,
      };
    }
  } catch {
    user = null;
  }

  return (
    <div className="min-h-screen bg-app-canvas text-app-text">
      <Sidebar />

      <main className="min-w-0 md:ml-[232px]">
        <div className="min-h-screen w-full px-5 py-6 sm:px-7 md:px-[51px] md:pt-[46px]">
          <CardLibrary cards={cardResults} loadError={loadError} user={user} />
        </div>
      </main>
    </div>
  );
}
