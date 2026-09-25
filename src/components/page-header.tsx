"use client";

import {
  CircleNotchIcon,
  CommandIcon,
  type Icon,
  MagnifyingGlassIcon,
} from "@phosphor-icons/react";
import { css, cx } from "@styled-system/css";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { useInstances } from "@/lib/client-data";
import { ConnectionBanner } from "./connection-banner";
import { useLibraryActions } from "./library-provider";

export function TaskStatus() {
  const active = (useInstances().data?.instances ?? []).flatMap((instance) =>
    (instance.commands ?? []).map((command) => ({
      ...command,
      instanceName: instance.name,
    })),
  );
  if (active.length === 0) return null;
  const [first] = active;
  const label = first.message || first.commandName || first.name;
  const details = active
    .map(
      (command) =>
        `${command.instanceName}: ${command.message || command.commandName}`,
    )
    .join("; ");
  return (
    <div
      title={details}
      className={css({
        display: "flex",
        alignItems: "center",
        gap: "8px",
        height: "32px",
        maxWidth: { base: "40px", md: "320px" },
        px: "12px",
        flexShrink: 1,
        minWidth: 0,
        color: "muted",
        fontSize: "12px",
        bg: "control",
        border: "1px solid token(colors.lineStrong)",
        borderRadius: "999px",
      })}
    >
      <CircleNotchIcon
        size={14}
        aria-hidden="true"
        className={css({
          flexShrink: 0,
          color: "accent",
          animation: "spin 1s linear infinite",
        })}
      />
      <span className={css({ srOnly: true })}>{details}</span>
      <span
        aria-hidden="true"
        className={css({
          display: { base: "none", md: "block" },
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        })}
      >
        {first.instanceName} · {label}
        {active.length > 1 ? ` +${active.length - 1}` : ""}
      </span>
    </div>
  );
}

export function SearchTrigger() {
  const { searchLibrary } = useLibraryActions();
  return (
    <button
      type="button"
      onClick={searchLibrary}
      aria-label="Search library"
      className={css({
        display: "flex",
        alignItems: "center",
        gap: "10px",
        height: { base: "40px", lg: "36px" },
        width: { base: "40px", lg: "420px" },
        maxWidth: "100%",
        minWidth: 0,
        px: { base: "0", lg: "12px" },
        justifyContent: { base: "center", lg: "flex-start" },
        flexShrink: 1,
        color: "subtle",
        fontSize: "13px",
        bg: { base: "transparent", lg: "control" },
        border: "1px solid",
        borderColor: { base: "transparent", lg: "lineStrong" },
        borderRadius: "10px",
        transition: "border-color 150ms, color 150ms",
        _hover: { color: "ink", borderColor: { lg: "faint" } },
      })}
    >
      <MagnifyingGlassIcon size={16} aria-hidden="true" />
      <span
        className={css({
          display: { base: "none", lg: "inline" },
          flexGrow: 1,
          textAlign: "left",
        })}
      >
        Search library or add a new title
      </span>
      <kbd
        className={css({
          display: { base: "none", lg: "flex" },
          alignItems: "center",
          gap: "2px",
          fontFamily: "mono",
          fontSize: "11px",
          border: "1px solid token(colors.lineStrong)",
          borderRadius: "5px",
          px: "6px",
          height: "20px",
        })}
      >
        <CommandIcon size={10} aria-hidden="true" />K
      </kbd>
    </button>
  );
}

const toolbarItemStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "7px",
  height: "30px",
  px: "10px",
  flexShrink: 0,
  borderRadius: "8px",
  border: "0",
  bg: "transparent",
  color: "soft",
  fontSize: "13px",
  fontWeight: "500",
  whiteSpace: "nowrap",
  transition: "background 150ms, color 150ms",
  _hover: { bg: "elevated", color: "ink" },
  _disabled: { opacity: 0.45, cursor: "not-allowed", _hover: { bg: "none" } },
  "&[aria-pressed=true], &[aria-current=page], &[data-active]": {
    bg: "elevated",
    color: "ink",
    "& svg": { color: "accent" },
  },
});

const toolbarDangerStyle = css({
  color: "negative",
  _hover: { color: "negative" },
});

type ToolbarItemProps = {
  icon: Icon;
  label: ReactNode;
  danger?: boolean;
  /** Hide the label on narrow screens; the icon keeps an accessible name. */
  compact?: boolean;
  iconClassName?: string;
};

function ToolbarItemContent({
  icon: IconComponent,
  label,
  compact,
  iconClassName,
}: ToolbarItemProps) {
  return (
    <>
      <IconComponent size={16} aria-hidden="true" className={iconClassName} />
      <span
        className={
          compact ? css({ display: { base: "none", md: "inline" } }) : undefined
        }
      >
        {label}
      </span>
    </>
  );
}

