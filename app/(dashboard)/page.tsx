import { connection } from "next/server";

import { CardLibrary } from "@/components/card-library";
import { Sidebar } from "@/components/sidebar";
import { getCards } from "@/lib/cards";
import type { CardListItem } from "@/types/card";

export default async function CardLibraryPage() {
  await connection();

  let cardResults: CardListItem[] = [];
  let loadError = false;

  try {
    cardResults = await getCards();
  } catch {
    loadError = true;
  }

  return (
    <div className="min-h-screen bg-app-canvas text-app-text">
      <Sidebar />

      <main className="min-w-0 md:ml-[232px]">
        <div className="min-h-screen w-full px-5 py-6 sm:px-7 md:px-[51px] md:pt-[46px]">
          <CardLibrary cards={cardResults} loadError={loadError} />
        </div>
      </main>
    </div>
  );
}
