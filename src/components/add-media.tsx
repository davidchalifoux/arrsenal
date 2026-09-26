"use client";

import {
  ArrowLeftIcon,
  CheckIcon,
  FilmSlateIcon,
  PlusIcon,
  TelevisionSimpleIcon,
} from "@phosphor-icons/react";
import { css, cx } from "@styled-system/css";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { api, mediaHref } from "@/lib/client";
import { instanceOptionsQuery } from "@/lib/instance-options-query";
import {
  type AddDefault,
  usePreferences,
  useSavePreferences,
} from "@/lib/preferences";
import type {
  ActionResponse,
  AddMediaRequest,
  CatalogItem,
  InstanceSummary,
  MediaItem,
} from "@/lib/types";
import { Poster } from "./media-card";
import {
  Button,
  CheckField,
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
  notify,
  onConnect,
  onBack,
}: {
  open: boolean;
  onClose: () => void;
  seed: CatalogItem | MediaItem | null;
  instances: InstanceSummary[];
  library: MediaItem[];
  notify: (
    message: string,
    error?: boolean,
    action?: { label: string; href: string },
  ) => void;
  onConnect: () => void;
  onBack?: () => void;
}) {
  return (
    <Modal
      open={open && seed !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Add to library"
      wide
      placement="top"
      // Start on the first instance to choose, not the close button.
      initialFocus={() =>
        document.querySelector<HTMLElement>(
          "[data-add-media] [role=checkbox]:not([aria-disabled=true])",
        ) ?? true
      }
    >
      {open && seed && (
        <AddMediaContent
          key={seed.id}
          seed={seed}
          instances={instances}
          library={library}
          notify={notify}
          onClose={onClose}
          onConnect={onConnect}
          onBack={onBack}
        />
      )}
    </Modal>
  );
}

function AddMediaContent({
  seed: selected,
  instances,
  library,
  notify,
  onClose,
  onConnect,
  onBack,
}: Omit<Parameters<typeof AddMedia>[0], "open" | "seed"> & {
  seed: CatalogItem | MediaItem;
}) {
  const matching = instances.filter(
    (instance) =>
      instance.kind === (selected.kind === "series" ? "sonarr" : "radarr"),
  );
  const preferences = usePreferences();
  const savePreferences = useSavePreferences();
  const savedDefaults = preferences.data?.addDefaults ?? {};
  const [confirmedIds, setConfirmedIds] = useState<string[]>([]);
  const [search, setSearch] = useState(true);
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const [error, setError] = useState("");
  const existingIds = [
    ...(library.find((item) => item.id === selected.id)?.targets ?? []).map(
      (target) => target.instanceId,
    ),
    ...("existingInstanceIds" in selected
      ? selected.existingInstanceIds
      : selected.targets.map((target) => target.instanceId)),
    ...confirmedIds,
  ];
  // With a single instance to choose from, start with it selected.
  const [choices, setChoices] = useState<Record<string, TargetChoice>>(() => {
    const available = matching.filter(
      (instance) => !existingIds.includes(instance.id),
    );
    return available.length === 1
      ? {
          [available[0].id]: {
            enabled: true,
            qualityProfileId: 0,
            rootFolderPath: "",
          },
        }
      : {};
  });
  const targets = Object.entries(choices).filter(
    ([id, choice]) => choice.enabled && !existingIds.includes(id),
  );
  const incomplete = targets.find(
    ([, choice]) => !choice.qualityProfileId || !choice.rootFolderPath,
  );
  const incompleteName = incomplete
    ? matching.find((instance) => instance.id === incomplete[0])?.name
    : undefined;
  const targetName =
    targets.length === 1
      ? matching.find((instance) => instance.id === targets[0][0])?.name
      : undefined;
  async function add() {
    if (targets.length === 0 || incomplete || saveLock.current) return;
    setError("");
    const requestTargets = targets.map(([instanceId, choice]) => ({
      instanceId,
      qualityProfileId: choice.qualityProfileId,
      rootFolderPath: choice.rootFolderPath,
    }));
    saveLock.current = true;
    setSaving(true);
    try {
      const payload: AddMediaRequest = {
        media: {
          kind: selected.kind,
          tmdbId: selected.tmdbId,
          tvdbId: selected.tvdbId,
        },
        targets: requestTargets,
        search,
      };
      const result = await api<ActionResponse>("/api/media", {
        method: "POST",
        body: JSON.stringify(payload),
      });
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
      // Remember these choices so the next add starts from them.
      savePreferences.mutate({
        addDefaults: {
          ...savedDefaults,
          ...Object.fromEntries(
            requestTargets.map((target) => [
              target.instanceId,
              {
                qualityProfileId: target.qualityProfileId,
                rootFolderPath: target.rootFolderPath,
              },
            ]),
          ),
        },
      });
      notify(result.message, false, {
        label: "View title",
        href: mediaHref(selected),
      });
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
    <div data-add-media="">
      {onBack && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          disabled={saving}
          className={css({ mb: "14px", ml: "-8px" })}
        >
          <ArrowLeftIcon size={14} />
          Back to results
        </Button>
      )}
      <div
        className={css({
          display: "flex",
          gap: "16px",
          alignItems: "flex-start",
          pb: "20px",
          borderBottom: "1px solid token(colors.line)",
          mb: "20px",
        })}
      >
        <div
          className={css({
            width: "64px",
            height: "96px",
            position: "relative",
            borderRadius: "6px",
            overflow: "hidden",
            flexShrink: 0,
            bg: "elevated",
          })}
        >
          <Poster item={selected} sizes="64px" />
        </div>
        <div className={css({ minWidth: 0 })}>
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
              mt: "5px",
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
            {[
              selected.year || "TBA",
              selected.kind === "movie" ? "Movie" : "Show",
              selected.genres.slice(0, 2).join(" / "),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {selected.overview && (
            <p
              className={css({
                mt: "8px",
                color: "soft",
                fontSize: "12px",
                lineHeight: "1.6",
                lineClamp: 2,
              })}
            >
              {selected.overview}
            </p>
          )}
        </div>
      </div>
      <h3 className={css({ fontSize: "13px", fontWeight: "550", mb: "4px" })}>
        Where should it go?
      </h3>
      <p className={cx(mutedStyle, css({ fontSize: "12px", mb: "14px" }))}>
        Pick one or more instances. Each keeps its own quality profile.
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
            savedDefault={savedDefaults[instance.id]}
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
          <CheckField checked={search} onChange={setSearch} disabled={saving}>
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
          flexWrap: "wrap",
          gap: "12px",
          pt: "20px",
          mt: "20px",
          borderTop: "1px solid token(colors.line)",
        })}
      >
        <p
          aria-live="polite"
          className={css({ color: "subtle", fontSize: "12px" })}
        >
          {matching.length === 0
            ? ""
            : matching.every((instance) => existingIds.includes(instance.id))
              ? `Already on every ${selected.kind === "movie" ? "Radarr" : "Sonarr"} instance.`
              : targets.length === 0
                ? "Select an instance to continue."
                : incomplete
                  ? `Choose a quality profile and root folder for ${incompleteName ?? "each instance"}.`
                  : `${targets.length} ${targets.length === 1 ? "target" : "targets"} selected`}
        </p>
        <Button
          variant="primary"
          disabled={saving || targets.length === 0 || !!incomplete}
          onClick={add}
        >
          {saving ? <Spinner /> : <PlusIcon size={15} />}
          {saving
            ? "Adding..."
            : targetName
              ? `Add to ${targetName}`
              : targets.length
                ? `Add to ${targets.length} instances`
                : "Add to library"}
        </Button>
      </div>
    </div>
  );
}

