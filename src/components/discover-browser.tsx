"use client";

import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { css, cx } from "@styled-system/css";
import { useQuery } from "@tanstack/react-query";
import { useDeferredValue, useState } from "react";
import { api } from "@/lib/client";
import type { LibraryResponse } from "@/lib/types";
import { MediaCard } from "./media-card";
import { PageHeader } from "./page-header";
import { inputStyle, Notice, SelectField, Spinner } from "./ui";
import { useWorkspace } from "./workspace-provider";

const gridStyle = css({
  display: "grid",
  gridTemplateColumns: {
    base: "repeat(2, minmax(0, 1fr))",
    sm: "repeat(3, minmax(0, 1fr))",
    md: "repeat(4, minmax(0, 1fr))",
    lg: "repeat(4, minmax(0, 1fr))",
    xl: "repeat(6, minmax(0, 1fr))",
  },
  columnGap: { base: "15px", md: "20px" },
  rowGap: "29px",
});

export function DiscoverBrowser() {
  const { add } = useWorkspace();
  const [term, setTerm] = useState("");
  const deferred = useDeferredValue(term);
  const [kind, setKind] = useState("movie");
  const results = useQuery({
    queryKey: ["lookup", deferred, kind],
    queryFn: ({ signal }) =>
      api<LibraryResponse>(
        `/api/lookup?term=${encodeURIComponent(deferred)}&kind=${kind}`,
        { signal },
      ),
    enabled: deferred.trim().length > 1,
  });
  return (
    <>
      <PageHeader
        title="Make room for a good story."
        description="Find a movie or show. Choose your targets. Leave the searching to your instances."
      />
      <div
        className={css({
          display: "flex",
          alignItems: "center",
          gap: "12px",
          mb: "32px",
        })}
      >
        <div className={css({ position: "relative", flex: 1 })}>
          <MagnifyingGlassIcon
            size={20}
            className={css({
              position: "absolute",
              top: "14px",
              left: "15px",
              color: "subtle",
            })}
          />
          <input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            aria-label="Discover movies and shows"
            placeholder="What are you looking for?"
            className={cx(
              inputStyle,
              css({ height: "48px", pl: "46px", bg: "surface" }),
            )}
          />
        </div>
        <SelectField
          compact
          value={kind}
          onChange={setKind}
          label="Discover media type"
          options={[
            { value: "movie", label: "Movies" },
            { value: "series", label: "Shows" },
          ]}
        />
      </div>
      <div
        className={css({
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: "20px",
          gap: "10px",
        })}
      >
        <h2 className={css({ fontSize: "16px", fontWeight: "500" })}>
          {term ? "Search results" : "A world of stories awaits"}
        </h2>
      </div>
      {results.isError ? (
        <Notice error>{results.error.message}</Notice>
      ) : deferred.trim().length < 2 ? (
        <div
          className={css({
            py: "80px",
            textAlign: "center",
            border: "1px dashed token(colors.line)",
            borderRadius: "10px",
            color: "muted",
          })}
        >
          <MagnifyingGlassIcon
            size={36}
            className={css({ mx: "auto", color: "subtle", mb: "16px" })}
          />
          <p>Start with a title.</p>
          <p className={css({ fontSize: "12px", mt: "8px", color: "subtle" })}>
            We&apos;ll search the catalog through your connected instances.
          </p>
        </div>
      ) : results.isPending ? (
        <div
          className={css({
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: "10px",
            py: "50px",
            color: "muted",
          })}
        >
          <Spinner />
          Finding your next favorite...
        </div>
      ) : (
        <>
          {results.data?.errors.map((error) => (
            <div key={error.instanceId} className={css({ mb: "15px" })}>
              <Notice error>
                {error.instanceName}: {error.message}
              </Notice>
            </div>
          ))}
          <div className={gridStyle}>
            {results.data?.items.map((item, index) => (
              <MediaCard
                key={item.id}
                item={{ ...item, targets: [] }}
                index={index}
                onClick={() => add(item)}
              />
            ))}
          </div>
          {results.data?.items.length === 0 && (
            <p
              className={css({
                color: "muted",
                textAlign: "center",
                py: "50px",
              })}
            >
              No matches found. Try another title.
            </p>
          )}
        </>
      )}
    </>
  );
}
