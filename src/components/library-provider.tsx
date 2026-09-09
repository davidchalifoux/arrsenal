"use client";

import {
  ArrowRightIcon,
  CheckCircleIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  WarningCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { css, cx } from "@styled-system/css";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import { matchSorter } from "match-sorter";
import { useRouter } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { mediaHref } from "@/lib/client";
import { useInstances, useLibrary, useSyncData } from "@/lib/collections";
import type { MediaItem } from "@/lib/types";
import { useCatalogSearch } from "@/lib/use-catalog-search";
import { type RealtimeConnection, useRealtime } from "@/lib/use-realtime";
import { AddMedia } from "./add-media";
import { Poster } from "./media-card";
import { Button, inputStyle, Modal, Notice } from "./ui";

interface LibraryActions {
  add: (media?: MediaItem | null) => void;
  connect: () => void;
  searchLibrary: () => void;
  notify: (message: string, error?: boolean) => void;
  refresh: () => void;
  realtime: RealtimeConnection;
}

const LibraryContext = createContext<LibraryActions | null>(null);

export function useLibraryActions() {
  const value = useContext(LibraryContext);
  if (!value) throw new Error("Library actions require LibraryProvider.");
  return value;
}

export function LibraryProvider({ children }: { children: ReactNode }) {
  const realtime = useRealtime();
  const sync = useSyncData();
  const router = useRouter();
  const library = useLibrary();
  const instances = useInstances();
  const [addOpen, setAddOpen] = useState(false);
  const [seed, setSeed] = useState<MediaItem | null>(null);
  const [section, setSection] = useState<"library" | "catalog">("library");
  const [returnToSearch, setReturnToSearch] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const [resultsElement, setResultsElement] = useState<HTMLDivElement | null>(
    null,
  );
  const setResultsRef = useCallback((node: HTMLDivElement | null) => {
    resultsRef.current = node;
    setResultsElement(node);
  }, []);
  const [term, setTerm] = useState("");
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const deferredTerm = useDeferredValue(term);
  const [toast, setToast] = useState<{
    message: string;
    error: boolean;
  } | null>(null);
  const items = library.data?.items ?? [];
  const query = deferredTerm.trim();
  const catalog = useCatalogSearch(term, searchOpen && section === "catalog");
  const source = section === "library" ? library : catalog;
  const matches = useMemo(
    () =>
      section === "library"
        ? matchSorter(items, query, { keys: ["title"] })
        : (catalog.data?.items ?? []),
    [section, items, query, catalog.data?.items],
  );
  const waiting = section === "catalog" && term.trim().length < 2;
  const loading =
    !waiting &&
    (source.isPending || (section === "catalog" && catalog.isDebouncing));
  const virtualizer = useVirtualizer<HTMLDivElement, HTMLElement>({
    count: matches.length,
    getScrollElement: () => resultsElement,
    estimateSize: () => 72,
    getItemKey: useCallback((index: number) => matches[index].id, [matches]),
    overscan: 5,
    paddingEnd: matches.length ? 16 : 0,
    enabled: searchOpen,
    rangeExtractor: useCallback(
      (range) => {
        const indexes = defaultRangeExtractor(range);
        if (
          focusedIndex >= 0 &&
          focusedIndex < matches.length &&
          !indexes.includes(focusedIndex)
        ) {
          indexes.push(focusedIndex);
          indexes.sort((a, b) => a - b);
        }
        return indexes;
      },
      [focusedIndex, matches.length],
    ),
  });

  function focusResult(index: number) {
    if (index < 0) {
      setFocusedIndex(-1);
      searchInput.current?.focus();
    } else if (index < matches.length) {
      setFocusedIndex(index);
      virtualizer.scrollToIndex(index, { align: "auto" });
      resultsRef.current
        ?.querySelector<HTMLElement>(`[data-index="${index}"]`)
        ?.focus({ preventScroll: true });
    }
  }

  useLayoutEffect(() => {
    if (focusedIndex >= 0) {
      resultsRef.current
        ?.querySelector<HTMLElement>(`[data-index="${focusedIndex}"]`)
        ?.focus({ preventScroll: true });
    }
  }, [focusedIndex]);

  function selectItem(item: MediaItem) {
    setSearchOpen(false);
    if (section === "library") router.push(mediaHref(item));
    else {
      setSeed(item);
      setReturnToSearch(true);
      setAddOpen(true);
    }
  }
  function changeSection(next: "library" | "catalog") {
    setSection(next);
    setFocusedIndex(-1);
    searchInput.current?.focus();
    virtualizer.scrollToOffset(0);
  }

  function openSearch() {
    setAddOpen(false);
    setSection("library");
    setTerm("");
    setFocusedIndex(-1);
    setSearchOpen(true);
  }

  function add(media: MediaItem | null = null) {
    setReturnToSearch(false);
    setSeed(media);
    setTerm("");
    setFocusedIndex(-1);
    setSection("catalog");
    setSearchOpen(!media);
    setAddOpen(!!media);
  }
  function connect() {
    setAddOpen(false);
    setSearchOpen(false);
    router.push("/settings/connections?connect=1");
  }
  function notify(message: string, error = false) {
    setToast({ message, error });
  }
  function refresh() {
    void sync("library");
  }
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      if (searchOpen) setSearchOpen(false);
      else openSearch();
    }
  });
  useEffect(() => {
    const handler = (event: KeyboardEvent) => onKeyDown(event);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 6500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  return (
    <LibraryContext
      value={{
        add,
        connect,
        searchLibrary: openSearch,
        notify,
        refresh,
        realtime,
      }}
    >
      {children}
      <AddMedia
        open={addOpen}
        onClose={() => setAddOpen(false)}
        seed={seed}
        onBack={
          returnToSearch
            ? () => {
                setAddOpen(false);
                setSearchOpen(true);
              }
            : undefined
        }
        instances={instances.data?.instances ?? []}
        library={items}
        onAdded={() => {
          void sync("media");
        }}
        notify={notify}
        onConnect={connect}
      />
      <Modal
        initialFocus={searchInput}
        open={searchOpen}
        onOpenChange={setSearchOpen}
        title="Search"
        command
      >
        <fieldset
          aria-label="Search section"
          className={css({ display: "flex", gap: "6px", mb: "12px" })}
        >
          <Button
            variant="ghost"
            aria-pressed={section === "library"}
            onClick={() => changeSection("library")}
            className={css({ _pressed: { bg: "elevated", color: "ink" } })}
          >
            <MagnifyingGlassIcon size={14} /> Library
          </Button>
          <Button
            variant="ghost"
            aria-pressed={section === "catalog"}
            onClick={() => changeSection("catalog")}
            className={css({ _pressed: { bg: "elevated", color: "ink" } })}
          >
            <PlusIcon size={14} /> Add media
          </Button>
        </fieldset>
        <div className={css({ position: "relative", mb: "20px" })}>
          <MagnifyingGlassIcon
            size={19}
            className={css({
              position: "absolute",
              top: "12px",
              left: "13px",
              color: "subtle",
            })}
          />
          <input
            ref={searchInput}
            autoComplete="off"
            aria-label={
              section === "library"
                ? "Search library titles"
                : "Search movies and shows"
            }
            aria-describedby="library-search-summary"
            placeholder={
              section === "library"
                ? "Search your movies and shows..."
                : "Find movies and shows to add..."
            }
            value={term}
            onChange={(event) => {
              setTerm(event.target.value);
              setFocusedIndex(-1);
              virtualizer.scrollToOffset(0);
            }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === "ArrowDown") {
                event.preventDefault();
                focusResult(0);
              }
              if (
                event.key === "Enter" &&
                matches[0] &&
                term === deferredTerm
              ) {
                selectItem(matches[0]);
              }
            }}
            className={cx(inputStyle, css({ pl: "40px", pr: "40px" }))}
          />
          {term && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setTerm("");
                setFocusedIndex(-1);
                virtualizer.scrollToOffset(0);
                searchInput.current?.focus();
              }}
              className={css({
                position: "absolute",
                right: "8px",
                top: "7px",
                p: "6px",
                color: "muted",
                borderRadius: "4px",
                _hover: { bg: "elevated" },
              })}
            >
              <XIcon size={18} />
            </button>
          )}
        </div>
        {source.isError && <Notice error>{source.error?.message}</Notice>}
        {!!source.data?.errors.length && (
          <Notice error>
            Some instances could not be reached. Results may be incomplete.
          </Notice>
        )}
        <output
          id="library-search-summary"
          className={css({
            display: "block",
            color: "subtle",
            fontSize: "12px",
            mb: "10px",
          })}
        >
          {waiting
            ? "Search the catalog · Movies & shows"
            : loading
              ? "Searching..."
              : `${matches.length} ${matches.length === 1 ? "title" : "titles"}${query ? " found" : " in your library"}`}
        </output>
        <div
          ref={setResultsRef}
          className={css({
            maxHeight: "min(400px, 38dvh)",
            mx: "-16px",
            px: "16px",
            overflowY: "auto",
            overscrollBehavior: "contain",
          })}
        >
          <div
            style={{
              height: virtualizer.getTotalSize(),
              position: "relative",
              width: "100%",
            }}
          >
            {virtualizer.getVirtualItems().map((row) => {
              const index = row.index;
              const item = matches[index];
              const Result = section === "library" ? "a" : "button";
              return (
                <Result
                  data-search-result
                  data-index={index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    transform: `translateY(${row.start}px)`,
                  }}
                  onFocus={() => setFocusedIndex(index)}
                  key={item.id}
                  href={section === "library" ? mediaHref(item) : undefined}
                  type={section === "catalog" ? "button" : undefined}
                  onClick={(event) => {
                    event.preventDefault();
                    selectItem(item);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "ArrowDown" && event.key !== "ArrowUp")
                      return;
                    event.preventDefault();
                    focusResult(index + (event.key === "ArrowDown" ? 1 : -1));
                  }}
                  className={css({
                    display: "flex",
                    alignItems: "center",
                    gap: "14px",
                    width: "100%",
                    textAlign: "left",
                    padding: "10px",
                    borderRadius: "7px",
                    _hover: { bg: "elevated" },
                    _focusVisible: {
                      bg: "elevated",
                      outline: "2px solid token(colors.accent)",
                      outlineOffset: "-2px",
                    },
                  })}
                >
                  <span
                    className={css({
                      width: "35px",
                      height: "52px",
                      position: "relative",
                      overflow: "hidden",
                      borderRadius: "4px",
                      flexShrink: 0,
                    })}
                  >
                    <Poster item={item} sizes="35px" />
                  </span>
                  <span
                    className={css({
                      flex: 1,
                      fontSize: "13px",
                      fontWeight: "500",
                    })}
                  >
                    {item.title}
                    <span
                      className={css({
                        display: "block",
                        fontSize: "11px",
                        color: "subtle",
                        fontWeight: "400",
                        mt: "4px",
                      })}
                    >
                      {item.year} · {item.kind === "movie" ? "Movie" : "Show"}
                      {section === "library"
                        ? ` · ${item.targets.length} targets`
                        : items.some((entry) => entry.id === item.id)
                          ? " · In library"
                          : ""}
                    </span>
                  </span>
                  {section === "library" ? (
                    <ArrowRightIcon
                      size={15}
                      className={css({ color: "subtle" })}
                    />
                  ) : (
                    <PlusIcon size={15} className={css({ color: "subtle" })} />
                  )}
                </Result>
              );
            })}
          </div>
        </div>
        {!matches.length && !source.isError && !loading && (
          <div
            className={css({
              textAlign: "center",
              py: "24px",
              color: "muted",
              fontSize: "13px",
            })}
          >
            <p>
              {section === "catalog"
                ? waiting
                  ? "Enter at least 2 characters to find a movie or show to add."
                  : `No catalog titles match "${term.trim()}".`
                : query
                  ? `No library titles match "${deferredTerm.trim()}".`
                  : "Your library is empty. Find a movie or show to get started."}
            </p>
          </div>
        )}
      </Modal>
      {toast && (
        <div
          role={toast.error ? "alert" : "status"}
          className={css({
            position: "fixed",
            bottom: {
              base: "calc(90px + env(safe-area-inset-bottom))",
              lg: "24px",
            },
            right: { base: "16px", md: "28px" },
            left: { base: "16px", md: "auto" },
            maxWidth: "460px",
            display: "flex",
            alignItems: "flex-start",
            gap: "10px",
            p: "15px",
            bg: toast.error ? "#382722" : "#26321e",
            color: toast.error ? "#f1b3a6" : "#d4e9c0",
            border: "1px solid",
            borderColor: toast.error ? "#7d493c" : "#51663c",
            borderRadius: "9px",
            boxShadow: "0 10px 35px #0006",
            zIndex: 110,
            fontSize: "12px",
            lineHeight: "1.7",
            animation: "enter 180ms ease-out",
          })}
        >
          {toast.error ? (
            <WarningCircleIcon
              size={18}
              className={css({ flexShrink: 0, mt: "2px" })}
            />
          ) : (
            <CheckCircleIcon
              size={18}
              className={css({ flexShrink: 0, mt: "2px" })}
            />
          )}
          <span>{toast.message}</span>
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={() => setToast(null)}
            className={css({ flexShrink: 0, color: "inherit", p: "2px" })}
          >
            <XIcon size={15} />
          </button>
        </div>
      )}
    </LibraryContext>
  );
}
