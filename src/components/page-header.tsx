"use client";

import {
  CommandIcon,
  MagnifyingGlassIcon,
  PlusIcon,
} from "@phosphor-icons/react";
import { css } from "@styled-system/css";
import { createContext, type ReactNode, useContext } from "react";
import { Button } from "./ui";
import { useWorkspace } from "./workspace-provider";

export const PageUtilitiesContext = createContext<
  ((actions?: ReactNode) => ReactNode) | null
>(null);

export function WorkspaceUtilities({
  children,
  desktopOnly = false,
}: {
  children?: ReactNode;
  desktopOnly?: boolean;
}) {
  const { add, searchLibrary } = useWorkspace();
  return (
    <>
      <button
        type="button"
        onClick={searchLibrary}
        aria-label="Search library"
        className={css({
          display: desktopOnly ? { base: "none", lg: "flex" } : "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "9px",
          height: { base: "44px", lg: "36px" },
          width: { base: "44px", xl: "208px" },
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
        <span className={css({ display: { base: "none", xl: "inline" } })}>
          Search library
        </span>
        <kbd
          className={css({
            display: { base: "none", xl: "flex" },
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
      {children}
      <div
        className={css({
          display: desktopOnly ? { base: "none", lg: "contents" } : "contents",
        })}
      >
        <Button
          variant="primary"
          onClick={() => add()}
          className={css({ height: { base: "44px", lg: "36px" } })}
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
  const renderUtilities = useContext(PageUtilitiesContext);
  return (
    <div
      className={css({
        display: "flex",
        flexWrap: "wrap",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: "16px",
        mb: "24px",
      })}
    >
      <div className={css({ flex: "1 1 240px", minWidth: 0 })}>{children}</div>
      <div
        className={css({
          display: "flex",
          alignItems: "center",
          gap: "8px",
        })}
      >
        {renderUtilities ? renderUtilities(actions) : actions}
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  id,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  id?: string;
}) {
  return (
    <PageToolbar actions={actions}>
      <h1
        id={id}
        className={css({
          fontSize: { base: "27px", md: "29px" },
          letterSpacing: "-1px",
          fontWeight: "600",
          lineHeight: "1.3",
        })}
      >
        {title}
      </h1>
      {description && (
        <p
          className={css({
            color: "muted",
            fontSize: "12px",
            mt: "7px",
            lineHeight: "1.7",
          })}
        >
          {description}
        </p>
      )}
    </PageToolbar>
  );
}