export function ToolbarButton({
  icon,
  label,
  danger,
  compact = true,
  iconClassName,
  className,
  ...props
}: ToolbarItemProps & Omit<ComponentProps<"button">, "children">) {
  return (
    <button
      type="button"
      aria-label={
        typeof label === "string" && compact ? label : props["aria-label"]
      }
      className={cx(
        toolbarItemStyle,
        danger && toolbarDangerStyle,
        typeof className === "string" ? className : undefined,
      )}
      {...props}
    >
      <ToolbarItemContent
        icon={icon}
        label={label}
        compact={compact}
        iconClassName={iconClassName}
      />
    </button>
  );
}

export function ToolbarLink({
  icon,
  label,
  danger,
  compact = true,
  className,
  ...props
}: ToolbarItemProps & Omit<ComponentProps<typeof Link>, "children">) {
  return (
    <Link
      aria-label={typeof label === "string" && compact ? label : undefined}
      className={cx(
        toolbarItemStyle,
        danger && toolbarDangerStyle,
        typeof className === "string" ? className : undefined,
      )}
      {...props}
    >
      <ToolbarItemContent icon={icon} label={label} compact={compact} />
    </Link>
  );
}

export { toolbarItemStyle };

export function ToolbarDivider() {
  return (
    <span
      aria-hidden="true"
      className={css({
        width: "1px",
        height: "18px",
        bg: "lineStrong",
        mx: "6px",
        flexShrink: 0,
      })}
    />
  );
}

/**
 * The Arr-style action bar pinned under the header. Page actions sit on the
 * left, view controls on the right.
 */
export function PageToolbar({
  children,
  actions,
  label = "Page actions",
}: {
  children?: ReactNode;
  actions?: ReactNode;
  label?: string;
}) {
  return (
    <>
      <PageActionBar label={label} actions={actions}>
        {children}
      </PageActionBar>
      <ConnectionBanner />
    </>
  );
}

function PageActionBar({
  children,
  actions,
  label,
}: {
  children?: ReactNode;
  actions?: ReactNode;
  label: string;
}) {
  return (
    <div
      role="toolbar"
      aria-label={label}
      className={css({
        position: "sticky",
        // Stick below the 56px header and its 1px bottom border, so the header
        // never covers the bar's top edge.
        top: "calc(57px + env(safe-area-inset-top))",
        zIndex: 20,
        display: "flex",
        alignItems: "center",
        gap: "2px",
        minHeight: "44px",
        mx: { base: "-16px", lg: "-28px" },
        mb: { base: "18px", lg: "24px" },
        px: { base: "8px", lg: "12px" },
        bg: "toolbar",
        borderBottom: "1px solid token(colors.line)",
        overflowX: "auto",
        scrollbarWidth: "none",
      })}
    >
      {children}
      <span className={css({ flexGrow: 1 })} />
      {actions}
    </div>
  );
}

export function PageHeader({
  title,
  actions,
  id,
  children,
}: {
  title: ReactNode;
  actions?: ReactNode;
  id?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={css({
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "12px 16px",
        minHeight: "36px",
        mb: "20px",
      })}
    >
      <h1
        id={id}
        className={css({
          fontSize: "22px",
          letterSpacing: "-.5px",
          fontWeight: "600",
          lineHeight: "1.25",
        })}
      >
        {title}
      </h1>
      {children}
      {actions && (
        <div
          className={css({
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "8px",
            ml: "auto",
          })}
        >
          {actions}
        </div>
      )}
    </div>
  );
}

/** Segmented filter buttons used beside page titles. */
export function SegmentedTabs<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; count?: number; dot?: string }[];
}) {
  return (
    <fieldset
      aria-label={label}
      className={css({
        display: "flex",
        gap: "3px",
        m: 0,
        minWidth: 0,
        p: "3px",
        bg: "raised",
        border: "1px solid token(colors.line)",
        borderRadius: "10px",
        maxWidth: "100%",
        overflowX: "auto",
        scrollbarWidth: "none",
      })}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={css({
              display: "flex",
              alignItems: "center",
              gap: "7px",
              height: "28px",
              px: "11px",
              flexShrink: 0,
              border: 0,
              borderRadius: "7px",
              fontSize: "12px",
              fontWeight: "500",
              whiteSpace: "nowrap",
              bg: "transparent",
              color: "muted",
              _hover: { color: "ink" },
              "&[aria-pressed=true]": { bg: "elevated", color: "ink" },
            })}
          >
            {option.dot && (
              <span
                aria-hidden="true"
                className={css({
                  width: "6px",
                  height: "6px",
                  borderRadius: "999px",
                })}
                style={{ background: option.dot }}
              />
            )}
            {option.label}
            {option.count !== undefined && (
              <span
                className={css({
                  fontFamily: "mono",
                  fontSize: "11px",
                  color: "subtle",
                })}
              >
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </fieldset>
  );
}
