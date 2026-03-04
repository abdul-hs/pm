import { expect, test, type Locator, type Page } from "@playwright/test";

type Card = {
  id: string;
  title: string;
  details: string;
};

type Column = {
  id: string;
  title: string;
  cardIds: string[];
};

type BoardData = {
  columns: Column[];
  cards: Record<string, Card>;
};

type ThemePreferences = {
  gradientStart: string;
  gradientMid: string;
  gradientEnd: string;
};

const createInitialBoard = (): BoardData => ({
  columns: [
    { id: "col-backlog", title: "Backlog", cardIds: ["card-1", "card-2"] },
    { id: "col-discovery", title: "Discovery", cardIds: ["card-3"] },
    {
      id: "col-progress",
      title: "In Progress",
      cardIds: ["card-4", "card-5"],
    },
    { id: "col-review", title: "Review", cardIds: ["card-6"] },
    { id: "col-done", title: "Done", cardIds: ["card-7", "card-8"] },
  ],
  cards: {
    "card-1": {
      id: "card-1",
      title: "Align roadmap themes",
      details: "Draft quarterly themes with impact statements and metrics.",
    },
    "card-2": {
      id: "card-2",
      title: "Gather customer signals",
      details: "Review support tags, sales notes, and churn feedback.",
    },
    "card-3": {
      id: "card-3",
      title: "Prototype analytics view",
      details: "Sketch initial dashboard layout and key drill-downs.",
    },
    "card-4": {
      id: "card-4",
      title: "Refine status language",
      details: "Standardize column labels and tone across the board.",
    },
    "card-5": {
      id: "card-5",
      title: "Design card layout",
      details: "Add hierarchy and spacing for scanning dense lists.",
    },
    "card-6": {
      id: "card-6",
      title: "QA micro-interactions",
      details: "Verify hover, focus, and loading states.",
    },
    "card-7": {
      id: "card-7",
      title: "Ship marketing page",
      details: "Final copy approved and asset pack delivered.",
    },
    "card-8": {
      id: "card-8",
      title: "Close onboarding sprint",
      details: "Document release notes and share internally.",
    },
  },
});

const cloneBoard = (board: BoardData): BoardData => {
  return JSON.parse(JSON.stringify(board)) as BoardData;
};

const setupApiMocks = async (
  page: Page,
  options?: { emptyProgressColumn?: boolean }
) => {
  const board = createInitialBoard();
  if (options?.emptyProgressColumn) {
    board.columns = board.columns.map((column) =>
      column.id === "col-progress" ? { ...column, cardIds: [] } : column
    );
    delete board.cards["card-4"];
    delete board.cards["card-5"];
  }

  const state = {
    authenticated: false,
    board,
    version: 1,
    theme: {
      gradientStart: "#1c8fc5",
      gradientMid: "#209dd7",
      gradientEnd: "#2db6eb",
    } satisfies ThemePreferences,
  };

  await page.route("**/api/auth/me", async (route) => {
    if (state.authenticated) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ authenticated: true, username: "user" }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ authenticated: false }),
    });
  });

  await page.route("**/api/auth/login", async (route) => {
    const body = route.request().postDataJSON() as {
      username?: string;
      password?: string;
    };
    if (body.username === "user" && body.password === "password") {
      state.authenticated = true;
      await route.fulfill({ status: 204, body: "" });
      return;
    }
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Invalid credentials." }),
    });
  });

  await page.route("**/api/auth/logout", async (route) => {
    state.authenticated = false;
    await route.fulfill({ status: 204, body: "" });
  });

  await page.route("**/api/kanban", async (route) => {
    if (!state.authenticated) {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Authentication required." }),
      });
      return;
    }

    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          board: cloneBoard(state.board),
          version: state.version,
        }),
      });
      return;
    }

    if (route.request().method() === "PUT") {
      const payload = route.request().postDataJSON() as {
        board: BoardData;
        version: number;
      };
      if (payload.version !== state.version) {
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            detail: {
              message: "Board version conflict.",
              currentVersion: state.version,
            },
          }),
        });
        return;
      }

      state.board = cloneBoard(payload.board);
      state.version += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          board: cloneBoard(state.board),
          version: state.version,
        }),
      });
      return;
    }

    await route.fulfill({ status: 405, body: "" });
  });

  await page.route("**/api/theme", async (route) => {
    if (!state.authenticated) {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Authentication required." }),
      });
      return;
    }

    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(state.theme),
      });
      return;
    }

    if (route.request().method() === "PUT") {
      const payload = route.request().postDataJSON() as ThemePreferences;
      state.theme = {
        gradientStart: payload.gradientStart,
        gradientMid: payload.gradientMid,
        gradientEnd: payload.gradientEnd,
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(state.theme),
      });
      return;
    }

    await route.fulfill({ status: 405, body: "" });
  });

  await page.route("**/api/ai/chat", async (route) => {
    if (!state.authenticated) {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Authentication required." }),
      });
      return;
    }

    const payload = route.request().postDataJSON() as { message?: string };
    const prompt = payload.message?.trim() ?? "";
    if (!prompt) {
      await route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Message must not be empty." }),
      });
      return;
    }

    const newCardId = `card-ai-${state.version + 1}`;
    state.board.cards[newCardId] = {
      id: newCardId,
      title: "AI: Add release checklist",
      details: "Created by AI in response to chat request.",
    };
    state.board.columns = state.board.columns.map((column) =>
      column.id === "col-review"
        ? { ...column, cardIds: [...column.cardIds, newCardId] }
        : column
    );
    state.version += 1;

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        assistantMessage: "Added a release checklist card in Review.",
        board: cloneBoard(state.board),
        version: state.version,
        actionsApplied: 1,
      }),
    });
  });
};

