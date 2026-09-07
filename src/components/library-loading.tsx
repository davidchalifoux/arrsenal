"use client";

import { css } from "@styled-system/css";
import Image from "next/image";
import Link from "next/link";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { useInstances, useLibrary, useQueue } from "@/lib/collections";

const StartupContext = createContext<(() => void) | null>(null);

export function useDismissLibraryLoading() {
  return useContext(StartupContext);
}

export function LibraryLoading({ children }: { children: ReactNode }) {
  const library = useLibrary();
  const instances = useInstances();
  const queue = useQueue();
  const [finished, setFinished] = useState(false);
  const [slow, setSlow] = useState(false);
  const settled =
    library.isError ||
    instances.isError ||
    queue.isError ||
    (!library.isPending && !instances.isPending && !queue.isPending);
  // Startup is a one-way transition, never replayed by polling or navigation.
  if (!finished && settled) setFinished(true);
  useEffect(() => {
    if (finished) return;
    const timer = window.setTimeout(() => setSlow(true), 5000);
    return () => window.clearTimeout(timer);
  }, [finished]);

  return (
    <StartupContext value={() => setFinished(true)}>
      <div hidden={!finished} inert={!finished}>
        {children}
      </div>
      {!finished && (
        <div
          className={css({
            position: "fixed",
            inset: 0,
            zIndex: 200,
            minHeight: "100dvh",
            bg: "canvas",
            color: "ink",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            px: "24px",
            textAlign: "center",
          })}
        >
          <div className={css({ perspective: "600px", mb: "34px" })}>
            <Image
              src="/logo.svg"
              alt=""
              width={80}
              height={80}
              loading="eager"
              fetchPriority="high"
              className={css({
                animation: "logoLoading 2.4s ease-in-out infinite",
                _motionReduce: { animation: "none" },
              })}
            />
          </div>
          <span
            className={css({
              fontSize: "12px",
              fontWeight: "600",
              letterSpacing: "0.3em",
              pl: "0.3em",
            })}
          >
            ARRSENAL
          </span>
          <output
            className={css({
              mt: "12px",
              fontSize: "13px",
              color: "muted",
              maxWidth: "320px",
              lineHeight: "1.7",
            })}
          >
            {slow
              ? "Still connecting to your instances. Large libraries can take a little longer."
              : "Loading your library..."}
          </output>
          {slow && (
            <Link
              href="/settings/connections"
              onClick={() => setFinished(true)}
              className={css({
                mt: "20px",
                fontSize: "12px",
                color: "ink",
                textDecoration: "underline",
                textUnderlineOffset: "4px",
                _focusVisible: {
                  outline: "2px solid token(colors.accent)",
                  outlineOffset: "6px",
                },
              })}
            >
              Check connections
            </Link>
          )}
        </div>
      )}
    </StartupContext>
  );
}
