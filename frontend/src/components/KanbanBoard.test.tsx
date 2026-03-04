import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "@/components/KanbanBoard";
import { initialData, type BoardData } from "@/lib/kanban";
import { defaultThemePreferences } from "@/lib/theme";

const getFirstColumn = () => screen.getAllByTestId(/column-/i)[0];

const jsonResponse = (payload: object, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const cloneBoard = (board: BoardData): BoardData =>
  JSON.parse(JSON.stringify(board)) as BoardData;

type AiChatHandler = (args: {
  message: string;
  board: BoardData;
}) => {
  assistantMessage: string;
  board: BoardData;
  actionsApplied?: number;
};

const createKanbanFetchMock = (options?: {
  failNextSave?: boolean;
  aiChatStatus?: number;
  aiChatErrorDetail?: string;
  aiChatHandler?: AiChatHandler;
}) => {
  const state = {
    board: cloneBoard(initialData),
    version: 1,
    failNextSave: options?.failNextSave ?? false,
    theme: { ...defaultThemePreferences },
  };

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    if (url !== "/api/kanban") {
      if (url === "/api/theme") {
        if ((init?.method ?? "GET") === "GET") {
          return jsonResponse(state.theme);
        }
        if (init?.method === "PUT") {
          const body = JSON.parse(String(init.body ?? "{}")) as typeof state.theme;
          state.theme = {
            gradientStart: body.gradientStart,
            gradientMid: body.gradientMid,
            gradientEnd: body.gradientEnd,
          };
          return jsonResponse(state.theme);
        }
      }
      if (url === "/api/ai/chat" && init?.method === "POST") {
        if (options?.aiChatStatus && options.aiChatStatus >= 400) {
          return jsonResponse(
            { detail: options.aiChatErrorDetail ?? "AI request failed." },
            options.aiChatStatus
          );
        }

        const body = JSON.parse(String(init?.body ?? "{}")) as {
          message?: string;
        };
        const aiResult =
          options?.aiChatHandler?.({
            message: body.message ?? "",
            board: cloneBoard(state.board),
          }) ?? {
            assistantMessage: "No changes requested.",
            board: cloneBoard(state.board),
            actionsApplied: 0,
          };
        const nextBoard = cloneBoard(aiResult.board);
        const didChange =
          JSON.stringify(nextBoard) !== JSON.stringify(state.board);
        state.board = nextBoard;
        if (didChange) {
          state.version += 1;
        }
        return jsonResponse({
          assistantMessage: aiResult.assistantMessage,
          board: cloneBoard(state.board),
          version: state.version,
          actionsApplied: aiResult.actionsApplied ?? (didChange ? 1 : 0),
        });
      }
      return new Response(null, { status: 404 });
    }

    const method = init?.method ?? "GET";
    if (method === "GET") {
      return jsonResponse({
        board: cloneBoard(state.board),
        version: state.version,
      });
    }

    if (method === "PUT") {
      if (state.failNextSave) {
        state.failNextSave = false;
        return jsonResponse({ detail: "save failed" }, 500);
      }

      const body = JSON.parse(String(init?.body ?? "{}")) as {
        board: BoardData;
        version: number;
      };
      if (body.version !== state.version) {
        return jsonResponse(
          {
            detail: {
              message: "Board version conflict.",
              currentVersion: state.version,
            },
          },
          409
        );
      }
      state.board = cloneBoard(body.board);
      state.version += 1;
      return jsonResponse({
        board: cloneBoard(state.board),
        version: state.version,
      });
    }

    return new Response(null, { status: 405 });
  });

  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, state };
};

