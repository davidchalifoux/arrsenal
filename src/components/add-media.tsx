"use client";

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  FilmSlateIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  TelevisionSimpleIcon,
} from "@phosphor-icons/react";
import { css, cx } from "@styled-system/css";
import { useQuery } from "@tanstack/react-query";
import { useDeferredValue, useRef, useState } from "react";
import { api } from "@/lib/client";
import type {
  ActionResponse,
  AddMediaRequest,
  InstanceOptions,
  InstanceSummary,
  LibraryResponse,
  MediaItem,
} from "@/lib/types";
import { Poster } from "./media-card";
import {
  Button,
  CheckField,
  inputStyle,
  labelStyle,
  Modal,
  mutedStyle,
  Notice,
  SelectField,
  Spinner,
} from "./ui";

type TargetChoice = {
  enabled: boolean;
  qualityProfileId: number;
  rootFolderPath: string;
};

export function AddMedia({
  open,
  onClose,
  seed,
  instances,
  library,
  onAdded,
  notify,
  onConnect,
}: {
  open: boolean;
  onClose: () => void;
  seed: MediaItem | null;
  instances: InstanceSummary[];
  library: MediaItem[];
  onAdded: () => void;
  notify: (message: string, error?: boolean) => void;
  onConnect: () => void;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={seed ? "Add a quality target" : "Find your next great watch"}
      description="One title. Your choice of instances and quality profiles."
      wide
    >
      {open && (
        <AddMediaContent
          key={seed?.id ?? "search"}
          seed={seed}
          instances={instances}
          library={library}
          onAdded={onAdded}
          notify={notify}
          onClose={onClose}
          onConnect={onConnect}
        />
      )}
    </Modal>
  );
}

