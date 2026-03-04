import { createId, moveCard, type Column } from "@/lib/kanban";

describe("moveCard", () => {
  const baseColumns: Column[] = [
    { id: "col-a", title: "A", cardIds: ["card-1", "card-2"] },
    { id: "col-b", title: "B", cardIds: ["card-3"] },
  ];

  it("reorders cards in the same column", () => {
    const result = moveCard(baseColumns, "card-2", "card-1");
    expect(result[0].cardIds).toEqual(["card-2", "card-1"]);
  });

  it("moves cards to another column", () => {
    const result = moveCard(baseColumns, "card-2", "card-3");
    expect(result[0].cardIds).toEqual(["card-1"]);
    expect(result[1].cardIds).toEqual(["card-2", "card-3"]);
  });

  it("drops cards to the end of a column", () => {
    const result = moveCard(baseColumns, "card-1", "col-b");
    expect(result[0].cardIds).toEqual(["card-2"]);
    expect(result[1].cardIds).toEqual(["card-3", "card-1"]);
  });

  it("moves a card into an empty column", () => {
    const columns: Column[] = [
      { id: "col-a", title: "A", cardIds: ["card-1"] },
      { id: "col-b", title: "B", cardIds: [] },
    ];
    const result = moveCard(columns, "card-1", "col-b");
    expect(result[0].cardIds).toEqual([]);
    expect(result[1].cardIds).toEqual(["card-1"]);
  });

  it("returns unchanged columns when source card cannot be resolved", () => {
    const result = moveCard(baseColumns, "card-missing", "card-1");
    expect(result).toEqual(baseColumns);
  });

  it("returns unchanged columns when target cannot be resolved", () => {
    const result = moveCard(baseColumns, "card-1", "missing-target");
    expect(result).toEqual(baseColumns);
  });

  it("returns unchanged columns when moving onto itself", () => {
    const result = moveCard(baseColumns, "card-1", "card-1");
    expect(result).toEqual(baseColumns);
  });
});

describe("createId", () => {
  it("creates a prefixed non-empty id", () => {
    const result = createId("card");
    expect(result).toMatch(/^card-/);
    expect(result.length).toBeGreaterThan("card-".length);
  });
});
