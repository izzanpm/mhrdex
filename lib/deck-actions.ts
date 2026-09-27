"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAuthSession } from "@/lib/auth-guard";
import {
  createOwnedDeck,
  deleteOwnedDeck,
  saveOwnedDeck,
} from "@/lib/decks";
import type { SaveDeckResult } from "@/types/deck";

export async function createDeck(): Promise<never> {
  const session = await requireAuthSession();
  const deckId = await createOwnedDeck(session.user.id);

  revalidatePath("/decks");
  redirect(`/decks/${deckId}/edit`);
}

export async function saveDeck(
  deckId: string,
  input: unknown,
): Promise<SaveDeckResult | never> {
  const session = await requireAuthSession();
  let result: SaveDeckResult;
  try {
    result = await saveOwnedDeck(session.user.id, deckId, input);
  } catch {
    return {
      ok: false,
      code: "save_failed",
      message: "The deck could not be saved. Please try again.",
    };
  }

  if (!result.ok) return result;

  revalidatePath("/decks");
  revalidatePath(`/decks/${deckId}/edit`);
  redirect(`/decks?deck=${deckId}`);
}

export async function deleteDeck(formData: FormData): Promise<never> {
  const session = await requireAuthSession();
  const deckId = formData.get("deckId");

  if (typeof deckId === "string") {
    await deleteOwnedDeck(session.user.id, deckId);
    revalidatePath("/decks");
    revalidatePath(`/decks/${deckId}/edit`);
  }

  redirect("/decks");
}
