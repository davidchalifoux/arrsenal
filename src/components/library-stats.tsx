import {
  ArrowDownIcon,
  CheckCircleIcon,
  CircleDashedIcon,
  StackIcon,
} from "@phosphor-icons/react";
import { css } from "@styled-system/css";
import type { LibraryCounts, LibraryStatus } from "./use-library-view";

export function LibraryStats({
  counts,
  hasData,
  isPending,
  onStatusChange,
}: {
  counts: LibraryCounts;
  hasData: boolean;
  isPending: boolean;
  onStatusChange: (status: LibraryStatus) => void;
}) {
  return (
    <div
      className={css({
        display: "grid",
        gridTemplateColumns: {
          base: "repeat(2, minmax(0, 1fr))",
          md: "repeat(4, minmax(0, 1fr))",
        },
        gap: "12px",
        mb: "32px",
      })}
    >
      {(
        [
          {
            label: "Total titles",
            count: counts.library,
            note: `${counts.movies} movies · ${counts.shows} shows`,
            icon: StackIcon,
            color: "#c7c7c7",
            filter: "all",
          },
          {
            label: "Available",
            count: counts.available,
            note: "Ready in every quality",
            icon: CheckCircleIcon,
            color: "#b1d894",
            filter: "available",
          },
          {
            label: "Incomplete",
            count: counts.missing,
            note: "A target needs some love",
            icon: CircleDashedIcon,
            color: "#d8ba80",
            filter: "incomplete",
          },
          {
            label: "Downloading",
            count: counts.downloading,
            note: "Good things are on the way",
            icon: ArrowDownIcon,
            color: "#9dbbed",
            filter: "downloading",
          },
        ] as const
      ).map((stat) => (
        <button
          type="button"
          key={stat.label}
          disabled={!hasData}
          onClick={() => {
            onStatusChange(stat.filter);
          }}
          className={css({
            textAlign: "left",
            bg: "#191919",
            border: "1px solid token(colors.line)",
            borderRadius: "8px",
            px: { base: "14px", md: "17px" },
            py: "15px",
            _hover: { bg: "#202020", borderColor: "#414141" },
            transition: "background 150ms, border-color 150ms",
          })}
        >
          <div
            className={css({
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "10px",
              color: "muted",
              fontSize: "10px",
            })}
          >
            <span>{stat.label}</span>
            <stat.icon size={17} style={{ color: stat.color }} />
          </div>
          <div
            className={css({
              fontSize: "27px",
              fontWeight: "550",
              lineHeight: 1,
              letterSpacing: "-.8px",
              mt: "10px",
              mb: "7px",
            })}
          >
            {hasData ? stat.count : "-"}
          </div>
          <p
            className={css({
              color: "subtle",
              fontSize: "9px",
              lineHeight: "1.4",
            })}
          >
            {isPending && stat.filter === "all"
              ? "Loading counts..."
              : stat.filter === "all" && !hasData
                ? "Counts unavailable"
                : stat.note}
          </p>
        </button>
      ))}
    </div>
  );
}
