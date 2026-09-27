import { Sidebar } from "@/components/sidebar";

export default function Loading() {
  return (
    <div
      aria-busy="true"
      className="min-h-screen bg-app-canvas text-app-text"
    >
      <Sidebar />
      <main className="min-w-0 md:ml-[232px]">
        <div className="min-h-screen w-full px-5 py-6 sm:px-7 md:px-[51px] md:pt-[46px]">
          <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-app-text-dim">
            Decks
          </p>
          <h1 className="mt-5 text-[30px] font-normal leading-none text-app-text-strong">
            Loading deck list...
          </h1>
          <div className="mt-9 grid gap-4 lg:grid-cols-[minmax(230px,0.34fr)_minmax(0,1fr)]">
            <div className="h-[360px] animate-pulse rounded-[10px] bg-app-surface motion-reduce:animate-none" />
            <div className="h-[360px] animate-pulse rounded-[10px] bg-app-surface-card motion-reduce:animate-none" />
          </div>
        </div>
      </main>
    </div>
  );
}
