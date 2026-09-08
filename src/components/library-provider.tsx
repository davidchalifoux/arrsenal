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
import { matchSorter } from "match-sorter";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useContext,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { mediaHref } from "@/lib/client";
import { useInstances, useLibrary, useSyncData } from "@/lib/collections";
import type { MediaItem } from "@/lib/types";
import { useRealtime } from "@/lib/use-realtime";
import { AddMedia } from "./add-media";
import { Poster } from "./media-card";
import { Button, inputStyle, Modal, Notice } from "./ui";

interface LibraryActions {
  add: (media?: MediaItem | null, kind?: "movie" | "series") => void;
  connect: () => void;
  searchLibrary: () => void;
  notify: (message: string, error?: boolean) => void;
  refresh: () => void;
}

const LibraryContext = createContext<LibraryActions | null>(null);

export function useLibraryActions() {
  const value = useContext(LibraryContext);
  if (!value) throw new Error("Library actions require LibraryProvider.");
  return value;
}

export function LibraryProvider({ children }: { children: ReactNode }) {
  useRealtime();
  const sync = useSyncData();
  const router = useRouter();
  const library = useLibrary();
  const instances = useInstances();
  const [addOpen, setAddOpen] = useState(false);
  const [seed, setSeed] = useState<MediaItem | null>(null);
  const [initialTerm, setInitialTerm] = useState("");
  const [initialKind, setInitialKind] = useState<"movie" | "series">("movie");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const [term, setTerm] = useState("");
  const [visibleCount, setVisibleCount] = useState(20);
  const deferredTerm = useDeferredValue(term);
  const [toast, setToast] = useState<{
    message: string;
    error: boolean;
  } | null>(null);
  const items = library.data?.items ?? [];
  const query = deferredTerm.trim();
  const matches = matchSorter(items, query, { keys: ["title"] });

  function openSearch() {
    setAddOpen(false);
    setTerm("");
    setVisibleCount(20);
    setSearchOpen(true);
  }

  function add(
    media: MediaItem | null = null,
    kind: "movie" | "series" = "movie",
  ) {
    setSearchOpen(false);
    setInitialKind(media?.kind ?? kind);
    setInitialTerm("");
    setSeed(media);
    setAddOpen(true);
  }
  function connect() {
    setAddOpen(false);
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
      }}
    >
      {children}
      <AddMedia
        open={addOpen}
        onClose={() => setAddOpen(false)}
        seed={seed}
        initialTerm={initialTerm}
        initialKind={initialKind}
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
        title="Search your library"
        description="Every title, across every instance."
        wide
      >
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
            aria-label="Search library titles"
            aria-describedby="library-search-summary"
            placeholder="Movies, shows, something you love..."
            value={term}
            onChange={(event) => {
              setTerm(event.target.value);
              setVisibleCount(20);
            }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === "ArrowDown") {
                event.preventDefault();
                resultsRef.current?.querySelector("a")?.focus();
              }
              if (
                event.key === "Enter" &&
                matches[0] &&
                term === deferredTerm
              ) {
                setSearchOpen(false);
                router.push(mediaHref(matches[0]));
              }
            }}
            className={cx(inputStyle, css({ pl: "40px", pr: "40px" }))}
          />
          {term && (
            <button
              type="button"
              aria-label="Clear library search"
              onClick={() => {
                setTerm("");
                setVisibleCount(20);
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
        {library.isError && <Notice error>{library.error.message}</Notice>}
        {!!library.data?.errors.length && (
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
          {library.isPending
            ? "Loading your library..."
            : `${matches.length} ${matches.length === 1 ? "title" : "titles"}${query ? " found" : " in your library"}`}
        </output>
        <div
          ref={resultsRef}
          className={css({ maxHeight: "min(400px, 45dvh)", overflowY: "auto" })}
        >
          {matches.slice(0, visibleCount).map((item, index) => (
            <Link
              key={item.id}
              href={mediaHref(item)}
              onClick={() => setSearchOpen(false)}
              onKeyDown={(event) => {
                if (event.key !== "ArrowDown" && event.key !== "ArrowUp")
                  return;
                event.preventDefault();
                const next = index + (event.key === "ArrowDown" ? 1 : -1);
                if (next < 0) searchInput.current?.focus();
                else resultsRef.current?.querySelectorAll("a")[next]?.focus();
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
                  {item.year} · {item.kind === "movie" ? "Movie" : "Show"} ·{" "}
                  {item.targets.length} targets
                </span>
              </span>
              <ArrowRightIcon size={15} className={css({ color: "subtle" })} />
            </Link>
          ))}
        </div>
        {matches.length > visibleCount && (
          <Button
            variant="ghost"
            onClick={() => setVisibleCount((count) => count + 20)}
            className={css({ mt: "10px", width: "100%" })}
          >
            Show more ({matches.length - visibleCount} remaining)
          </Button>
        )}
        {!matches.length && !library.isError && !library.isPending && (
          <div
            className={css({
              textAlign: "center",
              py: "24px",
              color: "muted",
              fontSize: "13px",
            })}
          >
            <p>
              {query
                ? `No library titles match "${deferredTerm.trim()}".`
                : "Your library is empty. Find a movie or show to get started."}
            </p>
          </div>
        )}
        <div
          className={css({
            mt: "18px",
            pt: "16px",
            borderTop: "1px solid token(colors.line)",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
          })}
        >
          <span className={css({ color: "subtle", fontSize: "11px" })}>
            Arrow keys to browse · Enter to open · Esc to close
          </span>
          <Button
            variant="ghost"
            onClick={() => {
              setSearchOpen(false);
              setSeed(null);
              setInitialKind("movie");
              setInitialTerm(term.trim());
              setAddOpen(true);
            }}
          >
            <PlusIcon size={15} />
            Add media
          </Button>
        </div>
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
