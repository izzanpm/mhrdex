"use client";

import { useRef, useState } from "react";

import { AppIcon } from "@/components/app-icon";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { deleteDeck } from "@/lib/deck-actions";

export function DeleteDeckButton({ deckId }: { deckId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);

  function handleDelete() {
    setOpen(false);
    formRef.current?.requestSubmit();
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <form action={deleteDeck} className="shrink-0" ref={formRef}>
        <input name="deckId" type="hidden" value={deckId} />
        <DialogTrigger
          render={
            <Button
              aria-label="Delete deck"
              className="size-11 rounded-[8px] border-app-danger-border bg-transparent text-app-danger-text outline-none transition-colors hover:border-app-danger-border hover:bg-app-danger-hover focus-visible:ring-app-accent"
              title="Delete deck"
              type="button"
              variant="outline"
            />
          }
        >
          <AppIcon name="trash" size={15} />
        </DialogTrigger>
      </form>

      <DialogContent className="border-app-border bg-app-surface-card p-6 text-app-text sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="text-[18px] font-normal text-app-text-strong">
            Delete deck?
          </DialogTitle>
          <DialogDescription className="text-[12px] leading-5 text-app-text-muted">
            This action cannot be undone. The deck and its saved cards will be
            deleted.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="-mx-6 -mb-6 mt-2 flex-row justify-end border-app-border-soft bg-app-surface p-4">
          <DialogClose
            render={
              <Button
                className="min-h-11 rounded-[7px] border-app-border-control bg-app-surface-input px-4 font-mono text-[9px] font-normal uppercase tracking-[0.05em] text-app-text-panel hover:border-app-text-dim hover:bg-app-surface-input hover:text-app-text-logo"
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
            }
          />
          <Button
            className="min-h-11 rounded-[7px] border-app-danger-border bg-app-danger-surface px-4 font-mono text-[9px] font-normal uppercase tracking-[0.05em] text-app-danger-text hover:bg-app-danger-hover"
            onClick={handleDelete}
            type="button"
            variant="outline"
          >
            Delete deck
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
