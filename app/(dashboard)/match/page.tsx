import { Sidebar } from "@/components/sidebar";
import { requireAuthSession } from "@/lib/auth-guard";

export default async function MatchPage() {
  await requireAuthSession();

  return (
    <div className="min-h-screen bg-app-canvas text-app-text">
      <Sidebar />

      <main className="min-w-0 md:ml-[232px]">
        <div className="min-h-screen w-full px-5 py-6 sm:px-7 md:px-[51px] md:pt-[46px]">
          <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-app-text-dim">
            Match
          </p>
          <h1 className="mt-5 text-[30px] font-normal leading-none tracking-[-0.02em] text-app-text-strong">
            Match tracking is coming soon
          </h1>
        </div>
      </main>
    </div>
  );
}
