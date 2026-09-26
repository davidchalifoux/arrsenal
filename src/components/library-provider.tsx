"use client";

import {
  CheckCircleIcon,
  WarningCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { css } from "@styled-system/css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useEffectEvent,
  useState,
} from "react";
import { mediaHref } from "@/lib/client";
import { useInstances, useLibrary, useSyncData } from "@/lib/client-data";
import type { CatalogItem, MediaItem } from "@/lib/types";
import { type RealtimeConnection, useRealtime } from "@/lib/use-realtime";
import { AddMedia } from "./add-media";
import { type SearchMode, SearchPalette } from "./search-palette";

export type NotifyAction = { label: string; href: string };

interface LibraryActions {
  add: (media?: MediaItem | null) => void;
  connect: () => void;
  searchLibrary: () => void;
  notify: (message: string, error?: boolean, action?: NotifyAction) => void;
  refresh: () => void;
  realtime: RealtimeConnection;
}

const LibraryContext = createContext<LibraryActions | null>(null);

/** For chrome that can render outside the provider, such as isolated tests. */
export function useOptionalLibraryActions() {
  return useContext(LibraryContext);
}

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
  const [seed, setSeed] = useState<CatalogItem | MediaItem | null>(null);
  const [returnToSearch, setReturnToSearch] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mode, setMode] = useState<SearchMode>("search");
  const [term, setTerm] = useState("");
  const [toast, setToast] = useState<{
    message: string;
    error: boolean;
    action?: NotifyAction;
  } | null>(null);
  const items = library.data?.items ?? [];

  function openSearch(next: SearchMode = "search") {
    setAddOpen(false);
    setMode(next);
    setTerm("");
    setSearchOpen(true);
  }

  function add(media: MediaItem | null = null) {
    setReturnToSearch(false);
    if (!media) return openSearch("add");
    setSeed(media);
    setSearchOpen(false);
    setAddOpen(true);
  }
  function connect() {
    setAddOpen(false);
    setSearchOpen(false);
    router.push("/settings/connections?connect=1");
  }
  function notify(message: string, error = false, action?: NotifyAction) {
    setToast({ message, error, action });
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
        searchLibrary: () => openSearch(),
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
        notify={notify}
        onConnect={connect}
      />
      <SearchPalette
        open={searchOpen}
        onOpenChange={setSearchOpen}
        mode={mode}
        term={term}
        onTermChange={setTerm}
        library={items}
        libraryError={library.isError ? library.error?.message : undefined}
        onOpenTitle={(item) => {
          setSearchOpen(false);
          router.push(mediaHref(item));
        }}
        onAddTitle={(item) => {
          setSearchOpen(false);
          setSeed(item);
          setReturnToSearch(true);
          setAddOpen(true);
        }}
      />
      {toast && (
        <div
          role={toast.error ? "alert" : "status"}
          className={css({
            position: "fixed",
            bottom: {
              base: "calc(80px + env(safe-area-inset-bottom))",
              lg: "24px",
            },
            right: { base: "16px", md: "28px" },
            left: { base: "16px", md: "auto" },
            maxWidth: "460px",
            display: "flex",
            alignItems: "flex-start",
            gap: "10px",
            p: "15px",
            bg: "raised",
            color: toast.error ? "negative" : "positive",
            border: "1px solid",
            borderColor: "lineStrong",
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
          <span className={css({ flex: 1 })}>
            {toast.message}
            {toast.action && (
              <Link
                href={toast.action.href}
                onClick={() => setToast(null)}
                className={css({
                  display: "inline-block",
                  ml: "8px",
                  color: "ink",
                  fontWeight: 600,
                  textDecoration: "underline",
                  textUnderlineOffset: "2px",
                })}
              >
                {toast.action.label}
              </Link>
            )}
          </span>
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
