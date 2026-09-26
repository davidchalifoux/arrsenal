"use client";

import { css } from "@styled-system/css";
import { useCallback, useLayoutEffect, useState } from "react";
import { mediaHref } from "@/lib/client";
import type { LibraryViewOptions, PosterSize } from "@/lib/library-options";
import type { MediaItem } from "@/lib/types";
import { MediaCard } from "./media-card";
import { useScrollList } from "./use-scroll-list";

const posterMinWidth: Record<PosterSize, number> = {
  small: 118,
  medium: 148,
  large: 188,
  huge: 240,
};

const rowGap = 28;
// Title, one line of details, and target badges under each poster.
const captionHeight = 84;

const containerStyle = css({
  display: "flex",
  flexDirection: "column",
  columnGap: { base: "15px", md: "20px" },
  rowGap: `${rowGap}px`,
});

const rowStyle = css({
  display: "grid",
  columnGap: "inherit",
});

const sizes =
  "(min-width: 1864px) 183px, (min-width: 1536px) calc((100vw - 400px) / 9), (min-width: 1280px) calc((100vw - 380px) / 8), (min-width: 1024px) calc((100vw - 360px) / 7), (min-width: 768px) calc((100vw - 112px) / 5), (min-width: 640px) calc((100vw - 62px) / 3), calc((100vw - 47px) / 2)";

/** Matches `repeat(auto-fill, minmax(min(size, 50% - 8px), 1fr))`. */
export function posterColumns(width: number, gap: number, minimum: number) {
  if (width <= 0) return 2;
  const cell = Math.min(minimum, width / 2 - 8);
  return Math.max(1, Math.floor((width + gap) / (cell + gap)));
}

function useGridMetrics(element: HTMLElement | null) {
  const [metrics, setMetrics] = useState({ width: 0, gap: 20 });
  useLayoutEffect(() => {
    if (!element) return;
    const update = () => {
      const width = element.clientWidth;
      const gap = Number.parseFloat(getComputedStyle(element).columnGap) || 0;
      setMetrics((previous) =>
        previous.width === width && previous.gap === gap
          ? previous
          : { width, gap },
      );
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return metrics;
}

/** Poster grid that only renders the rows near the viewport. */
export function PosterGrid({
  items,
  options,
}: {
  items: MediaItem[];
  options: LibraryViewOptions;
}) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const { width, gap } = useGridMetrics(element);
  const columns = posterColumns(width, gap, posterMinWidth[options.posterSize]);
  const rowCount = Math.ceil(items.length / columns);
  const posterWidth = width ? (width - gap * (columns - 1)) / columns : 160;
  const { listRef, rows, spacerStyle, measureElement } =
    useScrollList<HTMLDivElement>({
      count: rowCount,
      estimateSize: useCallback(
        () => posterWidth * 1.5 + captionHeight,
        [posterWidth],
      ),
      getItemKey: useCallback(
        (index: number) => `${columns}:${items[index * columns]?.id ?? index}`,
        [columns, items],
      ),
      sizeKey: `posters:${width}:${columns}:${JSON.stringify(options)}`,
      gap: rowGap,
      overscan: 2,
    });
  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      listRef.current = node;
      setElement(node);
    },
    [listRef],
  );
  return (
    <div
      ref={setRefs}
      className={containerStyle}
      style={spacerStyle}
      data-columns={columns}
    >
      {rows.map((row) => {
        const start = row.index * columns;
        return (
          <div
            key={row.key}
            ref={measureElement}
            data-index={row.index}
            className={rowStyle}
            style={{
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            }}
          >
            {items.slice(start, start + columns).map((item, offset) => (
              <MediaCard
                key={item.id}
                item={item}
                index={start + offset}
                priority={start + offset < 16}
                sizes={sizes}
                href={mediaHref(item)}
                options={options}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
