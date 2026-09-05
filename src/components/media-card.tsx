"use client";

import {
  ArrowDownIcon,
  CheckIcon,
  CircleDashedIcon,
  FilmSlateIcon,
  StackIcon,
} from "@phosphor-icons/react";
import { css, cx } from "@styled-system/css";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { mediaHref, qualityLabel } from "@/lib/client";
import type { MediaItem, MediaTarget } from "@/lib/types";

export function Poster({
  item,
  sizes = "(min-width: 2022px) 273px, (min-width: 1280px) calc((100vw - 386px) / 6), (min-width: 1024px) calc((100vw - 346px) / 4), (min-width: 768px) calc((100vw - 124px) / 4), (min-width: 640px) calc((100vw - 68px) / 3), calc((100vw - 53px) / 2)",
  priority = false,
}: {
  item: Pick<MediaItem, "poster" | "title">;
  sizes?: string;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div
      className={css({
        position: "absolute",
        inset: 0,
        bg: "elevated",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      })}
    >
      {item.poster && !failed ? (
        <Image
          src={item.poster}
          alt={`${item.title} poster`}
          fill
          sizes={sizes}
          preload={priority}
          onError={() => setFailed(true)}
          className={css({
            objectFit: "cover",
            transition: "transform 350ms, filter 350ms",
            _groupHover: {
              transform: "scale(1.045)",
              filter: "brightness(.85)",
            },
          })}
        />
      ) : (
        <div
          className={css({
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "12px",
            textAlign: "center",
            p: "16px",
            color: "muted",
          })}
        >
          <FilmSlateIcon size={36} weight="duotone" />
          <span className={css({ fontSize: "13px" })}>{item.title}</span>
        </div>
      )}
    </div>
  );
}

export function QualityBadge({ target }: { target: MediaTarget }) {
  const available = target.status === "available";
  const downloading = target.status === "downloading";
  return (
    <span
      title={`${target.instanceName}: ${target.qualityProfile} · ${target.status}`}
      className={css({
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        px: "6px",
        height: "22px",
        borderRadius: "4px",
        bg: "#141414cf",
        backdropFilter: "blur(8px)",
        border: "1px solid #c7c7c72b",
        color: available ? "#d1e8c4" : downloading ? "#b4cff1" : "#e4c894",
        fontSize: "10px",
        fontWeight: "550",
        letterSpacing: ".1px",
        whiteSpace: "nowrap",
      })}
    >
      {available ? (
        <CheckIcon size={10} weight="bold" />
      ) : downloading ? (
        <ArrowDownIcon size={10} weight="bold" />
      ) : (
        <CircleDashedIcon size={10} weight="bold" />
      )}
      {qualityLabel(target.qualityProfile, target.quality)}
    </span>
  );
}