describe("KanbanBoard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads the board from API and renders five columns", async () => {
    createKanbanFetchMock();

    render(<KanbanBoard />);
    expect(await screen.findAllByTestId(/column-/i)).toHaveLength(5);
    expect(screen.getByText("Version 1")).toBeInTheDocument();
    const boardRow = screen.getByTestId("kanban-columns-row");
    expect(boardRow.className).toContain("min-[1600px]:grid-cols-5");
    expect(boardRow.className).toContain(
      "xl:auto-cols-[minmax(var(--column-min-width),1fr)]"
    );
  });

  it("toggles the AI panel without removing board columns", async () => {
    createKanbanFetchMock();
    render(<KanbanBoard />);
    await screen.findAllByTestId(/column-/i);

    await userEvent.click(screen.getByTestId("open-ai-assistant"));
    expect(screen.getAllByLabelText("Close AI assistant")).toHaveLength(2);
    expect(screen.getAllByTestId(/column-/i)).toHaveLength(5);

    await userEvent.click(screen.getAllByLabelText("Close AI assistant")[0]);
    await waitFor(() => {
      expect(screen.getByTestId("open-ai-assistant")).toBeInTheDocument();
    });
  });

  it("adds a card and persists it to the backend", async () => {
    const { state } = createKanbanFetchMock();
    render(<KanbanBoard />);
    await screen.findAllByTestId(/column-/i);
    const column = getFirstColumn();
    const initialCount = state.board.columns[0].cardIds.length;
    const addButton = within(column).getByRole("button", {
      name: /add a card/i,
    });
    await userEvent.click(addButton);

    const titleInput = within(column).getByPlaceholderText(/card title/i);
    await userEvent.type(titleInput, "New card");
    const detailsInput = within(column).getByPlaceholderText(/details/i);
    await userEvent.type(detailsInput, "Notes");

    await userEvent.click(within(column).getByRole("button", { name: /add card/i }));

    expect(within(column).getByText("New card")).toBeInTheDocument();
    await waitFor(() => expect(state.version).toBe(2));
    expect(state.board.columns[0].cardIds).toHaveLength(initialCount + 1);
  });

  it("shows retry when a save fails and persists on retry", async () => {
    const { state } = createKanbanFetchMock({ failNextSave: true });
    render(<KanbanBoard />);
    await screen.findAllByTestId(/column-/i);

    const column = getFirstColumn();
    await userEvent.click(within(column).getByRole("button", { name: /add a card/i }));
    await userEvent.type(within(column).getByPlaceholderText(/card title/i), "Retry me");
    await userEvent.type(within(column).getByPlaceholderText(/details/i), "Save retry");
    await userEvent.click(within(column).getByRole("button", { name: /add card/i }));

    expect(
      await screen.findByText("Could not save board changes. Retry to persist.")
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Retry save" }));
    await waitFor(() => expect(state.version).toBe(2));
    await waitFor(() => {
      expect(
        screen.queryByText("Could not save board changes. Retry to persist.")
      ).not.toBeInTheDocument();
    });

    expect(within(column).getByText("Retry me")).toBeInTheDocument();
  });

  it("sends an AI message and applies the returned board snapshot", async () => {
    const { state, fetchMock } = createKanbanFetchMock({
      aiChatHandler: ({ board }) => {
        const nextBoard = cloneBoard(board);
        nextBoard.columns = nextBoard.columns.map((column) =>
          column.id === "col-progress" ? { ...column, title: "Doing" } : column
        );
        return {
          assistantMessage: "Done. Renamed In Progress to Doing.",
          board: nextBoard,
          actionsApplied: 1,
        };
      },
    });

    render(<KanbanBoard />);
    await screen.findAllByTestId(/column-/i);

    await userEvent.click(screen.getByTestId("open-ai-assistant"));
    await userEvent.type(screen.getByLabelText("Ask AI"), "Rename in progress to doing");
    await userEvent.click(screen.getByRole("button", { name: "Send to AI" }));

    expect(await screen.findByText("Done. Renamed In Progress to Doing.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByDisplayValue("Doing")).toBeInTheDocument());
    await waitFor(() => expect(state.version).toBe(2));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/ai/chat",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("shows backend AI errors without losing board state", async () => {
    createKanbanFetchMock({
      aiChatStatus: 502,
      aiChatErrorDetail: "OpenRouter returned HTTP 429.",
    });

    render(<KanbanBoard />);
    await screen.findAllByTestId(/column-/i);

    await userEvent.click(screen.getByTestId("open-ai-assistant"));
    await userEvent.type(screen.getByLabelText("Ask AI"), "Please update the board");
    await userEvent.click(screen.getByRole("button", { name: "Send to AI" }));

    expect(await screen.findByText("OpenRouter returned HTTP 429.")).toBeInTheDocument();
    expect(screen.getByText("Version 1")).toBeInTheDocument();
  });

  it("saves theme colors and applies them to css variables", async () => {
    const { state } = createKanbanFetchMock();
    render(<KanbanBoard />);
    await screen.findAllByTestId(/column-/i);

    await userEvent.click(screen.getByTestId("open-theme-settings"));
    fireEvent.change(screen.getByTestId("theme-color-start"), {
      target: { value: "#112233" },
    });
    fireEvent.change(screen.getByTestId("theme-color-mid"), {
      target: { value: "#445566" },
    });
    fireEvent.change(screen.getByTestId("theme-color-end"), {
      target: { value: "#778899" },
    });
    await userEvent.click(screen.getByTestId("save-theme-settings"));

    await waitFor(() => {
      expect(state.theme).toEqual({
        gradientStart: "#112233",
        gradientMid: "#445566",
        gradientEnd: "#778899",
      });
    });

    const root = document.documentElement;
    expect(root.style.getPropertyValue("--user-gradient-start")).toBe("#112233");
    expect(root.style.getPropertyValue("--user-gradient-mid")).toBe("#445566");
    expect(root.style.getPropertyValue("--user-gradient-end")).toBe("#778899");
  });
});
