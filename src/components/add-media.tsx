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
import { useRef, useState } from "react";
import { api } from "@/lib/client";
import { instanceOptionsQuery } from "@/lib/instance-options-query";
import type {
  ActionResponse,
  AddMediaRequest,
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
  onAdded,
  notify,
  onConnect,
  onBack,
}: {
  open: boolean;
  onClose: () => void;
  seed: MediaItem | null;
  instances: InstanceSummary[];
  library: MediaItem[];
  onAdded: () => void;
  notify: (message: string, error?: boolean) => void;
  onConnect: () => void;
  onBack?: () => void;
}) {
  return (
    <Modal
      open={open && seed !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Add a quality target"
      description="One title. Your choice of instances and quality profiles."
      wide
    >
      {open && seed && (
        <AddMediaContent
          key={seed.id}
          seed={seed}
          instances={instances}
          library={library}
          onAdded={onAdded}
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
  onAdded,
  notify,
  onClose,
  onConnect,
  onBack,
}: Omit<Parameters<typeof AddMedia>[0], "open" | "seed"> & {
  seed: MediaItem;
}) {
  const [choices, setChoices] = useState<Record<string, TargetChoice>>({});
  const [confirmedIds, setConfirmedIds] = useState<string[]>([]);
  const [search, setSearch] = useState(true);
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const [error, setError] = useState("");
  const matching = instances.filter(
    (instance) =>
      instance.kind === (selected.kind === "series" ? "sonarr" : "radarr"),
  );
  const existing =
    library.find((item) => item.id === selected.id)?.targets ??
    selected.targets;
  const existingIds = [
    ...existing.map((target) => target.instanceId),
    ...confirmedIds,
  ];
  const targets = Object.entries(choices).filter(
    ([id, choice]) => choice.enabled && !existingIds.includes(id),
  );
  async function add() {
    if (targets.length === 0 || saveLock.current) return;
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
      {onBack && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
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
      <h3 className={css({ fontSize: "13px", fontWeight: "550", mb: "6px" })}>
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
  return (
    <fieldset
      aria-label={instance.name}
      onMouseEnter={prefetchOptions}
      onFocus={prefetchOptions}
      className={css({
        minWidth: 0,
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
    </fieldset>
  );
}