const signIn = async (page: Page) => {
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
};

const dragCardToTarget = async (
  page: Page,
  cardTestId: string,
  target: Locator
) => {
  const card = page.getByTestId(cardTestId);
  await card.scrollIntoViewIfNeeded();
  await target.scrollIntoViewIfNeeded();

  const cardBox = await card.boundingBox();
  const targetBox = await target.boundingBox();
  if (!cardBox || !targetBox) {
    throw new Error("Unable to resolve drag coordinates.");
  }

  await page.mouse.move(
    cardBox.x + cardBox.width / 2,
    cardBox.y + cardBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    cardBox.x + cardBox.width / 2 + 16,
    cardBox.y + cardBox.height / 2 + 16,
    { steps: 6 }
  );
  await page.mouse.move(
    targetBox.x + targetBox.width / 2,
    targetBox.y + targetBox.height / 2,
    { steps: 18 }
  );
  await page.mouse.up();
};

test("requires sign in before loading the kanban board", async ({ page }) => {
  await setupApiMocks(page);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Sign in to Kanban Studio" })
  ).toBeVisible();
  await signIn(page);
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
});

test("keeps all columns readable when AI is open on wide desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1720, height: 980 });
  await setupApiMocks(page);
  await page.goto("/");
  await signIn(page);

  await page.getByTestId("open-ai-assistant").click();
  const columns = page.locator('[data-testid^="column-"]');
  await expect(columns).toHaveCount(5);

  const boxes = await columns.evaluateAll((nodes) =>
    nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return { left: rect.left, right: rect.right, width: rect.width };
    })
  );

  for (const box of boxes) {
    expect(box.width).toBeGreaterThan(220);
  }
  const rightEdge = Math.max(...boxes.map((box) => box.right));
  expect(rightEdge).toBeLessThanOrEqual(1720);
});

test("adds a card to a column and persists after refresh", async ({ page }) => {
  await setupApiMocks(page);
  await page.goto("/");
  await signIn(page);
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("Playwright card");
  await firstColumn.getByPlaceholder("Details").fill("Added via e2e.");
  await firstColumn.getByRole("button", { name: /add card/i }).click();
  await expect(firstColumn.getByText("Playwright card")).toBeVisible();
  await expect(page.getByText("Version 2")).toBeVisible();

  await page.reload();
  const backlogColumn = page.getByTestId("column-col-backlog");
  await expect(backlogColumn.getByText("Playwright card")).toBeVisible();
});

test("moves a card between columns", async ({ page }) => {
  await setupApiMocks(page);
  await page.goto("/");
  await signIn(page);
  await page.getByTestId("open-ai-assistant").click();
  await expect(page.getByTestId("ai-sidebar")).toBeVisible();

  const targetColumn = page.getByTestId("column-col-review");
  await dragCardToTarget(page, "card-card-1", page.getByTestId("card-card-6"));
  await expect(targetColumn.getByTestId("card-card-1")).toBeVisible();
});

test("moves a card into an empty column", async ({ page }) => {
  await setupApiMocks(page, { emptyProgressColumn: true });
  await page.goto("/");
  await signIn(page);

  const targetColumn = page.getByTestId("column-col-progress");
  await expect(targetColumn.locator('[data-testid^="card-"]')).toHaveCount(0);

  await dragCardToTarget(page, "card-card-6", targetColumn.getByText("Drop a card here"));
  await expect(targetColumn.getByTestId("card-card-6")).toBeVisible();
});

test("logs out back to the sign-in screen", async ({ page }) => {
  await setupApiMocks(page);
  await page.goto("/");
  await signIn(page);
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(
    page.getByRole("heading", { name: "Sign in to Kanban Studio" })
  ).toBeVisible();
});

test("applies AI chat updates and refreshes board state", async ({ page }) => {
  await setupApiMocks(page);
  await page.goto("/");
  await signIn(page);

  await page.getByTestId("open-ai-assistant").click();
  const aiSidebar = page.getByTestId("ai-sidebar");
  await aiSidebar.getByLabel("Ask AI").fill("Add a release checklist card");
  await aiSidebar.getByRole("button", { name: "Send to AI" }).click();

  await expect(aiSidebar.getByText("Added a release checklist card in Review.")).toBeVisible();
  await expect(page.getByText("Version 2")).toBeVisible();
  await expect(
    page.getByTestId("column-col-review").getByText("AI: Add release checklist")
  ).toBeVisible();
});

test("closes AI panel and keeps board usable", async ({ page }) => {
  await setupApiMocks(page);
  await page.goto("/");
  await signIn(page);

  await page.getByTestId("open-ai-assistant").click();
  await page.getByTestId("ai-sidebar").getByLabel("Close AI assistant").click();
  await expect(page.getByTestId("open-ai-assistant")).toBeVisible();

  const firstColumn = page.getByTestId("column-col-backlog");
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("After closing AI");
  await firstColumn.getByPlaceholder("Details").fill("Board still usable.");
  await firstColumn.getByRole("button", { name: /add card/i }).click();
  await expect(firstColumn.getByText("After closing AI")).toBeVisible();
});