function AddMediaContent({
  seed,
  instances,
  library,
  onAdded,
  notify,
  onClose,
  onConnect,
}: Omit<Parameters<typeof AddMedia>[0], "open">) {
  const [term, setTerm] = useState("");
  const deferredTerm = useDeferredValue(term);
  const [kind, setKind] = useState("movie");
  const [selected, setSelected] = useState<MediaItem | null>(seed);
  const [choices, setChoices] = useState<Record<string, TargetChoice>>({});
  const [confirmedIds, setConfirmedIds] = useState<string[]>([]);
  const [search, setSearch] = useState(true);
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const [error, setError] = useState("");
  const lookup = useQuery({
    queryKey: ["lookup", deferredTerm, kind],
    queryFn: ({ signal }) =>
      api<LibraryResponse>(
        `/api/lookup?term=${encodeURIComponent(deferredTerm)}&kind=${kind}`,
        { signal },
      ),
    enabled: !selected && deferredTerm.trim().length > 1,
  });
  const matching = instances.filter(
    (instance) =>
      instance.kind === (selected?.kind === "series" ? "sonarr" : "radarr"),
  );
  const existing = selected
    ? (library.find((item) => item.id === selected.id)?.targets ??
      selected.targets)
    : [];
  const existingIds = [
    ...existing.map((target) => target.instanceId),
    ...confirmedIds,
  ];
  const targets = Object.entries(choices).filter(
    ([id, choice]) => choice.enabled && !existingIds.includes(id),
  );
  async function add() {
    if (!selected || targets.length === 0 || saveLock.current) return;
    setError("");
    const requestTargets = targets.map(([instanceId, choice]) => ({
      instanceId,
      qualityProfileId: choice.qualityProfileId,
      rootFolderPath: choice.rootFolderPath,
    }));
    if (
      requestTargets.some(
        (target) => !target.qualityProfileId || !target.rootFolderPath,
      )
    ) {
      setError(
        "Choose a quality profile and root folder for every selected instance.",
      );
      return;
    }
    saveLock.current = true;
    setSaving(true);
    try {
      const payload: AddMediaRequest = {
        media: selected,
        targets: requestTargets,
        search,
      };
      const result = await api<ActionResponse>("/api/media", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      onAdded();
      if (!result.success) {
        const failed =
          result.errors?.map((item) => item.instanceId) ??
          targets.map(([id]) => id);
        setConfirmedIds((current) => [
          ...current,
          ...targets.map(([id]) => id).filter((id) => !failed.includes(id)),
        ]);
        setError(
          `${result.message} ${result.errors?.map((item) => `${item.instanceName}: ${item.message}`).join(" ") ?? ""}`,
        );
        return;
      }
      notify(result.message);
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not add this title.",
      );
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }
  return (
    <>
      {!selected ? (
        <>
          <div
            className={css({
              display: "flex",
              gap: "10px",
              alignItems: "center",
              mb: "18px",
              flexWrap: { base: "wrap", sm: "nowrap" },
            })}
          >
            <div
              className={css({
                position: "relative",
                flex: 1,
                minWidth: "160px",
              })}
            >
              <MagnifyingGlassIcon
                size={18}
                className={css({
                  position: "absolute",
                  left: "13px",
                  top: "12px",
                  color: "subtle",
                })}
              />
              <input
                autoComplete="off"
                aria-label="Search movies and shows"
                placeholder={
                  kind === "movie"
                    ? "Search for a movie..."
                    : "Search for a show..."
                }
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                className={cx(inputStyle, css({ pl: "39px" }))}
              />
            </div>
            <SelectField
              value={kind}
              onChange={setKind}
              compact
              label="Media type"
              options={[
                { value: "movie", label: "Movies" },
                { value: "series", label: "Shows" },
              ]}
            />
          </div>
          {instances.length === 0 ? (
            <Notice>
              Connect Radarr for movies or Sonarr for shows to start searching.
            </Notice>
          ) : term.trim().length < 2 ? (
            <div
              className={css({
                py: "40px",
                textAlign: "center",
                color: "muted",
                fontSize: "13px",
              })}
            >
              <MagnifyingGlassIcon
                size={30}
                className={css({ mx: "auto", mb: "12px", color: "subtle" })}
              />
              Search by title to find something worth adding.
            </div>
          ) : lookup.isPending ? (
            <div
              className={css({
                py: "40px",
                display: "flex",
                justifyContent: "center",
                gap: "10px",
                color: "muted",
              })}
            >
              <Spinner />
              Searching the catalog...
            </div>
          ) : lookup.isError ? (
            <Notice error>{lookup.error.message}</Notice>
          ) : (
            <>
              {lookup.data?.errors.map((serviceError) => (
                <Notice error key={serviceError.instanceId}>
                  {serviceError.instanceName}: {serviceError.message}
                </Notice>
              ))}
              <div
                className={css({
                  maxHeight: "400px",
                  overflowY: "auto",
                  display: "flex",
                  flexDirection: "column",
                  gap: "3px",
                })}
              >
                {lookup.data?.items.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => {
                      setSelected(item);
                      setChoices({});
                      setError("");
                    }}
                    className={css({
                      display: "flex",
                      alignItems: "center",
                      gap: "14px",
                      p: "10px",
                      borderRadius: "7px",
                      textAlign: "left",
                      _hover: { bg: "elevated" },
                    })}
                  >
                    <span
                      className={css({
                        width: "42px",
                        height: "62px",
                        position: "relative",
                        overflow: "hidden",
                        borderRadius: "4px",
                        flexShrink: 0,
                      })}
                    >
                      <Poster item={item} sizes="42px" />
                    </span>
                    <span className={css({ minWidth: 0, flex: 1 })}>
                      <span
                        className={css({ fontSize: "13px", fontWeight: "550" })}
                      >
                        {item.title}
                      </span>
                      <span
                        className={css({
                          display: "block",
                          fontSize: "11px",
                          color: "subtle",
                          mt: "5px",
                        })}
                      >
                        {item.year || "TBA"} ·{" "}
                        {item.kind === "movie" ? "Movie" : "Show"}
                        {library.some((entry) => entry.id === item.id)
                          ? " · In your library"
                          : ""}
                      </span>
                    </span>
                    <ArrowRightIcon
                      size={17}
                      className={css({ color: "subtle" })}
                    />
                  </button>
                ))}
                {lookup.data?.items.length === 0 && (
                  <p
                    className={cx(
                      mutedStyle,
                      css({ py: "30px", textAlign: "center" }),
                    )}
                  >
                    No matches found. Try a different title .
                  </p>
                )}
              </div>
            </>
          )}
        </>
      ) : (
        <>
          {!seed && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelected(null);
                setError("");
                setConfirmedIds([]);
              }}
              disabled={saving}
              className={css({ mb: "16px", ml: "-8px" })}
            >
              <ArrowLeftIcon size={14} />
              Back to results
            </Button>
          )}
          <div
            className={css({
              display: "flex",
              gap: "16px",
              alignItems: "center",
              pb: "23px",
              borderBottom: "1px solid token(colors.line)",
              mb: "21px",
            })}
          >
            <div
              className={css({
                width: "64px",
                height: "94px",
                position: "relative",
                borderRadius: "5px",
                overflow: "hidden",
                flexShrink: 0,
              })}
            >
              <Poster item={selected} sizes="64px" />
            </div>
            <div>
              <h3
                className={css({
                  fontSize: "19px",
                  fontWeight: "600",
                  letterSpacing: "-.4px",
                })}
              >
                {selected.title}
              </h3>
              <p
                className={css({
                  color: "muted",
                  fontSize: "12px",
                  mt: "7px",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                })}
              >
                {selected.kind === "movie" ? (
                  <FilmSlateIcon size={14} />
                ) : (
                  <TelevisionSimpleIcon size={14} />
                )}
                {selected.year} · {selected.genres.slice(0, 2).join(" / ")}
              </p>
            </div>
          </div>
          <h3
            className={css({ fontSize: "13px", fontWeight: "550", mb: "6px" })}
          >
            Where should this live?
          </h3>
          <p className={cx(mutedStyle, css({ fontSize: "12px", mb: "17px" }))}>
            Select one or more instances, then choose a profile for each.
          </p>
          <div
            className={css({
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            })}
          >
            {matching.map((instance) => (
              <TargetOption
                key={instance.id}
                instance={instance}
                existing={existingIds.includes(instance.id)}
                choice={choices[instance.id]}
                onChange={(choice) =>
                  setChoices((current) => ({
                    ...current,
                    [instance.id]: choice,
                  }))
                }
                disabled={saving}
              />
            ))}
          </div>
          {matching.length === 0 && (
            <Notice>
              No {selected.kind === "movie" ? "Radarr" : "Sonarr"} instances are
              connected.{" "}
              <button
                type="button"
                onClick={onConnect}
                className={css({ textDecoration: "underline" })}
              >
                Connect an instance
              </button>{" "}
              to add this title.
            </Notice>
          )}
          {matching.length > 0 && (
            <div className={css({ mt: "20px" })}>
              <CheckField
                checked={search}
                onChange={setSearch}
                disabled={saving}
              >
                <span>
                  Start searching after adding
                  <span
                    className={css({
                      display: "block",
                      fontSize: "11px",
                      color: "subtle",
                    })}
                  >
                    Automatically find releases that match each quality profile.
                  </span>
                </span>
              </CheckField>
            </div>
          )}
          {error && (
            <div className={css({ mt: "18px" })}>
              <Notice error>{error}</Notice>
            </div>
          )}
          <div
            className={css({
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
              pt: "21px",
              mt: "21px",
              borderTop: "1px solid token(colors.line)",
            })}
          >
            <span className={css({ color: "subtle", fontSize: "11px" })}>
              {`${targets.length} ${targets.length === 1 ? "target" : "targets"} selected`}
            </span>
            <Button
              variant="primary"
              disabled={saving || targets.length === 0}
              onClick={add}
            >
              {saving ? <Spinner /> : <PlusIcon size={15} />}
              {saving
                ? "Adding..."
                : `Add to ${targets.length || ""} ${targets.length === 1 ? "target" : "targets"}`}
            </Button>
          </div>
        </>
      )}
    </>
  );
}

