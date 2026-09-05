import { css } from "@styled-system/css";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className={css({ py: "40px" })}>
      <h1 className={css({ fontSize: "26px", fontWeight: "550", mb: "12px" })}>
        Title not found
      </h1>
      <p className={css({ color: "muted", mb: "20px" })}>
        This title is not in your library, or the link is no longer valid.
      </p>
      <Link
        href="/"
        className={css({ color: "accent", textDecoration: "underline" })}
      >
        Back to library
      </Link>
    </div>
  );
}
