import { Sidebar } from "@/components/sidebar";

export default function Loading() {
  return (
    <div aria-busy="true" className="min-h-screen bg-app-canvas text-app-text">
      <Sidebar pathname="/simulator" />
      <main className="min-w-0 md:ml-[232px]">
        <div className="min-h-screen min-w-0 px-4 py-5 sm:px-7 md:px-[51px] md:py-[46px]">
          <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-app-text-dim">Operate</p>
          <h1 className="mt-4 text-[30px] leading-none text-app-text-strong">Loading simulator setup...</h1>
          <p className="mt-4 text-[12px] leading-5 text-app-text-muted">Checking your owned decks and supported cards.</p>
          <div className="mt-8 grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="h-[420px] min-w-0 animate-pulse rounded-[10px] bg-app-surface motion-reduce:animate-none" />
            <div className="h-[260px] min-w-0 animate-pulse rounded-[10px] bg-app-surface-card motion-reduce:animate-none" />
          </div>
        </div>
      </main>
    </div>
  );
}
