import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AiSidebar } from "@/components/AiSidebar";

describe("AiSidebar", () => {
  it("shows an empty-state hint before any messages", () => {
    render(
      <AiSidebar messages={[]} isSending={false} error={null} onSendMessage={vi.fn()} />
    );

    expect(
      screen.getByText(/Ask for board updates like renaming a column/i)
    ).toBeInTheDocument();
  });

  it("submits a trimmed message and clears the input", async () => {
    const onSendMessage = vi.fn().mockResolvedValue(undefined);
    render(
      <AiSidebar messages={[]} isSending={false} error={null} onSendMessage={onSendMessage} />
    );

    await userEvent.type(screen.getByLabelText("Ask AI"), "  Add a release card  ");
    await userEvent.click(screen.getByRole("button", { name: "Send to AI" }));

    expect(onSendMessage).toHaveBeenCalledWith("Add a release card");
    expect(screen.getByLabelText("Ask AI")).toHaveValue("");
  });

  it("renders user and assistant messages", () => {
    render(
      <AiSidebar
        messages={[
          { id: "m1", role: "user", content: "Rename In Progress to Doing" },
          { id: "m2", role: "assistant", content: "Done. Column renamed." },
        ]}
        isSending={false}
        error={null}
        onSendMessage={vi.fn()}
      />
    );

    expect(screen.getByText("Rename In Progress to Doing")).toBeInTheDocument();
    expect(screen.getByText("Done. Column renamed.")).toBeInTheDocument();
  });
});
