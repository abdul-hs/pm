import { render, screen } from "@testing-library/react";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";

describe("KanbanCardPreview", () => {
  it("renders card title and details", () => {
    render(
      <KanbanCardPreview
        card={{ id: "card-1", title: "Preview title", details: "Preview details" }}
      />
    );

    expect(screen.getByText("Preview title")).toBeInTheDocument();
    expect(screen.getByText("Preview details")).toBeInTheDocument();
  });
});
