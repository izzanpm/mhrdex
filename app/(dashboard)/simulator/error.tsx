"use client";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-app-canvas px-5 text-app-text">
      <section className="w-full max-w-[410px] rounded-[10px] bg-app-surface-card p-8">
        <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-app-text-dim">Operate</p>
        <h1 className="mt-5 text-[24px] text-app-text-strong">Simulator could not load</h1>
        <p className="mt-4 text-[14px] leading-5 text-app-text-muted">The simulator setup is temporarily unavailable. Try again to reload it.</p>
        <button
          className="mt-7 min-h-11 rounded-[8px] bg-app-accent px-4 text-[12px] text-app-canvas outline-none transition-colors hover:bg-app-accent-hover focus-visible:ring-2 focus-visible:ring-app-accent focus-visible:ring-offset-2 focus-visible:ring-offset-app-surface-card"
          onClick={reset}
          type="button"
        >
          Try again
        </button>
      </section>
    </main>
  );
}
