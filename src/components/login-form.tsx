"use client";

import { css, cx } from "@styled-system/css";
import Image from "next/image";
import { useId, useState } from "react";
import {
  Button,
  inputStyle,
  labelStyle,
  Notice,
  panelStyle,
  Spinner,
} from "./ui";

export function LoginForm() {
  const id = useId();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function login(form: HTMLFormElement) {
    if (pending) return;
    const data = new FormData(form);
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: data.get("username"),
          password: data.get("password"),
        }),
      });
      if (!response.ok) {
        setError(
          response.status === 429
            ? "Too many sign-in attempts. Wait a few minutes and try again."
            : "Unable to sign in. Check your credentials and try again.",
        );
        setPending(false);
        return;
      }
      window.location.replace("/");
    } catch {
      setError("Unable to sign in. Check your connection and try again.");
      setPending(false);
    }
  }

  return (
    <main
      className={css({
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        p: { base: "20px", sm: "32px" },
      })}
    >
      <section
        aria-labelledby={`${id}-heading`}
        className={cx(
          panelStyle,
          css({
            width: "100%",
            maxWidth: "420px",
            p: { base: "24px", sm: "32px" },
          }),
        )}
      >
        <Image
          src="/logo.svg"
          width={40}
          height={40}
          alt="Arrsenal"
          loading="eager"
          className={css({ mb: "20px" })}
        />
        <h1
          id={`${id}-heading`}
          className={css({ fontSize: "24px", fontWeight: "600", mb: "8px" })}
        >
          Sign in
        </h1>
        <form
          aria-busy={pending}
          className={css({ display: "grid", gap: "18px" })}
          onSubmit={(event) => {
            event.preventDefault();
            void login(event.currentTarget);
          }}
        >
          <label htmlFor={`${id}-username`} className={labelStyle}>
            Username
            <input
              id={`${id}-username`}
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              disabled={pending}
              className={inputStyle}
            />
          </label>
          <label htmlFor={`${id}-password`} className={labelStyle}>
            Password
            <input
              id={`${id}-password`}
              name="password"
              type="password"
              autoComplete="current-password"
              required
              disabled={pending}
              className={inputStyle}
            />
          </label>
          {error && <Notice error>{error}</Notice>}
          <Button type="submit" variant="primary" size="lg" disabled={pending}>
            {pending && <Spinner />}
            {pending ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </section>
    </main>
  );
}
