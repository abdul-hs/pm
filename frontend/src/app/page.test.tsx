import { render, screen } from "@testing-library/react";
import Home from "@/app/page";

describe("Home page", () => {
  it("renders sign-in screen when session is not authenticated", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ authenticated: false }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<Home />);
    expect(
      await screen.findByRole("heading", { name: "Sign in to Kanban Studio" })
    ).toBeInTheDocument();

    vi.unstubAllGlobals();
  });
});
