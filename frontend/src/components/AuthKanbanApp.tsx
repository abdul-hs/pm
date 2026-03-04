"use client";

import { FormEvent, useEffect, useState } from "react";
import { KanbanBoard } from "@/components/KanbanBoard";

type AuthState = "loading" | "unauthenticated" | "authenticated";

type AuthMeResponse = {
  authenticated: boolean;
  username?: string;
};

const fetchAuthMe = async (): Promise<AuthMeResponse> => {
  const response = await fetch("/api/auth/me", { credentials: "include" });
  if (!response.ok) {
    throw new Error("Failed to check session.");
  }
  return response.json() as Promise<AuthMeResponse>;
};

const loginRequest = async (username: string, password: string) => {
  return fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ username, password }),
  });
};

const logoutRequest = async () => {
  return fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include",
  });
};

export const AuthKanbanApp = () => {
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let isActive = true;
    const load = async () => {
      try {
        const me = await fetchAuthMe();
        if (!isActive) {
          return;
        }
        if (me.authenticated && me.username) {
          setCurrentUser(me.username);
          setAuthState("authenticated");
          return;
        }
        setAuthState("unauthenticated");
      } catch {
        if (!isActive) {
          return;
        }
        setError("Unable to check session. Please sign in.");
        setAuthState("unauthenticated");
      }
    };
    void load();
    return () => {
      isActive = false;
    };
  }, []);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await loginRequest(username.trim(), password);
      if (!response.ok) {
        if (response.status === 401) {
          setError("Invalid username or password.");
          return;
        }
        setError("Sign in failed. Please try again.");
        return;
      }
      setCurrentUser(username.trim());
      setPassword("");
      setAuthState("authenticated");
    } catch {
      setError("Sign in failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      await logoutRequest();
    } finally {
      setIsSubmitting(false);
      setCurrentUser(null);
      setUsername("");
      setPassword("");
      setAuthState("unauthenticated");
    }
  };

  const handleSessionExpired = () => {
    setCurrentUser(null);
    setPassword("");
    setAuthState("unauthenticated");
    setError("Session expired. Please sign in again.");
  };

  if (authState === "loading") {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-xl items-center justify-center px-6">
        <div className="gradient-surface w-full rounded-3xl border border-[var(--stroke)] p-8 text-center shadow-[var(--shadow)]">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
            Kanban Studio
          </p>
          <h1 className="mt-3 font-display text-2xl font-semibold text-[var(--navy-dark)]">
            Checking your session...
          </h1>
        </div>
      </main>
    );
  }

  if (authState === "unauthenticated") {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-xl items-center justify-center px-6 py-10">
        <section className="gradient-surface w-full rounded-3xl border border-[var(--stroke)] p-8 shadow-[var(--shadow)]">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
            Project Management MVP
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold text-[var(--navy-dark)]">
            Sign in to Kanban Studio
          </h1>
          <p className="mt-3 text-sm text-[var(--gray-text)]">
            Use username <strong>user</strong> and password <strong>password</strong>.
          </p>

          <form className="mt-6 space-y-4" onSubmit={handleLogin}>
            <div>
              <label
                htmlFor="username"
                className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]"
              >
                Username
              </label>
              <input
                id="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="gradient-input w-full rounded-xl border border-[var(--stroke)] px-3 py-2 text-sm text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]"
                required
              />
            </div>
            <div>
              <label
                htmlFor="password"
                className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="gradient-input w-full rounded-xl border border-[var(--stroke)] px-3 py-2 text-sm text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]"
                required
              />
            </div>
            {error ? (
              <p className="text-sm font-medium text-[var(--secondary-purple)]">{error}</p>
            ) : null}
            <button
              type="submit"
              disabled={isSubmitting}
              className="gradient-secondary w-full rounded-full px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
            >
              {isSubmitting ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <>
      <div className="relative z-10 mx-auto max-w-[1500px] px-6 pt-6">
        <div className="gradient-soft flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--stroke)] px-4 py-3 shadow-[var(--shadow)] backdrop-blur">
          <p className="text-sm font-medium text-[var(--gray-text)]">
            Signed in as <span className="font-semibold text-[var(--navy-dark)]">{currentUser}</span>
          </p>
          <button
            type="button"
            onClick={handleLogout}
            disabled={isSubmitting}
            className="rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--navy-dark)] transition hover:border-[var(--primary-blue)] hover:text-[var(--primary-blue)] disabled:opacity-60"
          >
            Log out
          </button>
        </div>
      </div>
      <KanbanBoard onAuthExpired={handleSessionExpired} />
    </>
  );
};
