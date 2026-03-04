import { FormEvent, useMemo, useState } from "react";

export type AiMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type AiSidebarProps = {
  messages: AiMessage[];
  isSending: boolean;
  error: string | null;
  onSendMessage: (message: string) => Promise<void> | void;
  onClose?: () => void;
};

const roleLabel: Record<AiMessage["role"], string> = {
  user: "You",
  assistant: "AI Assistant",
};

export const AiSidebar = ({
  messages,
  isSending,
  error,
  onSendMessage,
  onClose,
}: AiSidebarProps) => {
  const [draft, setDraft] = useState("");
  const hasMessages = messages.length > 0;
  const sendDisabled = isSending || !draft.trim();

  const conversation = useMemo(() => {
    if (!hasMessages) {
      return (
        <p className="text-[0.97rem] leading-7 text-[var(--gray-text)]">
          Ask for board updates like renaming a column or adding a review task.
        </p>
      );
    }

    return (
      <ul className="space-y-3">
        {messages.map((message) => (
          <li
            key={message.id}
            className={`rounded-2xl border p-3 ${
              message.role === "assistant"
                ? "gradient-input border-[var(--stroke)]"
                : "border-[var(--primary-blue)]/30 bg-[linear-gradient(145deg,rgba(var(--user-gradient-start-rgb),0.17),rgba(var(--user-gradient-end-rgb),0.1))]"
            }`}
            data-testid={`ai-message-${message.role}`}
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
              {roleLabel[message.role]}
            </p>
            <p className="mt-2 whitespace-pre-wrap text-[0.97rem] leading-7 text-[var(--navy-dark)]">
              {message.content}
            </p>
          </li>
        ))}
      </ul>
    );
  }, [hasMessages, messages]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = draft.trim();
    if (!message || isSending) {
      return;
    }

    setDraft("");
    await onSendMessage(message);
  };

  return (
    <aside
      className="gradient-panel rounded-3xl border border-[var(--stroke)] p-5 shadow-[var(--shadow)] backdrop-blur"
      data-testid="ai-sidebar"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--gray-text)]">
            AI Co-pilot
          </p>
          <h2 className="mt-2 font-display text-[1.85rem] font-semibold leading-[1.1] text-[var(--navy-dark)]">
            Board Assistant
          </h2>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[var(--stroke)] px-3 py-1 text-[0.74rem] font-semibold uppercase tracking-[0.09em] text-[var(--gray-text)] transition hover:border-[var(--primary-blue)] hover:text-[var(--primary-blue)]"
            aria-label="Close AI assistant"
          >
            Close
          </button>
        ) : null}
      </div>

      <div
        className="gradient-soft mt-4 h-[340px] overflow-y-auto rounded-2xl border border-[var(--stroke)] p-4"
        data-testid="ai-messages"
      >
        {conversation}
      </div>

      {isSending ? (
        <p className="mt-3 text-sm font-medium text-[var(--primary-blue)]">AI is thinking...</p>
      ) : null}

      {error ? (
        <p className="gradient-input mt-3 rounded-xl border border-[var(--stroke)] px-3 py-2 text-sm font-medium text-[var(--secondary-purple)]">
          {error}
        </p>
      ) : null}

      <form className="mt-4 space-y-3" onSubmit={(event) => void handleSubmit(event)}>
        <label
          htmlFor="ai-message-input"
          className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]"
        >
          Ask AI
        </label>
        <textarea
          id="ai-message-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Example: Rename In Progress to Doing and add a QA checklist card."
          rows={4}
          className="gradient-input w-full resize-none rounded-2xl border border-[var(--stroke)] px-3 py-2 text-[0.96rem] leading-7 text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
        />
        <button
          type="submit"
          disabled={sendDisabled}
          className="gradient-primary w-full rounded-full px-4 py-2 text-[0.95rem] font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-55"
        >
          {isSending ? "Sending..." : "Send to AI"}
        </button>
      </form>
    </aside>
  );
};
