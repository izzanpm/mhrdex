"use client";

import Link from "next/link";
import { useState } from "react";

import { AppIcon } from "@/components/app-icon";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { submitSignOut } from "@/lib/auth-submit";
import { cn } from "@/lib/utils";
import type { AuthenticatedUser } from "@/types/user";

function getInitials(user: AuthenticatedUser) {
  const initials = user.name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");

  return (initials || user.email.slice(0, 2)).toUpperCase();
}

export function AccountControls({ user }: { user: AuthenticatedUser | null }) {
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSignOut() {
    setIsSigningOut(true);
    const error = await submitSignOut();
    if (error) {
      setNotice(error);
      setIsSigningOut(false);
    }
  }

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <Link
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "h-11 px-3 font-mono text-[9px] font-normal uppercase tracking-[0.08em] text-app-text-muted hover:text-app-text-logo",
          )}
          href="/sign-in"
        >
          Sign in
        </Link>
        <Link
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "h-11 border-app-border bg-app-surface px-3 font-mono text-[9px] font-normal uppercase tracking-[0.08em] text-app-text-muted hover:border-app-accent hover:bg-app-surface hover:text-app-accent-hover",
          )}
          href="/sign-up"
        >
          Sign up
        </Link>
      </div>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              aria-label="Open account menu"
              className="size-11 rounded-full border border-app-border bg-app-surface p-0 text-app-text-muted transition-colors hover:border-app-accent hover:bg-app-surface hover:text-app-text-logo"
              size="icon-lg"
              type="button"
              variant="ghost"
            />
          }
        >
          <Avatar className="size-full after:border-0" size="lg">
            <AvatarImage alt={user.name} src={user.image ?? undefined} />
            <AvatarFallback className="rounded-full bg-app-surface font-mono text-[8px] uppercase tracking-[0.08em] text-app-text-muted">
              {getInitials(user)}
            </AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            className="border border-app-danger-border bg-app-danger-surface text-app-danger-text data-highlighted:bg-app-danger-hover data-highlighted:text-app-danger-text"
            closeOnClick={false}
            disabled={isSigningOut}
            onClick={() => void handleSignOut()}
          >
            {isSigningOut ? <Spinner className="size-3" /> : null}
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {notice ? (
        <div
          aria-live="polite"
          className="fixed bottom-4 left-1/2 z-20 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center justify-between gap-4 rounded-[6px] border border-app-border-notice bg-app-surface-card px-4 py-3 text-sm text-app-text-notice shadow-xl shadow-app-shadow/25"
        >
          <span>{notice}</span>
          <Button
            aria-label="Dismiss notice"
            className="size-11 shrink-0 rounded-[5px] text-app-text-subtle hover:bg-app-surface-modal-close hover:text-app-text-logo"
            onClick={() => setNotice(null)}
            type="button"
            variant="ghost"
          >
            <AppIcon name="close" size={14} />
          </Button>
        </div>
      ) : null}
    </>
  );
}
