"use client";

import {
  measureElement as measureSize,
  useVirtualizer,
} from "@tanstack/react-virtual";
import { type CSSProperties, useLayoutEffect, useRef, useState } from "react";
import { usePageScrollElement } from "./page-scroll";

// Row heights by layout, kept across visits so returning to a list restores
// its scroll position against the same row positions it left with.
const measuredSizes = new Map<string, number>();

/**
 * Virtualizes a list inside the current page's scrolling body. Rendered rows
 * stay in normal flow between two spacers, so striping by index and plain
 * `scrollTo` restoration on the body keep working.
 */
export function useScrollList<TElement extends HTMLElement>({
  count,
  estimateSize,
  getItemKey,
  sizeKey,
  gap = 0,
  overscan = 6,
}: {
  count: number;
  /** Identifies a row layout; rows with the same key share one height. */
  sizeKey: string;
  estimateSize: (index: number) => number;
  getItemKey: (index: number) => string;
  gap?: number;
  overscan?: number;
}) {
  // The virtualizer mutates one stable instance, so compiler memoization would
  // keep returning the first set of rows.
  "use no memo";
  const scroller = usePageScrollElement();
  const listRef = useRef<TElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  // Headings and notices above the list inside the body move its offset.
  useLayoutEffect(() => {
    const element = listRef.current;
    if (!element || !scroller) return;
    const update = () => {
      const next =
        element.getBoundingClientRect().top -
        scroller.getBoundingClientRect().top +
        scroller.scrollTop;
      setScrollMargin((previous) =>
        Math.abs(previous - next) < 1 ? previous : next,
      );
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(scroller);
    if (scroller.firstElementChild)
      observer.observe(scroller.firstElementChild);
    return () => observer.disconnect();
  }, [scroller]);

  const virtualizer = useVirtualizer<HTMLElement, Element>({
    count,
    getScrollElement: () => scroller,
    // Rows share a height, so a measured row is the best estimate for rows
    // not rendered yet. Exact estimates keep scroll restoration on target.
    estimateSize: (index) => measuredSizes.get(sizeKey) ?? estimateSize(index),
    getItemKey,
    gap,
    overscan,
    scrollMargin,
    // Rows are measured from ref callbacks during commit, where React 19
    // rejects flushSync; a normal re-render keeps up with scrolling.
    useFlushSync: false,
    // Unlaid-out rows (hidden, or in tests) report 0; keep the estimate.
    measureElement: (element, entry, instance) => {
      const size = measureSize(element, entry, instance);
      if (!size) return estimateSize(instance.indexFromElement(element));
      measuredSizes.set(sizeKey, size);
      return size;
    },
    initialRect: scroller
      ? { width: scroller.clientWidth, height: scroller.clientHeight }
      : undefined,
  });
  const rows = virtualizer.getVirtualItems();
  const first = rows[0];
  const last = rows.at(-1);
  const spacerStyle: CSSProperties = {
    paddingTop: first ? first.start - scrollMargin : 0,
    paddingBottom: last
      ? Math.max(0, virtualizer.getTotalSize() - (last.end - scrollMargin))
      : 0,
  };
  return {
    listRef,
    rows,
    spacerStyle,
    measureElement: virtualizer.measureElement,
  };
}
