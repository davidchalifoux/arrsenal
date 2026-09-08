"use client";

import { css, cx } from "@styled-system/css";
import { useEffect, useId, useState } from "react";
import { PageHeader } from "./page-header";
import {
  Button,
  inputStyle,
  labelStyle,
  mutedStyle,
  Notice,
  panelStyle,
  Spinner,
} from "./ui";

type AuthStatus = { enabled: boolean; username?: string };

const securityPanelStyle = cx(
  panelStyle,
  css({ p: "20px", display: "grid", gap: "18px", minWidth: 0 }),
);
const fieldsetStyle = css({
  display: "grid",
  gap: "18px",
  border: 0,
  p: 0,
  m: 0,
  minWidth: 0,
});
const headingStyle = css({ fontSize: "15px", fontWeight: "600" });

async function authRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    cache: "no-store",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  if (response.status === 401) {
    // A mutation can also reject the current password while the session is valid.
    const sessionExpired =
      !init?.method ||
      (await fetch("/api/auth", { cache: "no-store" })).status === 401;
    if (sessionExpired) {
      window.location.replace("/login");
      throw new Error("Your session has expired. Please sign in again.");
    }
  }
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error(
      "Arrsenal returned an unexpected response. Refresh and try again.",
    );
  }
  const body = await response.json();
  if (!response.ok) {
    throw new Error(
      typeof body.error === "string"
        ? body.error
        : "The request failed. Please try again.",
    );
  }
  return body as T;
}

