import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthKanbanApp } from "@/components/AuthKanbanApp";
import { initialData } from "@/lib/kanban";
import { defaultThemePreferences } from "@/lib/theme";

const jsonResponse = (payload: object, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const emptyResponse = (status = 204) => new Response(null, { status });
const kanbanResponse = (version = 1) =>
  jsonResponse({ board: initialData, version });

describe("AuthKanbanApp", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the sign-in form when not authenticated", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ authenticated: false }));
    vi.stubGlobal("fetch", fetchMock);

    render(<AuthKanbanApp />);

    expect(
      await screen.findByRole("heading", { name: "Sign in to Kanban Studio" })
    ).toBeInTheDocument();
  });

  it("signs in with valid credentials and renders the board", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ authenticated: false }))
      .mockResolvedValueOnce(emptyResponse(204))
      .mockResolvedValueOnce(kanbanResponse())
      .mockResolvedValueOnce(jsonResponse(defaultThemePreferences));
    vi.stubGlobal("fetch", fetchMock);

    render(<AuthKanbanApp />);
    await screen.findByRole("heading", { name: "Sign in to Kanban Studio" });

    await userEvent.type(screen.getByLabelText("Username"), "user");
    await userEvent.type(screen.getByLabelText("Password"), "password");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("button", { name: "Log out" })).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "Kanban Studio" })
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/auth/login",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("shows an error for invalid credentials", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ authenticated: false }))
      .mockResolvedValueOnce(jsonResponse({ detail: "Invalid credentials." }, 401));
    vi.stubGlobal("fetch", fetchMock);

    render(<AuthKanbanApp />);
    await screen.findByRole("heading", { name: "Sign in to Kanban Studio" });

    await userEvent.type(screen.getByLabelText("Username"), "user");
    await userEvent.type(screen.getByLabelText("Password"), "wrong");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Invalid username or password.")).toBeInTheDocument();
  });

  it("loads an existing authenticated session and logs out", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ authenticated: true, username: "user" }))
      .mockResolvedValueOnce(kanbanResponse())
      .mockResolvedValueOnce(jsonResponse(defaultThemePreferences))
      .mockResolvedValueOnce(emptyResponse(204));
    vi.stubGlobal("fetch", fetchMock);

    render(<AuthKanbanApp />);

    expect(await screen.findByText(/Signed in as/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Log out" }));

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Sign in to Kanban Studio" })
      ).toBeInTheDocument();
    });
  });

  it("shows a recovery error when session check fails", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("network"));
    vi.stubGlobal("fetch", fetchMock);

    render(<AuthKanbanApp />);
    expect(
      await screen.findByText("Unable to check session. Please sign in.")
    ).toBeInTheDocument();
  });
});
