import { Sidebar } from "@/components/sidebar";

export default function Loading() {
  return (
    <div className="min-h-screen bg-app-canvas text-app-text">
      <Sidebar />
      <main className="min-w-0 md:ml-[232px]">
        <div className="min-h-screen w-full px-5 py-6 sm:px-7 md:px-[51px] md:pt-[46px]">
          <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-app-text-dim">
            Card Library
          </p>
          <h1 className="mt-5 text-[30px] font-normal leading-none text-app-text-strong">
            Loading card catalog...
          </h1>
          <div className="mt-[31px] h-[53px] animate-pulse rounded-[9px] bg-app-surface-input motion-reduce:animate-none" />
          <div className="mt-[95px] grid grid-cols-2 gap-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 2xl:grid-cols-8">
            {Array.from({ length: 8 }, (_, index) => (
              <div
                className="aspect-[3/4] animate-pulse rounded-[10px] border border-app-border-image bg-app-image-surface motion-reduce:animate-none"
                key={index}
              />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
