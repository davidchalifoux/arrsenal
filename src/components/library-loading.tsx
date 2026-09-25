"use client";

import { css } from "@styled-system/css";
import Link from "next/link";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { useInstances, useLibrary, useQueue } from "@/lib/client-data";
import { logoPaths } from "./logo";

const StartupContext = createContext<(() => void) | null>(null);

export function useDismissLibraryLoading() {
  return useContext(StartupContext);
}

// Startup visuals wait this long, so fast loads fade from a blank canvas
// instead of flashing a half-drawn splash.
const revealDelay = "150ms";
const exitMs = 320;

const markPieceStyle = css({
  transformBox: "fill-box",
  _motionReduce: { animation: "fadeIn 400ms ease-out both !important" },
});

export function LibraryLoading({ children }: { children: ReactNode }) {
  const library = useLibrary();
  const instances = useInstances();
  const queue = useQueue();
  // loading -> leaving (splash fades out over the revealed app) -> done.
  const [phase, setPhase] = useState<"loading" | "leaving" | "done">("loading");
  const [slow, setSlow] = useState(false);
  const settled =
    library.isError || instances.isError || queue.isError || !library.isPending;
  // Startup is a one-way transition, never replayed by polling or navigation.
  if (phase === "loading" && settled) setPhase("leaving");
  useEffect(() => {
    if (phase !== "loading") return;
    const timer = window.setTimeout(() => setSlow(true), 5000);
    return () => window.clearTimeout(timer);
  }, [phase]);
  useEffect(() => {
    if (phase !== "leaving") return;
    const timer = window.setTimeout(() => setPhase("done"), exitMs);
    return () => window.clearTimeout(timer);
  }, [phase]);
  const finish = () =>
    setPhase((current) => (current === "loading" ? "leaving" : current));

  return (
    <StartupContext value={finish}>
      <div
        hidden={phase === "loading"}
        inert={phase !== "done"}
        className={
          phase === "leaving"
            ? css({ animation: `fadeIn ${exitMs}ms ease-out both` })
            : undefined
        }
      >
        {children}
      </div>
      {phase !== "done" && (
        <div
          data-leaving={phase === "leaving" ? "" : undefined}
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
            transition: `opacity ${exitMs}ms ease-out`,
            "&[data-leaving]": { opacity: 0, pointerEvents: "none" },
            "&[data-leaving] [data-mark]": {
              transform: "scale(1.06)",
              _motionReduce: { transform: "none" },
            },
          })}
        >
          <svg
            data-mark=""
            viewBox="0 0 64 64"
            width={72}
            height={72}
            fill="currentColor"
            aria-hidden="true"
            className={css({
              mb: "28px",
              transition: `transform ${exitMs}ms ease-out`,
            })}
          >
            <path
              d={logoPaths[0]}
              className={markPieceStyle}
              style={{
                animation: `markRise 560ms cubic-bezier(.2,.8,.2,1) ${revealDelay} both, markWave 2s ease-in-out 1.1s infinite`,
              }}
            />
            <path
              d={logoPaths[1]}
              className={markPieceStyle}
              style={{
                animation: `markRise 560ms cubic-bezier(.2,.8,.2,1) calc(${revealDelay} + 140ms) both, markWave 2s ease-in-out 1.5s infinite`,
              }}
            />
          </svg>
          <span
            className={css({
              fontSize: "12px",
              fontWeight: "600",
              letterSpacing: "0.3em",
              pl: "0.3em",
            })}
            style={{
              animation: `fadeIn 500ms ease-out calc(${revealDelay} + 250ms) both`,
            }}
          >
            ARRSENAL
          </span>
          <span
            aria-hidden="true"
            className={css({
              position: "relative",
              width: "120px",
              height: "2px",
              mt: "18px",
              overflow: "hidden",
              borderRadius: "999px",
              bg: "line",
            })}
            style={{
              animation: `fadeIn 500ms ease-out calc(${revealDelay} + 350ms) both`,
            }}
          >
            <span
              className={css({
                position: "absolute",
                inset: 0,
                width: "40%",
                borderRadius: "inherit",
                bg: "ink",
                opacity: 0.7,
                animation:
                  "progressSlide 1.3s cubic-bezier(.45,0,.55,1) infinite",
                _motionReduce: {
                  animation: "none",
                  width: "100%",
                  opacity: 0.3,
                },
              })}
            />
          </span>
          <output
            key={slow ? "slow" : "loading"}
            className={css({
              mt: "16px",
              fontSize: "13px",
              color: "muted",
              maxWidth: "320px",
              lineHeight: "1.7",
            })}
            style={{
              animation: `fadeIn 400ms ease-out ${slow ? "0ms" : `calc(${revealDelay} + 350ms)`} both`,
            }}
          >
            {slow
              ? "Still connecting to your instances. Large libraries can take a little longer."
              : "Loading your library…"}
          </output>
          {slow && (
            <Link
              href="/settings/connections"
              onClick={finish}
              className={css({
                mt: "20px",
                fontSize: "12px",
                color: "ink",
                textDecoration: "underline",
                textUnderlineOffset: "4px",
                animation: "fadeIn 400ms ease-out 150ms both",
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
