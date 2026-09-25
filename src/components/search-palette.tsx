"use client";

import {
  ArrowRightIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  XIcon,
} from "@phosphor-icons/react";
import { css, cx } from "@styled-system/css";
import { useVirtualizer } from "@tanstack/react-virtual";
import { matchSorter } from "match-sorter";
import {
  type ReactNode,
  useCallback,
  useDeferredValue,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { mediaHref } from "@/lib/client";
import type { CatalogItem, MediaItem } from "@/lib/types";
import { useCatalogSearch } from "@/lib/use-catalog-search";
import { Poster } from "./media-card";
import { Modal, Spinner } from "./ui";

export type SearchMode = "search" | "add";

type Row =
  | { type: "heading"; key: string; label: string; detail?: string }
  | { type: "library"; key: string; item: MediaItem }
  | { type: "catalog"; key: string; item: CatalogItem; inLibrary: boolean }
  | { type: "more"; key: string; count: number }
  | { type: "skeleton"; key: string }
  | { type: "message"; key: string; text: string; tone?: "error" };

const selectable = (row: Row | undefined) =>
  row?.type === "library" || row?.type === "catalog" || row?.type === "more";

// Library matches shown before the catalog; the rest are one keypress away.
const libraryPreview = 3;
const recentCount = 8;

const rowHeights: Record<Row["type"], number> = {
  heading: 34,
  library: 60,
  catalog: 60,
  more: 40,
  skeleton: 60,
  message: 44,
};

function Highlight({ text, query }: { text: string; query: string }) {
  const index = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (index < 0) return text;
  return (
    <>
      {text.slice(0, index)}
      <mark
        className={css({ bg: "transparent", color: "accent", fontWeight: 600 })}
      >
        {text.slice(index, index + query.length)}
      </mark>
      {text.slice(index + query.length)}
    </>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd
      className={css({
        display: "inline-grid",
        placeItems: "center",
        minWidth: "20px",
        height: "20px",
        px: "5px",
        borderRadius: "5px",
        border: "1px solid token(colors.lineStrong)",
        bg: "raised",
        fontFamily: "inherit",
        fontSize: "11px",
        color: "muted",
      })}
    >
      {children}
    </kbd>
  );
}

export function SearchPalette({
  open,
  onOpenChange,
  mode,
  term,
  onTermChange,
  library,
  libraryError,
  onOpenTitle,
  onAddTitle,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: SearchMode;
  term: string;
  onTermChange: (term: string) => void;
  library: MediaItem[];
  libraryError?: string;
  onOpenTitle: (item: MediaItem) => void;
  onAddTitle: (item: CatalogItem) => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [active, setActive] = useState(0);
  const deferredTerm = useDeferredValue(term);
  const query = deferredTerm.trim();
  const catalog = useCatalogSearch(term, open && term.trim().length >= 2);
  const libraryIds = useMemo(
    () => new Set(library.map((item) => item.id)),
    [library],
  );

  const { rows, libraryTotal } = useMemo(() => {
    const rows: Row[] = [];
    let libraryTotal = 0;
    if (mode === "search") {
      const matches = query
        ? matchSorter(library, query, { keys: ["title"] })
        : [...library]
            .sort((a, b) => (b.added ?? "").localeCompare(a.added ?? ""))
            .slice(0, recentCount);
      libraryTotal = matches.length;
      if (matches.length || !query) {
        rows.push({
          type: "heading",
          key: "library",
          label: query ? "In your library" : "Recently added",
          detail: query ? String(matches.length) : undefined,
        });
      }
      const shown =
        query && !expanded ? matches.slice(0, libraryPreview) : matches;
      for (const item of shown)
        rows.push({ type: "library", key: `library:${item.id}`, item });
      if (shown.length < matches.length)
        rows.push({ type: "more", key: "more", count: matches.length });
      if (!query && !library.length)
        rows.push({
          type: "message",
          key: "empty-library",
          text: "Your library is empty. Type a title to find something to add.",
        });
    }
    if (query.length >= 2 || mode === "add") {
      rows.push({
        type: "heading",
        key: "catalog",
        label: mode === "add" ? "Movies and shows" : "Add to your library",
      });
      if (query.length < 2) {
        rows.push({
          type: "message",
          key: "catalog-hint",
          text: "Type at least 2 characters to search TMDB and TVDB.",
        });
      } else if (catalog.isError) {
        rows.push({
          type: "message",
          key: "catalog-error",
          text: catalog.error?.message ?? "Could not search the catalog.",
          tone: "error",
        });
      } else if (!catalog.data) {
        for (let index = 0; index < 3; index++)
          rows.push({ type: "skeleton", key: `skeleton:${index}` });
      } else {
        const results = catalog.data.items.filter(
          (item) => mode === "add" || !libraryIds.has(item.id),
        );
        // Previous results that don't fit the new query: still loading.
        if (!results.length && catalog.isStale)
          for (let index = 0; index < 3; index++)
            rows.push({ type: "skeleton", key: `skeleton:${index}` });
        for (const item of results)
          rows.push({
            type: "catalog",
            key: `catalog:${item.id}`,
            item,
            inLibrary:
              libraryIds.has(item.id) || item.existingInstanceIds.length > 0,
          });
        if (!results.length && !catalog.isStale)
          rows.push({
            type: "message",
            key: "catalog-empty",
            text:
              mode === "add"
                ? `No movies or shows match “${query}”.`
                : `No new titles match “${query}”.`,
          });
      }
      if (catalog.data?.errors.length)
        rows.push({
          type: "message",
          key: "catalog-partial",
          text: "Some instances could not be reached. Results may be incomplete.",
          tone: "error",
        });
    }
    return { rows, libraryTotal };
  }, [
    mode,
    query,
    library,
    libraryIds,
    expanded,
    catalog.data,
    catalog.isError,
    catalog.error,
    catalog.isStale,
  ]);

  const firstSelectable = rows.findIndex(selectable);
  const activeIndex = selectable(rows[active]) ? active : firstSelectable;
  // Catalog rows from the previous query stay visible while the next loads,
  // but only fresh results can be chosen.
  const catalogStale = catalog.isStale;
  const pending = term.trim() !== query;

  const virtualizer = useVirtualizer<HTMLDivElement, HTMLElement>({
    count: rows.length,
    getScrollElement: () => scroller,
    estimateSize: (index) => rowHeights[rows[index].type],
    getItemKey: useCallback((index: number) => rows[index].key, [rows]),
    overscan: 6,
    paddingStart: 6,
    paddingEnd: 6,
    enabled: open,
    useFlushSync: false,
  });

  useLayoutEffect(() => {
    if (activeIndex >= 0) virtualizer.scrollToIndex(activeIndex);
  }, [activeIndex, virtualizer]);

  function reset(next: string) {
    onTermChange(next);
    setExpanded(false);
    setActive(0);
    virtualizer.scrollToOffset(0);
  }

  function move(step: 1 | -1) {
    if (activeIndex < 0) return;
    let index = activeIndex;
    do index += step;
    while (index >= 0 && index < rows.length && !selectable(rows[index]));
    if (index >= 0 && index < rows.length) setActive(index);
  }

  function choose(row: Row | undefined) {
    if (!row || pending) return;
    if (row.type === "library") onOpenTitle(row.item);
    if (row.type === "catalog" && !catalogStale) onAddTitle(row.item);
    if (row.type === "more") setExpanded(true);
  }

  const optionId = (index: number) => `${id}-option-${index}`;
  const catalogCount = rows.filter((row) => row.type === "catalog").length;
  const catalogSearching =
    catalog.isDebouncing || (catalog.isFetching && !catalog.data);
  const catalogSummary =
    query.length < 2
      ? ""
      : catalogSearching
        ? "searching for new titles"
        : `${catalogCount} to add`;
  const summary =
    mode === "add"
      ? catalogSummary || "Type at least 2 characters to search"
      : !query
        ? `${library.length} ${library.length === 1 ? "title" : "titles"} in your library`
        : [`${libraryTotal} in your library`, catalogSummary]
            .filter(Boolean)
            .join(" · ");

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={mode === "add" ? "Add a movie or show" : "Search"}
      initialFocus={input}
      command
    >
      <div
        className={css({
          display: "flex",
          alignItems: "center",
          gap: "10px",
          px: "16px",
          borderBottom: "1px solid token(colors.line)",
          flexShrink: 0,
        })}
      >
        {catalog.isFetching || catalog.isDebouncing ? (
          <Spinner size={18} />
        ) : mode === "add" ? (
          <PlusIcon size={18} className={css({ color: "subtle" })} />
        ) : (
          <MagnifyingGlassIcon size={18} className={css({ color: "subtle" })} />
        )}
        <input
          ref={input}
          role="combobox"
          aria-expanded="true"
          aria-controls={`${id}-results`}
          aria-activedescendant={
            activeIndex >= 0 ? optionId(activeIndex) : undefined
          }
          aria-autocomplete="list"
          aria-describedby={`${id}-summary`}
          aria-label={
            mode === "add" ? "Search movies and shows" : "Search library titles"
          }
          autoComplete="off"
          spellCheck={false}
          placeholder={
            mode === "add"
              ? "Find a movie or show to add…"
              : "Search your library or find something new…"
          }
          value={term}
          onChange={(event) => reset(event.target.value)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              move(event.key === "ArrowDown" ? 1 : -1);
            } else if (event.key === "Enter") {
              event.preventDefault();
              choose(rows[activeIndex]);
            }
          }}
          className={css({
            flex: 1,
            minWidth: 0,
            height: "56px",
            bg: "transparent",
            border: 0,
            outline: "none",
            color: "ink",
            fontSize: "16px",
            _placeholder: { color: "subtle" },
          })}
        />
        {term && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              reset("");
              input.current?.focus();
            }}
            className={css({
              display: "grid",
              placeItems: "center",
              width: "28px",
              height: "28px",
              borderRadius: "6px",
              color: "muted",
              _hover: { bg: "elevated", color: "ink" },
            })}
          >
            <XIcon size={15} />
          </button>
        )}
        <button
          type="button"
          aria-label="Close search"
          onClick={() => onOpenChange(false)}
          className={css({ display: "flex", _hover: { opacity: 0.8 } })}
        >
          <Kbd>esc</Kbd>
        </button>
      </div>
      <output id={`${id}-summary`} className={css({ srOnly: true })}>
        {summary}
      </output>
      {libraryError && mode === "search" && (
        <p
          role="alert"
          className={css({
            px: "16px",
            pt: "10px",
            color: "negative",
            fontSize: "12px",
          })}
        >
          {libraryError}
        </p>
      )}
      <div
        ref={setScroller}
        id={`${id}-results`}
        role="listbox"
        aria-label={mode === "add" ? "Catalog results" : "Search results"}
        className={css({
          flex: "0 1 auto",
          maxHeight: "min(440px, 55dvh)",
          overflowY: "auto",
          overscrollBehavior: "contain",
          px: "8px",
        })}
      >
        <div
          style={{
            height: virtualizer.getTotalSize(),
            position: "relative",
            width: "100%",
          }}
        >
          {virtualizer.getVirtualItems().map((virtual) => {
            const row = rows[virtual.index];
            const index = virtual.index;
            const isActive = index === activeIndex;
            const shared = {
              "data-index": index,
              "data-search-result": "",
              ref: virtualizer.measureElement,
              style: {
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtual.start}px)`,
              } as const,
            };
            if (row.type === "heading")
              return (
                <div
                  key={row.key}
                  {...shared}
                  role="presentation"
                  className={css({
                    display: "flex",
                    alignItems: "flex-end",
                    gap: "6px",
                    height: "34px",
                    px: "10px",
                    pb: "6px",
                    fontSize: "11px",
                    fontWeight: 600,
                    letterSpacing: ".04em",
                    textTransform: "uppercase",
                    color: "subtle",
                  })}
                >
                  {row.label}
                  {row.detail && (
                    <span className={css({ color: "faint" })}>
                      {row.detail}
                    </span>
                  )}
                </div>
              );
            if (row.type === "message")
              return (
                <p
                  key={row.key}
                  {...shared}
                  role="presentation"
                  className={css({
                    px: "10px",
                    py: "12px",
                    fontSize: "13px",
                    color: row.tone === "error" ? "negative" : "muted",
                  })}
                >
                  {row.text}
                </p>
              );
            if (row.type === "skeleton")
              return (
                <div
                  key={row.key}
                  {...shared}
                  role="presentation"
                  aria-hidden="true"
                  className={css({
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    height: "60px",
                    px: "10px",
                  })}
                >
                  <span
                    className={css({
                      width: "32px",
                      height: "48px",
                      borderRadius: "4px",
                      bg: "elevated",
                      animation: "pulse 1.4s ease-in-out infinite",
                    })}
                  />
                  <span className={css({ display: "grid", gap: "7px" })}>
                    <span
                      className={css({
                        width: "180px",
                        height: "10px",
                        borderRadius: "4px",
                        bg: "elevated",
                        animation: "pulse 1.4s ease-in-out infinite",
                      })}
                    />
                    <span
                      className={css({
                        width: "96px",
                        height: "8px",
                        borderRadius: "4px",
                        bg: "elevated",
                        animation: "pulse 1.4s ease-in-out infinite",
                      })}
                    />
                  </span>
                </div>
              );
            const optionStyle = css({
              display: "flex",
              alignItems: "center",
              gap: "12px",
              minHeight: "40px",
              px: "10px",
              borderRadius: "8px",
              textAlign: "left",
              cursor: "pointer",
              "&[aria-selected=true]": { bg: "elevated" },
            });
            const optionProps = {
              ...shared,
              id: optionId(index),
              "aria-selected": isActive,
              onMouseMove: () => {
                if (!isActive) setActive(index);
              },
              // Keep focus (and typing) in the input.
              onMouseDown: (event: React.MouseEvent) => event.preventDefault(),
            };
            if (row.type === "more")
              return (
                <div
                  key={row.key}
                  {...optionProps}
                  role="option"
                  tabIndex={-1}
                  onClick={() => choose(row)}
                  onKeyDown={(event) => event.key === "Enter" && choose(row)}
                  className={cx(
                    optionStyle,
                    css({ color: "muted", fontSize: "12px" }),
                  )}
                >
                  <span
                    className={css({
                      width: "32px",
                      display: "grid",
                      placeItems: "center",
                    })}
                  >
                    <ArrowRightIcon size={14} />
                  </span>
                  Show all {row.count} library matches
                </div>
              );
            const item = row.item;
            const meta = [
              item.year || "TBA",
              item.kind === "movie" ? "Movie" : "Show",
              row.type === "library"
                ? row.item.targets
                    .map((target) => target.instanceName)
                    .join(", ")
                : null,
            ]
              .filter(Boolean)
              .join(" · ");
            const content = (
              <>
                <span
                  className={css({
                    position: "relative",
                    width: "32px",
                    height: "48px",
                    flexShrink: 0,
                    overflow: "hidden",
                    borderRadius: "4px",
                    bg: "elevated",
                  })}
                >
                  <Poster item={item} sizes="32px" />
                </span>
                <span className={css({ flex: 1, minWidth: 0 })}>
                  <span
                    className={css({
                      display: "block",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      fontSize: "13px",
                      fontWeight: 500,
                    })}
                  >
                    <Highlight text={item.title} query={query} />
                  </span>
                  <span
                    className={css({
                      display: "block",
                      mt: "3px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      fontSize: "11px",
                      color: "subtle",
                    })}
                  >
                    {meta}
                  </span>
                </span>
                {row.type === "catalog" && row.inLibrary && (
                  <span
                    className={css({
                      flexShrink: 0,
                      px: "7px",
                      py: "2px",
                      borderRadius: "999px",
                      bg: "raised",
                      border: "1px solid token(colors.line)",
                      fontSize: "10px",
                      color: "muted",
                    })}
                  >
                    In library
                  </span>
                )}
                <span
                  className={css({
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    flexShrink: 0,
                    fontSize: "11px",
                    color: "muted",
                    visibility: isActive ? "visible" : "hidden",
                  })}
                >
                  {row.type === "library" ? "Open" : "Add"}
                  <Kbd>↵</Kbd>
                </span>
              </>
            );
            return row.type === "library" ? (
              <a
                key={row.key}
                {...optionProps}
                role="option"
                tabIndex={-1}
                href={mediaHref(item)}
                onClick={(event) => {
                  // Let modified clicks open the title in a new tab.
                  if (event.metaKey || event.ctrlKey || event.shiftKey) return;
                  event.preventDefault();
                  choose(row);
                }}
                className={cx(optionStyle, css({ minHeight: "60px" }))}
              >
                {content}
              </a>
            ) : (
              <div
                key={row.key}
                {...optionProps}
                role="option"
                tabIndex={-1}
                onClick={() => choose(row)}
                onKeyDown={(event) => event.key === "Enter" && choose(row)}
                className={cx(
                  optionStyle,
                  css({ minHeight: "60px" }),
                  catalogStale && css({ opacity: 0.55 }),
                )}
              >
                {content}
              </div>
            );
          })}
        </div>
      </div>
      <div
        className={css({
          display: { base: "none", md: "flex" },
          alignItems: "center",
          gap: "14px",
          px: "16px",
          py: "10px",
          borderTop: "1px solid token(colors.line)",
          bg: "raised",
          fontSize: "11px",
          color: "subtle",
          flexShrink: 0,
          "& > span": { display: "flex", alignItems: "center", gap: "6px" },
        })}
      >
        <span>
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> Navigate
        </span>
        <span>
          <Kbd>↵</Kbd>{" "}
          {mode === "add" || rows[activeIndex]?.type === "catalog"
            ? "Add"
            : "Open"}
        </span>
        <span className={css({ ml: "auto" })}>
          {mode === "add"
            ? "Results from TMDB and TVDB via your instances"
            : "Type to search your library and find new titles"}
        </span>
      </div>
    </Modal>
  );
}