function TargetOption({
  instance,
  existing,
  choice,
  onChange,
  disabled,
}: {
  instance: InstanceSummary;
  existing: boolean;
  choice?: TargetChoice;
  onChange: (choice: TargetChoice) => void;
  disabled: boolean;
}) {
  const enabled = choice?.enabled ?? false;
  const options = useQuery({
    queryKey: ["instance-options", instance.id],
    staleTime: 5 * 60_000,
    queryFn: ({ signal }) =>
      api<InstanceOptions>(
        `/api/instances/${encodeURIComponent(instance.id)}/options`,
        { signal },
      ),
    enabled: enabled && !existing,
  });
  const data = options.data;
  const profile = choice?.qualityProfileId || 0;
  const folder = choice?.rootFolderPath || "";
  return (
    <div
      className={css({
        border: "1px solid",
        borderColor: enabled ? "#6e6e6e" : "line",
        borderRadius: "8px",
        bg: enabled ? "#242424" : "surface",
        padding: "15px",
        opacity: existing ? 0.55 : 1,
      })}
    >
      <div
        className={css({
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "10px",
        })}
      >
        {existing ? (
          <span
            className={css({
              display: "flex",
              alignItems: "center",
              gap: "10px",
              fontSize: "12px",
            })}
          >
            <CheckIcon size={16} className={css({ color: "accent" })} />
            {instance.name}
          </span>
        ) : (
          <CheckField
            disabled={disabled}
            checked={enabled}
            onChange={(checked) => {
              if (!disabled)
                onChange({
                  enabled: checked,
                  qualityProfileId: profile,
                  rootFolderPath: folder,
                });
            }}
          >
            {instance.name}
          </CheckField>
        )}
        <span className={css({ color: "subtle", fontSize: "10px" })}>
          {existing
            ? "Already added"
            : instance.kind === "radarr"
              ? "Radarr"
              : "Sonarr"}
        </span>
      </div>
      {enabled && !existing && (
        <div className={css({ mt: "15px" })}>
          {options.isPending ? (
            <div
              className={css({
                display: "flex",
                gap: "8px",
                fontSize: "11px",
                color: "muted",
              })}
            >
              <Spinner size={14} />
              Loading profiles and folders...
            </div>
          ) : options.isError ? (
            <Notice error>
              {options.error.message}
              <button
                type="button"
                onClick={() => options.refetch()}
                className={css({ textDecoration: "underline" })}
              >
                Retry
              </button>
            </Notice>
          ) : (
            <div
              className={css({
                display: "grid",
                gridTemplateColumns: { base: "1fr", sm: "1fr 1fr" },
                gap: "13px",
              })}
            >
              <div className={labelStyle}>
                <span>Quality profile</span>
                <SelectField
                  disabled={disabled}
                  value={String(profile)}
                  onChange={(value) =>
                    onChange({
                      enabled,
                      qualityProfileId: Number(value),
                      rootFolderPath: folder,
                    })
                  }
                  label={`${instance.name} quality profile`}
                  options={[
                    { value: "0", label: "Choose a profile" },
                    ...(data?.profiles.map((item) => ({
                      value: String(item.id),
                      label: item.name,
                    })) ?? []),
                  ]}
                />
              </div>
              <div className={labelStyle}>
                <span>Root folder</span>
                <SelectField
                  disabled={disabled}
                  value={folder}
                  onChange={(value) =>
                    onChange({
                      enabled,
                      qualityProfileId: profile,
                      rootFolderPath: value,
                    })
                  }
                  label={`${instance.name} root folder`}
                  options={[
                    { value: "", label: "Choose a folder" },
                    ...(data?.rootFolders.map((item) => ({
                      value: item.path,
                      label: item.path,
                    })) ?? []),
                  ]}
                />
              </div>
              {(!data?.profiles.length || !data.rootFolders.length) && (
                <p
                  className={css({
                    color: "warning",
                    fontSize: "11px",
                    gridColumn: "1 / -1",
                  })}
                >
                  Configure at least one quality profile and root folder in{" "}
                  {instance.name} first.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
