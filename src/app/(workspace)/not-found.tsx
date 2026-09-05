import { css } from "@styled-system/css";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";

export default function NotFound() {
  return (
    <div>
      <PageHeader
        title="Title not found"
        description="This title is not in your library, or the link is no longer valid."
      />
      <Link
        href="/"
        className={css({ color: "accent", textDecoration: "underline" })}
      >
        Back to library
      </Link>
    </div>
  );
}
