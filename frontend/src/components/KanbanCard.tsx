import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import type { Card } from "@/lib/kanban";

type KanbanCardProps = {
  card: Card;
  onDelete: (cardId: string) => void;
};

export const KanbanCard = ({ card, onDelete }: KanbanCardProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={clsx(
        "gradient-card rounded-[22px] border border-transparent px-5 py-5 shadow-[var(--shadow-card)]",
        "transition-all duration-150",
        isDragging && "opacity-65 shadow-[var(--shadow-lift)]"
      )}
      {...attributes}
      {...listeners}
      data-testid={`card-${card.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="font-display text-[1.125rem] font-semibold leading-[1.3] text-[var(--navy-dark)]">
            {card.title}
          </h4>
          <p className="mt-3 break-words text-[0.97rem] leading-7 text-[var(--gray-text)]">
            {card.details}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onDelete(card.id)}
          className="rounded-full border border-transparent px-3 py-1 text-[0.8rem] font-semibold uppercase tracking-[0.06em] text-[var(--gray-text)] transition hover:border-[var(--stroke)] hover:text-[var(--navy-dark)]"
          aria-label={`Delete ${card.title}`}
        >
          Remove
        </button>
      </div>
    </article>
  );
};
