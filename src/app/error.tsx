"use client";

import { css } from "@styled-system/css";
import Link from "next/link";
import { Button, buttonStyle } from "@/components/ui";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className={css({ p: "40px", maxWidth: "640px", mx: "auto" })}>
      <h1 className={css({ fontSize: "26px", fontWeight: "550", mb: "12px" })}>
        Unable to load this page
      </h1>
      <p className={css({ color: "muted", fontSize: "13px", mb: "22px" })}>
        Check your instance connections and configuration, then try again.
      </p>
      <div className={css({ display: "flex", gap: "10px" })}>
        <Button onClick={reset}>Try again</Button>
        <Link href="/settings" className={buttonStyle({ variant: "ghost" })}>
          Connections
        </Link>
      </div>
    </div>
  );
}
