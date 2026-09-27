import { Badge } from "@/components/ui/badge";

export function DeckTraitBadges({
  traitNames,
}: {
  traitNames: readonly string[];
}) {
  if (traitNames.length === 0) return null;

  return (
    <div
      aria-label="Deck traits"
      className="mt-4 flex flex-wrap gap-2"
      role="group"
    >
      {traitNames.map((traitName) => (
        <Badge key={traitName} variant="secondary">
          {traitName}
        </Badge>
      ))}
    </div>
  );
}