export function MediaCard({
  item,
  onClick,
  href,
  index = 10,
}: {
  item: MediaItem;
  onClick?: () => void;
  href?: string;
  index?: number;
}) {
  const className = cx(
    "group",
    css({
      display: "block",
      minWidth: 0,
      textAlign: "left",
      borderRadius: "9px",
      width: "100%",
      animation: "enter .35s ease-out both",
    }),
  );
  const content = (
    <>
      <div
        className={css({
          position: "relative",
          aspectRatio: "2 / 3",
          overflow: "hidden",
          borderRadius: "8px",
          bg: "surface",
          boxShadow: "0 2px 8px #0003",
          outline: "1px solid #ffffff0a",
          _groupHover: {
            outlineColor: "#e5e5e580",
            boxShadow: "0 8px 24px #0006",
          },
          transition: "outline-color 200ms, box-shadow 200ms",
        })}
      >
        <Poster item={item} priority={index < 6} />
        <div
          className={css({
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(180deg, #0002 0%, transparent 40%, transparent 62%, #0d0d0db3 100%)",
          })}
        />
        <div
          className={css({
            position: "absolute",
            bottom: "10px",
            left: "10px",
            right: "8px",
            display: "flex",
            flexWrap: "wrap",
            gap: "5px",
          })}
        >
          {item.targets.slice(0, 3).map((target) => (
            <QualityBadge key={target.instanceId} target={target} />
          ))}
          {item.targets.length > 3 && (
            <span
              className={css({
                fontSize: "10px",
                px: "5px",
                bg: "#141414cf",
                borderRadius: "4px",
                display: "flex",
                alignItems: "center",
              })}
            >
              +{item.targets.length - 3}
            </span>
          )}
        </div>
      </div>
      <div
        className={css({
          mt: "12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "5px",
        })}
      >
        <h3
          title={item.title}
          className={css({
            fontSize: "13px",
            fontWeight: "550",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: "#e5e5e5",
            _groupHover: { color: "accent" },
            transition: "color 150ms",
          })}
        >
          {item.title}
        </h3>
      </div>
      <div
        className={css({
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mt: "4px",
          color: "subtle",
          fontSize: "11px",
          gap: "5px",
        })}
      >
        <span>
          {item.year || "TBA"}
          <span className={css({ mx: "6px", color: "#555555" })}>·</span>
          {item.kind === "movie" ? "Movie" : "Show"}
        </span>
        {item.targets.length > 0 && (
          <span
            className={css({
              display: "flex",
              alignItems: "center",
              gap: "4px",
            })}
            title={`${item.targets.length} quality targets`}
          >
            <StackIcon size={12} />
            {item.targets.length}
          </span>
        )}
      </div>
    </>
  );
  return href ? (
    <Link href={href} aria-label={`View ${item.title}`} className={className}>
      {content}
    </Link>
  ) : (
    <button
      type="button"
      onClick={onClick}
      aria-label={`View ${item.title}`}
      className={className}
    >
      {content}
    </button>
  );
}

export function MediaList({ items }: { items: MediaItem[] }) {
  return (
    <div
      className={css({
        border: "1px solid token(colors.line)",
        borderRadius: "9px",
        overflow: "hidden",
      })}
    >
      <div
        className={css({
          display: { base: "none", md: "grid" },
          gridTemplateColumns: "minmax(0, 1fr) 80px 180px 110px",
          gap: "16px",
          px: "18px",
          py: "12px",
          fontSize: "10px",
          textTransform: "uppercase",
          letterSpacing: "1px",
          color: "subtle",
          bg: "surface",
        })}
      >
        <span>Title</span>
        <span>Year</span>
        <span>Quality targets</span>
        <span>Status</span>
      </div>
      {items.map((item) => (
        <Link
          href={mediaHref(item)}
          key={item.id}
          className={css({
            width: "100%",
            display: "grid",
            gridTemplateColumns: {
              base: "minmax(0, 1fr) auto",
              md: "minmax(0, 1fr) 80px 180px 110px",
            },
            alignItems: "center",
            gap: "16px",
            px: "18px",
            py: "12px",
            borderTop: "1px solid token(colors.line)",
            textAlign: "left",
            _hover: { bg: "surface" },
          })}
        >
          <span
            className={css({
              display: "flex",
              alignItems: "center",
              gap: "13px",
              minWidth: 0,
            })}
          >
            <span
              className={css({
                width: "34px",
                height: "49px",
                position: "relative",
                overflow: "hidden",
                borderRadius: "3px",
                flexShrink: 0,
              })}
            >
              <Poster item={item} sizes="34px" />
            </span>
            <span
              className={css({
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
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
                  mt: "3px",
                })}
              >
                {item.kind === "movie" ? "Movie" : "Show"}
              </span>
            </span>
          </span>
          <span
            className={css({
              color: "muted",
              fontSize: "12px",
              display: { base: "none", md: "block" },
            })}
          >
            {item.year}
          </span>
          <span
            className={css({ display: "flex", gap: "5px", flexWrap: "wrap" })}
          >
            {item.targets.slice(0, 3).map((target) => (
              <QualityBadge key={target.instanceId} target={target} />
            ))}
          </span>
          <span
            className={css({
              fontSize: "11px",
              color:
                item.status === "available"
                  ? "positive"
                  : item.status === "downloading"
                    ? "info"
                    : "warning",
              textTransform: "capitalize",
              display: { base: "none", md: "block" },
            })}
          >
            {item.status === "partial" ? "Incomplete" : item.status}
          </span>
        </Link>
      ))}
    </div>
  );
}