function TargetOption({
  instance,
  existing,
  choice,
  savedDefault,
  onChange,
  disabled,
}: {
  instance: InstanceSummary;
  existing: boolean;
  choice?: TargetChoice;
  savedDefault?: AddDefault;
  onChange: (choice: TargetChoice) => void;
  disabled: boolean;
}) {
  const enabled = choice?.enabled ?? false;
  const queryClient = useQueryClient();
  const options = useQuery({
    ...instanceOptionsQuery(instance.id),
    enabled: enabled && !existing,
  });
  function prefetchOptions() {
    if (!existing && !disabled && !enabled) {
      void queryClient.prefetchQuery(instanceOptionsQuery(instance.id));
    }
  }
  const data = options.data;
  const profile = choice?.qualityProfileId || 0;
  const folder = choice?.rootFolderPath || "";
  // Once options load, start from the last choice for this instance, or the
  // only option when there is just one. Only once, so a cleared choice stays
  // cleared.
  const defaulted = useRef(false);
  useEffect(() => {
    if (!data || !enabled || existing || defaulted.current) return;
    defaulted.current = true;
    const pick = <T,>(items: T[], saved: (item: T) => boolean) =>
      items.find(saved) ?? (items.length === 1 ? items[0] : undefined);
    const nextProfile =
      profile ||
      pick(data.profiles, (item) => item.id === savedDefault?.qualityProfileId)
        ?.id ||
      0;
    const nextFolder =
      folder ||
      pick(
        data.rootFolders,
        (item) => item.path === savedDefault?.rootFolderPath,
      )?.path ||
      "";
    if (nextProfile !== profile || nextFolder !== folder)
      onChange({
        enabled,
        qualityProfileId: nextProfile,
        rootFolderPath: nextFolder,
      });
  }, [data, enabled, existing, profile, folder, savedDefault, onChange]);
  return (
    <fieldset
      aria-label={instance.name}
      onMouseEnter={prefetchOptions}
      onFocus={prefetchOptions}
      className={css({
        minWidth: 0,
        border: "1px solid",
        borderColor: enabled ? "accent" : "line",
        borderRadius: "8px",
        bg: enabled ? "elevated" : "surface",
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
            className={css({ flex: 1, minHeight: "24px" })}
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
    </fieldset>
  );
}
