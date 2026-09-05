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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useContext,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useState,
} from "react";
import { mediaHref } from "@/lib/client";
import { instancesQuery, libraryQuery } from "@/lib/queries";
import type { MediaItem } from "@/lib/types";
import { AddMedia } from "./add-media";
import { Poster } from "./media-card";
import { Button, inputStyle, Modal, Notice } from "./ui";

interface WorkspaceActions {
  add: (media?: MediaItem | null) => void;
  connect: () => void;
  searchLibrary: () => void;
  notify: (message: string, error?: boolean) => void;
  refresh: () => void;
}

const WorkspaceContext = createContext<WorkspaceActions | null>(null);

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("Workspace actions require WorkspaceProvider.");
  return value;
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const router = useRouter();
  const library = useQuery(libraryQuery);
  const instances = useQuery(instancesQuery);
  const [addOpen, setAddOpen] = useState(false);
  const [seed, setSeed] = useState<MediaItem | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [term, setTerm] = useState("");
  const deferredTerm = useDeferredValue(term);
  const [toast, setToast] = useState<{
    message: string;
    error: boolean;
  } | null>(null);
  const items = library.data?.items ?? [];
  const matches = items
    .filter((item) =>
      item.title.toLowerCase().includes(deferredTerm.toLowerCase()),
    )
    .slice(0, 20);

  function add(media: MediaItem | null = null) {
    setSeed(media);
    setAddOpen(true);
  }
  function connect() {
    setAddOpen(false);
    router.push("/settings?connect=1");
  }
  function notify(message: string, error = false) {
    setToast({ message, error });
  }
  function refresh() {
    void client.invalidateQueries({ queryKey: ["library"] });
  }
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      setSearchOpen((open) => !open);
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
    <WorkspaceContext
      value={{
        add,
        connect,
        searchLibrary: () => setSearchOpen(true),
        notify,
        refresh,
      }}
    >
      {children}
      <AddMedia
        open={addOpen}
        onClose={() => setAddOpen(false)}
        seed={seed}
        instances={instances.data?.instances ?? []}
        library={items}
        onAdded={() => {
          refresh();
          void client.invalidateQueries({ queryKey: ["queue"] });
        }}
        notify={notify}
        onConnect={connect}
      />
      <Modal
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
            aria-label="Search library titles"
            placeholder="Movies, shows, something you love..."
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            className={cx(inputStyle, css({ pl: "40px" }))}
          />
        </div>
        {library.isError && <Notice error>{library.error.message}</Notice>}
        <div className={css({ maxHeight: "400px", overflowY: "auto" })}>
          {matches.map((item) => (
            <Link
              key={item.id}
              href={mediaHref(item)}
              onClick={() => setSearchOpen(false)}
              className={css({
                display: "flex",
                alignItems: "center",
                gap: "14px",
                width: "100%",
                textAlign: "left",
                padding: "10px",
                borderRadius: "7px",
                _hover: { bg: "elevated" },
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
        {!matches.length && !library.isError && (
          <div
            className={css({
              textAlign: "center",
              py: "24px",
              color: "muted",
              fontSize: "13px",
            })}
          >
            <p>
              {library.isPending
                ? "Loading your library..."
                : `No titles match "${term}".`}
            </p>
            <Button
              variant="ghost"
              onClick={() => {
                setSearchOpen(false);
                add();
              }}
              className={css({ mt: "15px" })}
            >
              <PlusIcon size={15} />
              Find something to add
            </Button>
          </div>
        )}
      </Modal>
      {toast && (
        <div
          role={toast.error ? "alert" : "status"}
          className={css({
            position: "fixed",
            bottom: "24px",
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
    </WorkspaceContext>
  );
}
