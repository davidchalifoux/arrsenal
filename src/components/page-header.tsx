"use client";

import {
  CircleNotchIcon,
  CommandIcon,
  type Icon,
  MagnifyingGlassIcon,
} from "@phosphor-icons/react";
import { css, cx } from "@styled-system/css";
import type { SystemStyleObject } from "@styled-system/types";
import Link from "next/link";
import {
  type ComponentProps,
  type ReactNode,
  type Ref,
  useCallback,
  useEffect,
  useState,
} from "react";
import { useInstances } from "@/lib/client-data";
import { ConnectionBanner } from "./connection-banner";
import { useLibraryActions } from "./library-provider";
import { PageScrollContext } from "./page-scroll";

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

const toolbarItemRaw = css.raw({
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

const toolbarItemStyle = css(toolbarItemRaw);

const toolbarDangerRaw = css.raw({
  color: "negative",
  _hover: { color: "negative" },
});

// Merge overrides into the base object before Panda emits classes, so they
// win regardless of stylesheet order.
function toolbarItemClass(danger?: boolean, styles?: SystemStyleObject) {
  return danger || styles
    ? css(toolbarItemRaw, danger ? toolbarDangerRaw : undefined, styles)
    : toolbarItemStyle;
}

type ToolbarItemProps = {
  icon: Icon;
  label: ReactNode;
  danger?: boolean;
  /** Hide the label on narrow screens; the icon keeps an accessible name. */
  compact?: boolean;
  iconClassName?: string;
  /** Style overrides; pass `css.raw({...})`. */
  styles?: SystemStyleObject;
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
  styles,
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
        toolbarItemClass(danger, styles),
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
  styles,
  className,
  ...props
}: ToolbarItemProps & Omit<ComponentProps<typeof Link>, "children">) {
  return (
    <Link
      aria-label={typeof label === "string" && compact ? label : undefined}
      className={cx(
        toolbarItemClass(danger, styles),
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
 * A page footer: a slim status bar below the scrolling body. Phones skip it to
 * keep the screen for content.
 */
export const pageFooterStyle = css({
  flexShrink: 0,
  px: { base: "16px", lg: "28px" },
  minHeight: "28px",
  py: "6px",
  display: { base: "none", md: "flex" },
  alignItems: "center",
  flexWrap: "wrap",
  gap: "6px 16px",
  bg: "toolbar",
  borderTop: "1px solid token(colors.line)",
  color: "subtle",
  fontSize: "11px",
});

/**
 * A routed page: an optional action bar, a body that scrolls on its own, and
 * an optional footer. The bar and footer stay put while only the body scrolls.
 */
export function Page({
  toolbar,
  footer,
  scrollRef,
  children,
  className,
  ...props
}: ComponentProps<"section"> & {
  toolbar?: ReactNode;
  footer?: ReactNode;
  scrollRef?: Ref<HTMLDivElement>;
}) {
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const bodyRef = useCallback(
    (node: HTMLDivElement | null) => {
      setScroller(node);
      if (typeof scrollRef === "function") scrollRef(node);
      else if (scrollRef) scrollRef.current = node;
    },
    [scrollRef],
  );
  // Browsers send scrolling keys to the document when nothing has focus, as
  // after navigating. The document no longer scrolls, so scroll the body.
  useEffect(() => {
    if (!scroller) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        document.activeElement !== document.body
      )
        return;
      const page = scroller.clientHeight * 0.875;
      const top =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? scroller.scrollHeight
            : null;
      const delta =
        event.key === "ArrowDown"
          ? 40
          : event.key === "ArrowUp"
            ? -40
            : event.key === "PageDown" || (event.key === " " && !event.shiftKey)
              ? page
              : event.key === "PageUp" || event.key === " "
                ? -page
                : null;
      if (top === null && delta === null) return;
      event.preventDefault();
      // Jumps are instant: a long smooth scroll through a virtualized list
      // can be cut short as rows are measured along the way.
      if (top !== null) scroller.scrollTo({ top });
      else scroller.scrollBy({ top: delta ?? 0, behavior: "smooth" });
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [scroller]);
  return (
    <section
      data-page=""
      className={cx(
        css({
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
        }),
        className,
      )}
      {...props}
    >
      {toolbar}
      {toolbar && (
        <div
          className={css({
            flexShrink: 0,
            px: { base: "16px", lg: "28px" },
            pt: "12px",
            _empty: { display: "none" },
          })}
        >
          <ConnectionBanner />
        </div>
      )}
      <div
        ref={bodyRef}
        data-page-scroll=""
        tabIndex={-1}
        className={css({
          // Contain absolutely positioned content (such as screen-reader-only
          // labels) so it scrolls and clips with the body instead of growing
          // the document.
          position: "relative",
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          outline: "none",
          px: { base: "16px", lg: "28px" },
          pt: { base: "18px", lg: "24px" },
          pb: { base: "24px", lg: "40px" },
        })}
      >
        <PageScrollContext value={scroller}>
          <div className={css({ display: "flow-root", minWidth: 0 })}>
            {children}
          </div>
        </PageScrollContext>
      </div>
      {footer}
    </section>
  );
}

/**
 * The Arr-style action bar above a page's scrolling body. Page actions sit on
 * the left, view controls on the right.
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
    <PageActionBar label={label} actions={actions}>
      {children}
    </PageActionBar>
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
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        gap: "2px",
        minHeight: "44px",
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
