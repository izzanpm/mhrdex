import { Badge } from "@/components/ui/badge";
import type { GameEvent } from "@/lib/simulator/types";

function eventLabel(event: GameEvent) {
  const actor = event.playerId === null ? "System" : event.playerId === "player" ? "You" : "Bot";
  return `${actor}: ${event.type.replaceAll("-", " ")}`;
}

export function SimulatorEventLog({ events }: { events: readonly GameEvent[] }) {
  const publicEvents = [...events]
    .filter((event) => event.visibility === "public")
    .sort((left, right) => left.sequence - right.sequence);

  return (
    <section aria-label="Public event log" className="min-w-0 rounded-[10px] border border-app-border-soft bg-app-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-app-text-dim">Record</p>
          <h2 className="mt-2 text-[16px] text-app-text-strong">Public events</h2>
        </div>
        <Badge className="rounded-[4px] font-mono text-[8px]" variant="outline">{publicEvents.length}</Badge>
      </div>
      {publicEvents.length > 0 ? (
        <ol className="mt-4 grid max-h-72 min-w-0 gap-2 overflow-y-auto pr-1">
          {publicEvents.map((event) => (
            <li className="min-w-0 rounded-[5px] bg-app-surface-input px-3 py-2" key={`${event.sequence}-${event.type}`}>
              <div className="flex min-w-0 items-start gap-2">
                <span className="shrink-0 font-mono text-[8px] text-app-text-dim">{String(event.sequence).padStart(2, "0")}</span>
                <span className="min-w-0 break-words text-[10px] leading-4 text-app-text-panel">{eventLabel(event)}</span>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-4 rounded-[6px] border border-dashed border-app-border-dashed px-3 py-4 text-[10px] leading-4 text-app-text-muted">Public events will appear after the game starts.</p>
      )}
    </section>
  );
}
