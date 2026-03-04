import type { BoardData } from "@/lib/kanban";
import type { ThemePreferences } from "@/lib/theme";

type KanbanResponse = {
  board: BoardData;
  version: number;
};

type AIChatResponse = {
  assistantMessage: string;
  board: BoardData;
  version: number;
  actionsApplied: number;
};

type ThemeResponse = ThemePreferences;

type ErrorDetail = {
  message?: string;
  currentVersion?: number;
};

type ErrorResponse = {
  detail?: string | ErrorDetail;
};

const defaultConflictMessage = "Board version conflict.";

const readJson = async <T>(response: Response): Promise<T> => {
  return response.json() as Promise<T>;
};

const parseErrorDetail = async (response: Response): Promise<ErrorResponse | null> => {
  const contentType = response.headers.get("Content-Type") ?? "";
  if (!contentType.includes("application/json")) {
    return null;
  }
  try {
    return await readJson<ErrorResponse>(response);
  } catch {
    return null;
  }
};

const readErrorMessage = (payload: ErrorResponse | null, fallback: string): string => {
  const detail = payload?.detail;
  if (typeof detail === "string" && detail.trim()) {
    return detail;
  }
  if (detail && typeof detail === "object" && typeof detail.message === "string") {
    return detail.message;
  }
  return fallback;
};

export class UnauthorizedError extends Error {
  constructor(message = "Authentication required.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class KanbanConflictError extends Error {
  currentVersion: number;

  constructor(currentVersion: number, message = defaultConflictMessage) {
    super(message);
    this.name = "KanbanConflictError";
    this.currentVersion = currentVersion;
  }
}

export class AIChatError extends Error {
  constructor(message = "AI request failed.") {
    super(message);
    this.name = "AIChatError";
  }
}

export class ThemePreferencesError extends Error {
  constructor(message = "Failed to load theme preferences.") {
    super(message);
    this.name = "ThemePreferencesError";
  }
}

export const fetchKanbanBoard = async (): Promise<KanbanResponse> => {
  const response = await fetch("/api/kanban", {
    credentials: "include",
  });

  if (response.status === 401) {
    throw new UnauthorizedError();
  }
  if (!response.ok) {
    throw new Error("Failed to load board.");
  }

  return readJson<KanbanResponse>(response);
};

export const saveKanbanBoard = async (
  board: BoardData,
  version: number
): Promise<KanbanResponse> => {
  const response = await fetch("/api/kanban", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ board, version }),
  });

  if (response.status === 401) {
    throw new UnauthorizedError();
  }

  if (response.status === 409) {
    const payload = await parseErrorDetail(response);
    const detail = payload?.detail;
    const currentVersion =
      detail && typeof detail === "object" ? detail.currentVersion : undefined;
    throw new KanbanConflictError(
      typeof currentVersion === "number" ? currentVersion : version
    );
  }

  if (!response.ok) {
    throw new Error("Failed to save board.");
  }

  return readJson<KanbanResponse>(response);
};

export const sendAiChatMessage = async (
  message: string
): Promise<AIChatResponse> => {
  const response = await fetch("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ message }),
  });

  if (response.status === 401) {
    throw new UnauthorizedError();
  }

  if (response.status === 409) {
    const payload = await parseErrorDetail(response);
    const detail = payload?.detail;
    const currentVersion =
      detail && typeof detail === "object" ? detail.currentVersion : undefined;
    const messageText = readErrorMessage(payload, defaultConflictMessage);
    throw new KanbanConflictError(
      typeof currentVersion === "number" ? currentVersion : -1,
      messageText
    );
  }

  if (!response.ok) {
    const payload = await parseErrorDetail(response);
    throw new AIChatError(readErrorMessage(payload, "AI request failed."));
  }

  return readJson<AIChatResponse>(response);
};

export const fetchThemePreferences = async (): Promise<ThemeResponse> => {
  const response = await fetch("/api/theme", {
    credentials: "include",
  });

  if (response.status === 401) {
    throw new UnauthorizedError();
  }

  if (!response.ok) {
    throw new ThemePreferencesError("Failed to load theme preferences.");
  }

  return readJson<ThemeResponse>(response);
};

export const saveThemePreferences = async (
  preferences: ThemePreferences
): Promise<ThemeResponse> => {
  const response = await fetch("/api/theme", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(preferences),
  });

  if (response.status === 401) {
    throw new UnauthorizedError();
  }

  if (!response.ok) {
    const payload = await parseErrorDetail(response);
    throw new ThemePreferencesError(
      readErrorMessage(payload, "Failed to save theme preferences.")
    );
  }

  return readJson<ThemeResponse>(response);
};
