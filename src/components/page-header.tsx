"use client";

import {
  CommandIcon,
  MagnifyingGlassIcon,
  PlusIcon,
} from "@phosphor-icons/react";
import { css } from "@styled-system/css";
import type { ReactNode } from "react";
import { useLibraryActions } from "./library-provider";
import { Button } from "./ui";

export function LibraryUtilities() {
  const { add, searchLibrary } = useLibraryActions();
  return (
    <>
      <button
        type="button"
        onClick={searchLibrary}
        aria-label="Search library"
        className={css({
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "9px",
          height: { base: "44px", lg: "32px" },
          width: { base: "44px", lg: "156px", xl: "190px" },
          px: { base: "10px", xl: "11px" },
          flexShrink: 0,
          color: "subtle",
          fontSize: "11px",
          bg: { base: "transparent", lg: "surface" },
          border: "1px solid",
          borderColor: { base: "transparent", lg: "line" },
          borderRadius: "7px",
          _hover: { color: "ink", borderColor: "subtle" },
        })}
      >
        <MagnifyingGlassIcon size={17} />
        <span className={css({ display: { base: "none", lg: "inline" } })}>
          Search library
        </span>
        <kbd
          className={css({
            display: { base: "none", lg: "flex" },
            alignItems: "center",
            gap: "2px",
            ml: "auto",
            fontSize: "9px",
            border: "1px solid token(colors.line)",
            borderRadius: "3px",
            px: "3px",
            height: "17px",
          })}
        >
          <CommandIcon size={9} />K
        </kbd>
      </button>
      <div
        className={css({
          display: { base: "none", lg: "contents" },
        })}
      >
        <Button
          variant="primary"
          onClick={() => add()}
          className={css({ height: { base: "44px", lg: "32px" } })}
        >
          <PlusIcon size={15} weight="bold" />
          Add media
        </Button>
      </div>
    </>
  );
}

export function PageToolbar({
  children,
  actions,
}: {
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div
      className={css({
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "16px",
        minHeight: "36px",
        mb: "20px",
      })}
    >
      <div className={css({ flex: "1 1 auto", minWidth: 0 })}>{children}</div>
      <div
        className={css({
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "8px",
        })}
      >
        {actions}
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  actions,
  id,
}: {
  title: ReactNode;
  actions?: ReactNode;
  id?: string;
}) {
  return (
    <PageToolbar actions={actions}>
      <h1
        id={id}
        className={css({
          fontSize: "20px",
          letterSpacing: "-.4px",
          fontWeight: "550",
          lineHeight: "1.3",
        })}
      >
        {title}
      </h1>
    </PageToolbar>
  );
}
