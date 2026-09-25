import { css } from "@styled-system/css";
import Link from "next/link";
import { Page, PageHeader } from "@/components/page-header";

export default function NotFound() {
  return (
    <Page>
      <PageHeader title="Page not found" />
      <p className={css({ color: "muted", mb: "16px" })}>
        This page doesn’t exist, or the title is no longer in your library.
      </p>
      <Link
        href="/"
        className={css({ color: "accent", textDecoration: "underline" })}
      >
        Back to library
      </Link>
    </Page>
  );
}
