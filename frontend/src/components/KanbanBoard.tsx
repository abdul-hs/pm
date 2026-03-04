"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type CollisionDetection,
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { AiSidebar, type AiMessage } from "@/components/AiSidebar";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { createId, moveCard, type BoardData } from "@/lib/kanban";
import {
  AIChatError,
  fetchKanbanBoard,
  fetchThemePreferences,
  KanbanConflictError,
  saveKanbanBoard,
  saveThemePreferences,
  ThemePreferencesError,
  sendAiChatMessage,
  UnauthorizedError,
} from "@/lib/kanbanApi";
import {
  applyThemePreferences,
  defaultThemePreferences,
  sanitizeThemePreferences,
  type ThemePreferences,
} from "@/lib/theme";

const collisionDetectionStrategy: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) {
    return pointerCollisions;
  }
  return closestCorners(args);
};

type KanbanBoardProps = {
  onAuthExpired?: () => void;
};

type ThemeColorKey = keyof ThemePreferences;

export const KanbanBoard = ({ onAuthExpired }: KanbanBoardProps) => {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([]);
  const [aiError, setAiError] = useState<string | null>(null);
  const [isAiSending, setIsAiSending] = useState(false);
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(false);
  const [isThemePanelOpen, setIsThemePanelOpen] = useState(false);
  const [themeDraft, setThemeDraft] = useState<ThemePreferences>(
    defaultThemePreferences
  );
  const [savedTheme, setSavedTheme] = useState<ThemePreferences>(
    defaultThemePreferences
  );
  const [isThemeSaving, setIsThemeSaving] = useState(false);
  const [themeError, setThemeError] = useState<string | null>(null);

  const boardRef = useRef<BoardData | null>(null);
  const versionRef = useRef<number | null>(null);
  const pendingSaveRef = useRef<BoardData | null>(null);
  const isFlushingRef = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const cardsById = useMemo(() => board?.cards ?? {}, [board]);

  const applyServerSnapshot = useCallback(
    (nextBoard: BoardData, nextVersion: number) => {
      boardRef.current = nextBoard;
      versionRef.current = nextVersion;
      setBoard(nextBoard);
      setVersion(nextVersion);
    },
    []
  );

  const handleSessionExpired = useCallback(() => {
    onAuthExpired?.();
    setLoadError("Session expired. Please sign in again.");
  }, [onAuthExpired]);

  const loadBoard = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const response = await fetchKanbanBoard();
      applyServerSnapshot(response.board, response.version);
      setSaveError(null);
      pendingSaveRef.current = null;
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        handleSessionExpired();
        return;
      }
      setLoadError("Unable to load board. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [applyServerSnapshot, handleSessionExpired]);

  const loadTheme = useCallback(async () => {
    setThemeError(null);
    try {
      const response = await fetchThemePreferences();
      const normalized = sanitizeThemePreferences(response);
      setSavedTheme(normalized);
      setThemeDraft(normalized);
      applyThemePreferences(normalized);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        handleSessionExpired();
        return;
      }
      setThemeError("Unable to load theme preferences.");
      applyThemePreferences(defaultThemePreferences);
    }
  }, [handleSessionExpired]);

  const flushSaves = useCallback(async () => {
    if (isFlushingRef.current) {
      return;
    }
    if (versionRef.current === null) {
      return;
    }

    isFlushingRef.current = true;
    setIsSaving(true);
    setSaveError(null);

    try {
      while (pendingSaveRef.current) {
        const nextBoard = pendingSaveRef.current;
        pendingSaveRef.current = null;

        const currentVersion = versionRef.current;
        if (!nextBoard || currentVersion === null) {
          break;
        }

        const response = await saveKanbanBoard(nextBoard, currentVersion);
        applyServerSnapshot(response.board, response.version);
      }
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        handleSessionExpired();
        return;
      }
      if (error instanceof KanbanConflictError) {
        await loadBoard();
        setSaveError(
          "Board changed elsewhere. Reloaded the latest version from server."
        );
      } else {
        pendingSaveRef.current = boardRef.current;
        setSaveError("Could not save board changes. Retry to persist.");
      }
    } finally {
      isFlushingRef.current = false;
      setIsSaving(false);
    }
  }, [applyServerSnapshot, handleSessionExpired, loadBoard]);

  const persistBoard = useCallback(
    (nextBoard: BoardData) => {
      boardRef.current = nextBoard;
      setBoard(nextBoard);
      pendingSaveRef.current = nextBoard;
      if (!isFlushingRef.current) {
        void flushSaves();
      }
    },
    [flushSaves]
  );

  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  useEffect(() => {
    void loadTheme();
  }, [loadTheme]);

  const handleThemeColorChange = (key: ThemeColorKey, value: string) => {
    setThemeError(null);
    setThemeDraft((previous) => {
      const nextTheme = sanitizeThemePreferences({ ...previous, [key]: value });
      applyThemePreferences(nextTheme);
      return nextTheme;
    });
  };

  const handleThemeSave = async () => {
    setThemeError(null);
    setIsThemeSaving(true);
    try {
      const response = await saveThemePreferences(themeDraft);
      const normalized = sanitizeThemePreferences(response);
      setSavedTheme(normalized);
      setThemeDraft(normalized);
      applyThemePreferences(normalized);
      setIsThemePanelOpen(false);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        handleSessionExpired();
        return;
      }
      if (error instanceof ThemePreferencesError) {
        setThemeError(error.message);
        return;
      }
      setThemeError("Unable to save theme preferences.");
    } finally {
      setIsThemeSaving(false);
    }
  };

  const handleThemeReset = () => {
    setThemeError(null);
    setThemeDraft(savedTheme);
    applyThemePreferences(savedTheme);
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveCardId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCardId(null);

    if (!over || active.id === over.id) {
      return;
    }
    const currentBoard = boardRef.current;
    if (!currentBoard) {
      return;
    }
    persistBoard({
      ...currentBoard,
      columns: moveCard(
        currentBoard.columns,
        active.id as string,
        over.id as string
      ),
    });
  };

  const handleRenameColumn = (columnId: string, title: string) => {
    const currentBoard = boardRef.current;
    if (!currentBoard) {
      return;
    }
    persistBoard({
      ...currentBoard,
      columns: currentBoard.columns.map((column) =>
        column.id === columnId ? { ...column, title } : column
      ),
    });
  };

  const handleAddCard = (columnId: string, title: string, details: string) => {
    const currentBoard = boardRef.current;
    if (!currentBoard) {
      return;
    }
    const id = createId("card");
    persistBoard({
      ...currentBoard,
      cards: {
        ...currentBoard.cards,
        [id]: { id, title, details: details || "No details yet." },
      },
      columns: currentBoard.columns.map((column) =>
        column.id === columnId
          ? { ...column, cardIds: [...column.cardIds, id] }
          : column
      ),
    });
  };

  const handleDeleteCard = (columnId: string, cardId: string) => {
    const currentBoard = boardRef.current;
    if (!currentBoard) {
      return;
    }
    persistBoard({
      ...currentBoard,
      cards: Object.fromEntries(
        Object.entries(currentBoard.cards).filter(([id]) => id !== cardId)
      ),
      columns: currentBoard.columns.map((column) =>
        column.id === columnId
          ? {
              ...column,
              cardIds: column.cardIds.filter((id) => id !== cardId),
            }
          : column
      ),
    });
  };

  const handleSendAiMessage = useCallback(
    async (message: string) => {
      const trimmedMessage = message.trim();
      if (!trimmedMessage || !boardRef.current || versionRef.current === null) {
        return;
      }

      setAiError(null);
      setAiMessages((previous) => [
        ...previous,
        { id: createId("chat"), role: "user", content: trimmedMessage },
      ]);
      setIsAiSending(true);

      try {
        if (pendingSaveRef.current || isFlushingRef.current) {
          await flushSaves();
        }
        if (pendingSaveRef.current) {
          setAiError("Please retry after board changes finish saving.");
          return;
        }

        const response = await sendAiChatMessage(trimmedMessage);
        applyServerSnapshot(response.board, response.version);
        pendingSaveRef.current = null;
        setSaveError(null);
        setAiMessages((previous) => [
          ...previous,
          {
            id: createId("chat"),
            role: "assistant",
            content: response.assistantMessage,
          },
        ]);
      } catch (error) {
        if (error instanceof UnauthorizedError) {
          handleSessionExpired();
          return;
        }
        if (error instanceof KanbanConflictError) {
          await loadBoard();
          setAiError("Board changed while AI was working. Reloaded latest board.");
          return;
        }
        if (error instanceof AIChatError) {
          setAiError(error.message);
          return;
        }
        setAiError("AI request failed. Please try again.");
      } finally {
        setIsAiSending(false);
      }
    },
    [applyServerSnapshot, flushSaves, handleSessionExpired, loadBoard]
  );

  const activeCard = activeCardId ? cardsById[activeCardId] : null;

  if (isLoading || !board || version === null) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-xl items-center justify-center px-6">
        <div className="gradient-surface w-full rounded-3xl border border-[var(--stroke)] p-8 text-center shadow-[var(--shadow)]">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
            Kanban Studio
          </p>
          <h2 className="mt-3 font-display text-2xl font-semibold text-[var(--navy-dark)]">
            Loading board...
          </h2>
          {loadError ? (
            <>
              <p className="mt-3 text-sm font-medium text-[var(--secondary-purple)]">
                {loadError}
              </p>
              <button
                type="button"
                onClick={() => void loadBoard()}
                className="mt-4 rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--navy-dark)] transition hover:border-[var(--primary-blue)] hover:text-[var(--primary-blue)]"
              >
                Retry load
              </button>
            </>
          ) : null}
        </div>
      </main>
    );
  }

  return (
    <div className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(var(--user-gradient-start-rgb), 0.25) 0%, rgba(var(--user-gradient-end-rgb), 0.07) 55%, transparent 70%)",
        }}
      />
      <div
        className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(var(--user-gradient-end-rgb), 0.2) 0%, rgba(var(--user-gradient-start-rgb), 0.06) 55%, transparent 75%)",
        }}
      />

      <main
        className={`relative mx-auto flex min-h-screen max-w-[2100px] flex-col gap-10 px-6 pb-16 pt-12 ${
          isAiPanelOpen ? "min-[1600px]:pr-[calc(var(--ai-panel-width)+1.5rem)]" : ""
        }`}
      >
        <header className="gradient-surface flex flex-col gap-6 rounded-[32px] border border-[var(--stroke)] p-8 shadow-[var(--shadow)] backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-[var(--gray-text)]">
                Single Board Kanban
              </p>
              <h1 className="mt-3 font-display text-5xl font-semibold leading-[1.05] text-[var(--navy-dark)] sm:text-[3.4rem]">
                Kanban Studio
              </h1>
              <p className="mt-4 max-w-2xl text-[1.08rem] leading-8 text-[var(--gray-text)]">
                Keep momentum visible. Rename columns, drag cards between stages,
                and capture quick notes without getting buried in settings.
              </p>
            </div>
            <div className="relative flex w-full max-w-[320px] flex-col items-stretch gap-3 sm:w-auto">
              <div className="gradient-soft rounded-2xl border border-[var(--stroke)] px-5 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--gray-text)]">
                  Focus
                </p>
                <p className="mt-2 text-2xl font-semibold leading-[1.1] text-[var(--primary-blue)] sm:text-[1.9rem]">
                  {isSaving
                    ? "Saving changes..."
                    : isAiSending
                      ? "Applying AI updates..."
                      : "All changes saved"}
                </p>
                <p className="mt-2 text-[0.9rem] text-[var(--gray-text)]">Version {version}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsThemePanelOpen((previous) => !previous)}
                className="gradient-chip rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--navy-dark)] transition hover:border-[var(--primary-blue)] hover:text-[var(--primary-blue)]"
                data-testid="open-theme-settings"
              >
                {isThemePanelOpen ? "Close Theme" : "Theme Colors"}
              </button>
              {isThemePanelOpen ? (
                <div
                  className="gradient-surface rounded-2xl border border-[var(--stroke)] p-4 shadow-[var(--shadow-card)]"
                  data-testid="theme-settings-panel"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
                    Gradient Colors
                  </p>
                  <div className="mt-3 grid grid-cols-3 gap-3">
                    <label className="flex flex-col items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--gray-text)]">
                      Start
                      <input
                        type="color"
                        value={themeDraft.gradientStart}
                        onChange={(event) =>
                          handleThemeColorChange("gradientStart", event.target.value)
                        }
                        aria-label="Gradient start color"
                        data-testid="theme-color-start"
                        className="h-10 w-10 cursor-pointer rounded-lg border border-[var(--stroke)] bg-white p-0"
                      />
                    </label>
                    <label className="flex flex-col items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--gray-text)]">
                      Mid
                      <input
                        type="color"
                        value={themeDraft.gradientMid}
                        onChange={(event) =>
                          handleThemeColorChange("gradientMid", event.target.value)
                        }
                        aria-label="Gradient middle color"
                        data-testid="theme-color-mid"
                        className="h-10 w-10 cursor-pointer rounded-lg border border-[var(--stroke)] bg-white p-0"
                      />
                    </label>
                    <label className="flex flex-col items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--gray-text)]">
                      End
                      <input
                        type="color"
                        value={themeDraft.gradientEnd}
                        onChange={(event) =>
                          handleThemeColorChange("gradientEnd", event.target.value)
                        }
                        aria-label="Gradient end color"
                        data-testid="theme-color-end"
                        className="h-10 w-10 cursor-pointer rounded-lg border border-[var(--stroke)] bg-white p-0"
                      />
                    </label>
                  </div>
                  {themeError ? (
                    <p className="mt-3 text-xs font-medium text-[var(--secondary-purple)]">
                      {themeError}
                    </p>
                  ) : null}
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleThemeSave()}
                      disabled={isThemeSaving}
                      className="gradient-primary rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.09em] text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                      data-testid="save-theme-settings"
                    >
                      {isThemeSaving ? "Saving..." : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={handleThemeReset}
                      className="rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.09em] text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
                    >
                      Reset
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {board.columns.map((column) => (
              <div
                key={column.id}
                className="gradient-chip flex items-center gap-2 rounded-full border border-[var(--stroke)] px-4 py-2 text-[0.76rem] font-semibold uppercase tracking-[0.18em] text-[var(--navy-dark)]"
              >
                <span className="h-2 w-2 rounded-full bg-[var(--accent-yellow)]" />
                {column.title}
              </div>
            ))}
          </div>
          {saveError ? (
            <div className="gradient-soft flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--stroke)] px-4 py-3">
              <p className="text-sm font-medium text-[var(--secondary-purple)]">
                {saveError}
              </p>
              <button
                type="button"
                onClick={() => void flushSaves()}
                className="rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--navy-dark)] transition hover:border-[var(--primary-blue)] hover:text-[var(--primary-blue)]"
              >
                Retry save
              </button>
            </div>
          ) : null}
        </header>

        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetectionStrategy}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <section
            className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-flow-col xl:auto-cols-[minmax(var(--column-min-width),1fr)] xl:overflow-x-auto xl:pb-4 min-[1600px]:grid-flow-row min-[1600px]:auto-cols-auto min-[1600px]:grid-cols-5 min-[1600px]:overflow-visible min-[1600px]:pb-0"
            data-testid="kanban-columns-row"
          >
            {board.columns.map((column) => (
              <KanbanColumn
                key={column.id}
                column={column}
                cards={column.cardIds.map((cardId) => board.cards[cardId])}
                onRename={handleRenameColumn}
                onAddCard={handleAddCard}
                onDeleteCard={handleDeleteCard}
              />
            ))}
          </section>
          <DragOverlay>
            {activeCard ? (
              <div className="w-[260px]">
                <KanbanCardPreview card={activeCard} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </main>

      {isAiPanelOpen ? (
        <button
          type="button"
          aria-label="Close AI assistant"
          onClick={() => setIsAiPanelOpen(false)}
          className="fixed inset-0 z-30 bg-[rgba(3,33,71,0.18)] backdrop-blur-[1px] xl:hidden"
        />
      ) : null}

      <aside
        className={`fixed inset-x-4 bottom-4 z-40 transform transition duration-300 sm:inset-x-auto sm:right-6 sm:w-[var(--ai-panel-width)] min-[1600px]:top-24 min-[1600px]:bottom-6 ${
          isAiPanelOpen
            ? "translate-x-0 opacity-100"
            : "pointer-events-none translate-x-[110%] opacity-0"
        }`}
      >
        <div className="max-h-[var(--ai-panel-max-height)] overflow-y-auto min-[1600px]:h-full min-[1600px]:max-h-none">
          <AiSidebar
            messages={aiMessages}
            isSending={isAiSending}
            error={aiError}
            onSendMessage={handleSendAiMessage}
            onClose={() => setIsAiPanelOpen(false)}
          />
        </div>
      </aside>

      {!isAiPanelOpen ? (
        <button
          type="button"
          onClick={() => setIsAiPanelOpen(true)}
          className="gradient-primary fixed bottom-6 right-6 z-30 rounded-full px-5 py-3 text-sm font-semibold text-white shadow-[var(--shadow)] transition hover:brightness-110"
          data-testid="open-ai-assistant"
        >
          AI Assistant
        </button>
      ) : null}
    </div>
  );
};
