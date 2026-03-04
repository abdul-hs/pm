import clsx from "clsx";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Card, Column } from "@/lib/kanban";
import { KanbanCard } from "@/components/KanbanCard";
import { NewCardForm } from "@/components/NewCardForm";

type KanbanColumnProps = {
  column: Column;
  cards: Card[];
  onRename: (columnId: string, title: string) => void;
  onAddCard: (columnId: string, title: string, details: string) => void;
  onDeleteCard: (columnId: string, cardId: string) => void;
};

export const KanbanColumn = ({
  column,
  cards,
  onRename,
  onAddCard,
  onDeleteCard,
}: KanbanColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  return (
    <section
      ref={setNodeRef}
      className={clsx(
        "gradient-column flex min-h-[560px] flex-col rounded-[30px] border border-transparent p-5 shadow-[var(--shadow)] transition",
        isOver && "border-[var(--stroke-strong)] ring-2 ring-[var(--accent-yellow)]"
      )}
      data-testid={`column-${column.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="w-full">
          <div className="flex items-center gap-3">
            <div className="h-2 w-10 rounded-full bg-[var(--accent-yellow)]" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--gray-text)]">
              {cards.length} cards
            </span>
          </div>
          <input
            value={column.title}
            onChange={(event) => onRename(column.id, event.target.value)}
            className="mt-3 w-full bg-transparent font-display text-[1.65rem] leading-[1.1] font-semibold text-[var(--navy-dark)] outline-none"
            aria-label="Column title"
          />
        </div>
      </div>
      <div className="mt-5 flex flex-1 flex-col gap-4">
        <SortableContext items={column.cardIds} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              onDelete={(cardId) => onDeleteCard(column.id, cardId)}
            />
          ))}
        </SortableContext>
        {cards.length === 0 && (
          <div className="gradient-soft flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--stroke)] px-4 py-7 text-center">
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
              Empty Stage
            </span>
            <span className="mt-2 text-sm leading-6 text-[var(--gray-text)]">
              Drop a card here to keep work moving.
            </span>
          </div>
        )}
      </div>
      <NewCardForm
        onAdd={(title, details) => onAddCard(column.id, title, details)}
      />
    </section>
  );
};
