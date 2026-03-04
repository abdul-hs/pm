import type { Card } from "@/lib/kanban";

type KanbanCardPreviewProps = {
  card: Card;
};

export const KanbanCardPreview = ({ card }: KanbanCardPreviewProps) => (
  <article className="gradient-card rounded-2xl border border-transparent px-4 py-4 shadow-[var(--shadow-lift)]">
    <div className="flex items-start justify-between gap-3">
      <div>
        <h4 className="font-display text-base font-semibold text-[var(--navy-dark)]">
          {card.title}
        </h4>
        <p className="mt-2 text-sm leading-6 text-[var(--gray-text)]">
          {card.details}
        </p>
      </div>
    </div>
  </article>
);