export function SecuritySettings() {
  const id = useId();
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<"save" | "disable" | "logout" | null>(
    null,
  );

  useEffect(() => {
    const controller = new AbortController();
    void authRequest<AuthStatus>("/api/auth", { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) setStatus(value);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Unable to load security settings.",
          );
        }
      });
    return () => controller.abort();
  }, []);

  async function mutate(
    action: "save" | "disable" | "logout",
    form?: HTMLFormElement,
  ) {
    if (pending || !status) return;
    setError("");
    const data = form ? new FormData(form) : null;
    let body: Record<string, FormDataEntryValue | null> = {};
    if (action === "save") {
      const password = String(data?.get("password") ?? "");
      if (password !== data?.get("confirmation")) {
        setError("The new passwords do not match.");
        return;
      }
      if (
        [...password].length < 8 ||
        new TextEncoder().encode(password).length > 1024
      ) {
        setError(
          "Use a password with at least 8 characters and no more than 1,024 UTF-8 bytes.",
        );
        return;
      }
      body = { username: data?.get("username") ?? null, password };
      if (status.enabled)
        body.currentPassword = data?.get("currentPassword") ?? null;
    } else if (action === "disable") {
      body = { currentPassword: data?.get("currentPassword") ?? null };
    }
    setPending(action);
    try {
      await authRequest(
        action === "logout" ? "/api/auth/logout" : "/api/auth",
        {
          method: action === "disable" ? "DELETE" : "POST",
          body: JSON.stringify(body),
        },
      );
      // Full navigation discards protected data held in client-side query caches.
      window.location.replace(
        action === "logout" ? "/login" : "/settings/security",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to update security settings.",
      );
      setPending(null);
    }
  }

  return (
    <section
      aria-labelledby={`${id}-heading`}
      aria-busy={pending !== null}
      className={css({ minWidth: 0 })}
    >
      <PageHeader id={`${id}-heading`} title="Security" />
      <div
        className={css({
          display: "grid",
          gap: "20px",
          maxWidth: "640px",
          minWidth: 0,
        })}
      >
        {error && <Notice error>{error}</Notice>}
        {!status ? (
          error ? (
            <div>
              <Button onClick={() => window.location.reload()}>
                Try again
              </Button>
            </div>
          ) : (
            <output
              className={css({
                display: "flex",
                alignItems: "center",
                gap: "8px",
                color: "muted",
              })}
            >
              <Spinner /> Loading security settings...
            </output>
          )
        ) : (
          <>
            <div className={securityPanelStyle}>
              <h2 className={headingStyle}>
                {status.enabled
                  ? "Authentication enabled"
                  : "Authentication disabled"}
              </h2>
              {status.enabled ? (
                <>
                  <p
                    className={cx(
                      mutedStyle,
                      css({ overflowWrap: "anywhere" }),
                    )}
                  >
                    Signed in as <strong>{status.username}</strong>. This
                    account protects access to the library and its settings.
                  </p>
                  <div>
                    <Button
                      disabled={pending !== null}
                      onClick={() => void mutate("logout")}
                    >
                      {pending === "logout" ? "Signing out..." : "Sign out"}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className={mutedStyle}>
                    An account is optional. Anyone who can reach this server can
                    currently view and manage the library and its settings,
                    including enabling authentication and locking other users
                    out.
                  </p>
                  <Notice>
                    Keep access to the server's configuration file. If you
                    forget your credentials, stop Arrsenal, back up config.json,
                    remove its account property, and restart. This disables
                    authentication until you configure a new account.
                  </Notice>
                </>
              )}
              <p className={mutedStyle}>
                Use HTTPS on untrusted networks. HTTP is supported for a trusted
                local network, but does not encrypt your password or session
                cookie.
              </p>
            </div>
            <form
              className={securityPanelStyle}
              onSubmit={(event) => {
                event.preventDefault();
                void mutate("save", event.currentTarget);
              }}
            >
              <h2 className={headingStyle}>
                {status.enabled
                  ? "Change credentials"
                  : "Enable authentication"}
              </h2>
              {status.enabled && (
                <p className={mutedStyle}>
                  Enter the username and password you want to use. Saving signs
                  out every other session.
                </p>
              )}
              <fieldset disabled={pending !== null} className={fieldsetStyle}>
                <legend className={css({ srOnly: true })}>
                  Account credentials
                </legend>
                <label htmlFor={`${id}-username`} className={labelStyle}>
                  Username
                  <input
                    id={`${id}-username`}
                    name="username"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    defaultValue={status.username ?? ""}
                    required
                    maxLength={64}
                    pattern={"[A-Za-z0-9._\\-]+"}
                    aria-describedby={`${id}-username-hint`}
                    className={inputStyle}
                  />
                </label>
                <p id={`${id}-username-hint`} className={mutedStyle}>
                  1–64 letters, numbers, dots, underscores or hyphens. Usernames
                  are case-sensitive.
                </p>
                {status.enabled && (
                  <label
                    htmlFor={`${id}-current-password`}
                    className={labelStyle}
                  >
                    Current password
                    <input
                      id={`${id}-current-password`}
                      name="currentPassword"
                      type="password"
                      autoComplete="current-password"
                      required
                      className={inputStyle}
                    />
                  </label>
                )}
                <label htmlFor={`${id}-new-password`} className={labelStyle}>
                  {status.enabled ? "New password" : "Password"}
                  <input
                    id={`${id}-new-password`}
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    required
                    aria-describedby={`${id}-password-hint`}
                    className={inputStyle}
                  />
                </label>
                <p id={`${id}-password-hint`} className={mutedStyle}>
                  Use at least 8 characters. Choose a unique password and store
                  it somewhere safe.
                </p>
                <label htmlFor={`${id}-confirmation`} className={labelStyle}>
                  Confirm {status.enabled ? "new password" : "password"}
                  <input
                    id={`${id}-confirmation`}
                    name="confirmation"
                    type="password"
                    autoComplete="new-password"
                    required
                    className={inputStyle}
                  />
                </label>
                <div>
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={pending !== null}
                  >
                    {pending === "save"
                      ? "Saving..."
                      : status.enabled
                        ? "Save credentials"
                        : "Enable authentication"}
                  </Button>
                </div>
              </fieldset>
            </form>
            {status.enabled && (
              <form
                className={securityPanelStyle}
                onSubmit={(event) => {
                  event.preventDefault();
                  void mutate("disable", event.currentTarget);
                }}
              >
                <h2 className={headingStyle}>Disable authentication</h2>
                <Notice>
                  Disabling authentication immediately opens this server to
                  anyone who can reach it. They can view and change your
                  library, connections and settings without signing in.
                </Notice>
                <fieldset disabled={pending !== null} className={fieldsetStyle}>
                  <legend className={css({ srOnly: true })}>
                    Confirm disabling authentication
                  </legend>
                  <input
                    type="hidden"
                    name="username"
                    autoComplete="username"
                    value={status.username ?? ""}
                  />
                  <label
                    htmlFor={`${id}-disable-password`}
                    className={labelStyle}
                  >
                    Current password
                    <input
                      id={`${id}-disable-password`}
                      name="currentPassword"
                      type="password"
                      autoComplete="current-password"
                      required
                      className={inputStyle}
                    />
                  </label>
                  <div>
                    <Button
                      type="submit"
                      variant="danger"
                      disabled={pending !== null}
                    >
                      {pending === "disable"
                        ? "Disabling..."
                        : "Disable authentication"}
                    </Button>
                  </div>
                </fieldset>
              </form>
            )}
          </>
        )}
      </div>
    </section>
  );
}
