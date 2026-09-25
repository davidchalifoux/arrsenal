"use client";

import {
  ArrowClockwiseIcon,
  ArrowDownIcon,
  CheckCircleIcon,
  EyeIcon,
  EyeSlashIcon,
  FilmSlateIcon,
  PencilSimpleIcon,
  PlugIcon,
  PlusIcon,
  SquaresFourIcon,
  TelevisionIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { css, cx } from "@styled-system/css";
import {
  type ReactNode,
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
} from "react";
import { z } from "zod";
import { api } from "@/lib/client";
import type { ActionResponse, InstanceSummary } from "@/lib/types";
import { Page, PageHeader, PageToolbar, ToolbarButton } from "./page-header";
import {
  Button,
  inputStyle,
  labelStyle,
  Modal,
  mutedStyle,
  Notice,
  panelStyle,
  Spinner,
} from "./ui";

const instanceSchema = z.object({
  kind: z.enum(["sonarr", "radarr"]),
  name: z.string().trim().min(1, "Give this instance a name.").max(100),
  url: z
    .string()
    .trim()
    .max(2048)
    .pipe(z.url({ error: "Enter a valid http:// or https:// instance URL." }))
    .refine((value) => {
      try {
        const url = new URL(value);
        return (
          ["http:", "https:"].includes(url.protocol) &&
          !url.username &&
          !url.password &&
          !url.search &&
          !url.hash &&
          !value.includes("\\")
        );
      } catch {
        return false;
      }
    }, "Use HTTP(S) without credentials, query parameters, or fragments."),
  apiKey: z
    .string()
    .trim()
    .min(1, "Enter the instance's API key.")
    .max(512)
    .regex(
      /^[!-~]+$/,
      "API keys cannot contain spaces or non-ASCII characters.",
    ),
});

const editInstanceSchema = instanceSchema.extend({
  apiKey: z.union([z.string().trim().length(0), instanceSchema.shape.apiKey]),
});

type InstanceForm = z.infer<typeof instanceSchema>;
const emptyForm: InstanceForm = {
  kind: "sonarr",
  name: "",
  url: "",
  apiKey: "",
};
const fieldErrorStyle = css({ color: "negative", fontSize: "12px" });
const connectionColumns =
  "minmax(0, 1.4fr) minmax(0, 1.6fr) 130px minmax(170px, auto)";

export function Settings({
  instances,
  onRefresh,
  notify,
  autoOpen = false,
  onAutoOpened,
  onDismiss,
  notice,
}: {
  instances: InstanceSummary[];
  onRefresh: () => void;
  notify: (message: string, error?: boolean) => void;
  autoOpen?: boolean;
  onAutoOpened?: () => void;
  onDismiss?: () => void;
  /** Page-level notices, shown under the page title. */
  notice?: ReactNode;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<InstanceSummary | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showKey, setShowKey] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof InstanceForm, string>>
  >({});
  const [error, setError] = useState<string>();
  const [tested, setTested] = useState<{ version?: string }>();
  const [busy, setBusy] = useState<"test" | "save" | null>(null);
  const request = useRef<{
    action: "test" | "save";
    controller: AbortController;
  } | null>(null);
  const autoOpened = useRef(false);
  const [removing, setRemoving] = useState<InstanceSummary | null>(null);
  const [removeError, setRemoveError] = useState<string>();
  const [removeBusy, setRemoveBusy] = useState(false);
  const removeLock = useRef(false);

  function changeOpen(next: boolean) {
    if (request.current?.action === "save") return;
    if (!next) {
      request.current?.controller.abort();
      request.current = null;
      setForm(emptyForm);
      setEditing(null);
      setShowKey(false);
      setFieldErrors({});
      setError(undefined);
      setTested(undefined);
      setBusy(null);
      onDismiss?.();
    }
    setOpen(next);
  }

  const openFromParent = useEffectEvent(() => {
    changeOpen(true);
    onAutoOpened?.();
  });

  useEffect(() => {
    if (autoOpen && !autoOpened.current) {
      autoOpened.current = true;
      openFromParent();
    } else if (!autoOpen) {
      autoOpened.current = false;
    }
  }, [autoOpen]);

  useEffect(
    () => () => {
      request.current?.controller.abort();
      request.current = null;
    },
    [],
  );

  function changeField<Key extends keyof InstanceForm>(
    key: Key,
    value: InstanceForm[Key],
  ) {
    if (request.current?.action === "save") return;
    // A result belongs only to the exact form that was tested, even in flight.
    request.current?.controller.abort();
    request.current = null;
    setBusy(null);
    setForm((previous) => ({ ...previous, [key]: value }));
    setTested(undefined);
    setError(undefined);
    setFieldErrors({});
  }

  async function connect(action: "test" | "save") {
    if (request.current) return;
    const parsed = (
      editing?.hasApiKey ? editInstanceSchema : instanceSchema
    ).safeParse(form);
    if (!parsed.success) {
      const errors: Partial<Record<keyof InstanceForm, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof InstanceForm;
        errors[key] ??= issue.message;
      }
      setFieldErrors(errors);
      setTested(undefined);
      setError(undefined);
      return;
    }

    const current = { action, controller: new AbortController() };
    request.current = current;
    setBusy(action);
    setError(undefined);
    setFieldErrors({});
    setTested(undefined);
    const init = {
      method: editing && action === "save" ? "PATCH" : "POST",
      body: JSON.stringify({
        ...parsed.data,
        apiKey: editing && !parsed.data.apiKey ? undefined : parsed.data.apiKey,
      }),
      signal: current.controller.signal,
    };

    try {
      if (action === "test") {
        const result = await api<ActionResponse & { version?: string }>(
          editing
            ? `/api/instances/${encodeURIComponent(editing.id)}/test`
            : "/api/instances/test",
          init,
        );
        if (request.current !== current) return;
        if (!result.success) throw new Error(result.message);
        setTested({ version: result.version });
      } else {
        const result = await api<{ instance: InstanceSummary }>(
          editing
            ? `/api/instances/${encodeURIComponent(editing.id)}`
            : "/api/instances",
          init,
        );
        if (request.current !== current) return;
        if (!result.instance?.connected)
          throw new Error(
            "The instance could not be verified. Refresh status before retrying.",
          );
        request.current = null;
        changeOpen(false);
        notify(`${result.instance.name} ${editing ? "updated" : "connected"}.`);
      }
    } catch (cause) {
      if (request.current !== current) return;
      const message =
        cause instanceof Error
          ? cause.message
          : "Could not connect to the instance.";
      setError(message);
      if (action === "save") notify(message, true);
    } finally {
      if (request.current === current) {
        request.current = null;
        setBusy(null);
      }
    }
  }

  async function disconnect() {
    if (!removing || removeLock.current) return;
    removeLock.current = true;
    setRemoveBusy(true);
    setRemoveError(undefined);
    try {
      const result = await api<ActionResponse>(
        `/api/instances/${encodeURIComponent(removing.id)}`,
        { method: "DELETE" },
      );
      if (!result.success) throw new Error(result.message);
      setRemoving(null);
      notify(result.message);
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : "Could not disconnect the instance.";
      setRemoveError(message);
      notify(message, true);
    } finally {
      removeLock.current = false;
      setRemoveBusy(false);
    }
  }

  return (
    <Page
      className={css({ minWidth: 0 })}
      aria-labelledby={`${id}-heading`}
      toolbar={
        <PageToolbar label="Connection actions">
          <ToolbarButton
            icon={PlusIcon}
            label="Add instance"
            onClick={() => changeOpen(true)}
          />
          {instances.length > 0 && (
            <ToolbarButton
              icon={ArrowClockwiseIcon}
              label="Refresh status"
              title="Refresh all instance statuses"
              onClick={() => onRefresh()}
            />
          )}
        </PageToolbar>
      }
    >
      <PageHeader id={`${id}-heading`} title="Connections">
        <p
          className={css({
            width: "100%",
            order: 1,
            mt: "-8px",
            color: "muted",
            fontSize: "13px",
          })}
        >
          Sonarr and Radarr instances Arrsenal reads from and sends changes to.
          API keys stay on the server.
        </p>
      </PageHeader>
      {notice}

      {instances.length ? (
        <div
          className={css({
            border: "1px solid token(colors.line)",
            borderRadius: "14px",
            overflow: "hidden",
            bg: "surface",
          })}
        >
          <div
            aria-hidden="true"
            className={css({
              display: { base: "none", md: "grid" },
              gridTemplateColumns: connectionColumns,
              gap: "16px",
              alignItems: "center",
              height: "38px",
              px: "18px",
              bg: "raised",
              borderBottom: "1px solid token(colors.line)",
              fontSize: "11px",
              fontWeight: "600",
              letterSpacing: ".05em",
              textTransform: "uppercase",
              color: "subtle",
            })}
          >
            <span>Instance</span>
            <span>URL</span>
            <span>Status</span>
            <span className={css({ textAlign: "right" })}>Actions</span>
          </div>
          {instances.map((instance) => {
            const healthy =
              instance.connected && instance.hasApiKey && !instance.error;
            const sonarr = instance.kind === "sonarr";
            return (
              <article
                key={instance.id}
                aria-label={`${instance.name} connection`}
                className={css({
                  display: "grid",
                  gridTemplateColumns: {
                    base: "minmax(0, 1fr) auto",
                    md: connectionColumns,
                  },
                  gap: "8px 16px",
                  alignItems: "center",
                  minHeight: "64px",
                  px: "18px",
                  py: "12px",
                  borderBottom: "1px solid token(colors.lineSoft)",
                  _last: { borderBottom: 0 },
                })}
                style={
                  healthy
                    ? undefined
                    : {
                        background:
                          "color-mix(in srgb, var(--warning) 5%, transparent)",
                      }
                }
              >
                <div className={css({ minWidth: 0 })}>
                  <h2
                    className={css({
                      fontSize: "14px",
                      fontWeight: "600",
                      overflowWrap: "anywhere",
                    })}
                  >
                    {instance.name}
                  </h2>
                  <p
                    className={css({
                      color: "muted",
                      fontSize: "12px",
                      mt: "2px",
                    })}
                  >
                    {sonarr ? "Sonarr" : "Radarr"} ·{" "}
                    <span>{instance.version || "Version not reported"}</span>
                  </p>
                </div>
                <p
                  title={instance.url}
                  className={css({
                    display: { base: "none", md: "block" },
                    fontFamily: "mono",
                    fontSize: "12px",
                    color: "muted",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  })}
                >
                  {instance.url}
                </p>
                <span
                  className={css({
                    justifySelf: "start",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    height: "24px",
                    px: "9px",
                    borderRadius: "999px",
                    fontSize: "12px",
                    fontWeight: "500",
                    color: healthy ? "positive" : "warning",
                  })}
                  style={{
                    background: `color-mix(in srgb, var(${healthy ? "--positive" : "--warning"}) 12%, transparent)`,
                  }}
                >
                  <span
                    aria-hidden="true"
                    className={css({
                      width: "6px",
                      height: "6px",
                      borderRadius: "50%",
                      bg: "currentColor",
                    })}
                  />
                  {healthy ? "Connected" : "Unavailable"}
                </span>
                <div
                  className={css({
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: "4px",
                    gridColumn: { base: "1 / -1", md: "auto" },
                  })}
                >
                  <Button
                    size="sm"
                    aria-label={`Edit ${instance.name}`}
                    onClick={() => {
                      setEditing(instance);
                      setForm({
                        kind: instance.kind,
                        name: instance.name,
                        url: instance.url,
                        apiKey: "",
                      });
                      changeOpen(true);
                    }}
                  >
                    <PencilSimpleIcon size={14} /> Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Disconnect ${instance.name}`}
                    onClick={() => {
                      setRemoveError(undefined);
                      setRemoving(instance);
                    }}
                    styles={css.raw({ color: "negative" })}
                  >
                    Disconnect
                  </Button>
                </div>
                {!healthy && (
                  <p
                    role="alert"
                    className={css({
                      gridColumn: "1 / -1",
                      display: "flex",
                      gap: "8px",
                      color: "warning",
                      fontSize: "12px",
                      lineHeight: "1.5",
                      overflowWrap: "anywhere",
                    })}
                  >
                    <WarningIcon
                      size={14}
                      aria-hidden="true"
                      className={css({ flexShrink: 0, mt: "2px" })}
                    />
                    {instance.error ||
                      (!instance.hasApiKey
                        ? "The API key is missing. Edit this instance to add its API key."
                        : "Could not reach this instance. Check its URL and network, then refresh status.")}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <div
          className={cx(
            panelStyle,
            css({
              px: { base: "20px", md: "36px" },
              py: "36px",
              textAlign: "center",
            }),
          )}
        >
          <div
            className={css({
              display: "grid",
              placeItems: "center",
              width: "44px",
              height: "44px",
              mx: "auto",
              mb: "16px",
              bg: "elevated",
              border: "1px solid token(colors.line)",
              borderRadius: "10px",
              color: "accent",
            })}
          >
            <PlugIcon size={24} />
          </div>
          <h2
            className={css({
              fontSize: "21px",
              fontWeight: "550",
              letterSpacing: "-.5px",
            })}
          >
            Bring your library together
          </h2>
          <p
            className={cx(
              mutedStyle,
              css({ maxWidth: "400px", mx: "auto", mt: "8px" }),
            )}
          >
            Connect your first instance to browse your media and manage
            downloads without switching apps.
          </p>
          <figure
            aria-label="Example connection layout, not connected"
            className={css({ maxWidth: "380px", mx: "auto", my: "24px" })}
          >
            <div
              className={css({
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: "12px",
              })}
            >
              {(["sonarr", "radarr"] as const).map((kind) => (
                <div
                  key={kind}
                  className={css({
                    p: "14px",
                    border: "1px solid token(colors.line)",
                    borderRadius: "10px",
                    bg: "canvas",
                    textAlign: "left",
                  })}
                >
                  <div
                    className={css({
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      fontSize: "12px",
                      color: kind === "sonarr" ? "info" : "warning",
                    })}
                  >
                    {kind === "sonarr" ? (
                      <TelevisionIcon size={18} />
                    ) : (
                      <FilmSlateIcon size={18} />
                    )}
                    {kind === "sonarr" ? "Sonarr" : "Radarr"}
                  </div>
                  <p
                    className={css({
                      color: "subtle",
                      fontSize: "11px",
                      mt: "7px",
                    })}
                  >
                    {kind === "sonarr" ? "Your shows" : "Your movies"}
                  </p>
                </div>
              ))}
            </div>
            <div
              aria-hidden="true"
              className={css({
                display: "flex",
                justifyContent: "space-around",
                color: "subtle",
                py: "7px",
              })}
            >
              <ArrowDownIcon size={17} />
              <ArrowDownIcon size={17} />
            </div>
            <div
              className={css({
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                border: "1px solid token(colors.line)",
                borderRadius: "10px",
                bg: "elevated",
                px: "20px",
                py: "10px",
                fontSize: "12px",
              })}
            >
              <SquaresFourIcon size={17} className={css({ color: "accent" })} />{" "}
              One library in Arrsenal
            </div>
          </figure>
          <Button size="sm" variant="primary" onClick={() => changeOpen(true)}>
            <PlusIcon size={15} /> Connect first instance
          </Button>
        </div>
      )}

      <Modal
        open={open}
        onOpenChange={changeOpen}
        title={editing ? "Edit instance" : "Connect an instance"}
        description={
          editing
            ? "Update your connection details. Saving also verifies your settings."
            : "Link Sonarr or Radarr using its address and API key. Connecting also verifies your settings."
        }
      >
        {open && (
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void connect("save");
            }}
            aria-busy={busy === "save"}
          >
            <fieldset
              disabled={busy === "save"}
              className={css({
                display: "grid",
                gap: "17px",
                minWidth: 0,
                border: 0,
                p: 0,
                m: 0,
              })}
            >
              <fieldset
                aria-label="Instance type"
                className={css({
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: "10px",
                  m: 0,
                  p: 0,
                  border: 0,
                  minWidth: 0,
                })}
              >
                {(
                  [
                    ["sonarr", "Sonarr", "Shows"],
                    ["radarr", "Radarr", "Movies"],
                  ] as const
                ).map(([kind, name, hint]) => (
                  <label
                    key={kind}
                    className={css({
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      p: "12px 14px",
                      borderRadius: "11px",
                      border: "1px solid token(colors.lineStrong)",
                      bg: "canvas",
                      cursor: "pointer",
                      "&:has(input:checked)": {
                        borderColor: "accent",
                        bg: "elevated",
                        boxShadow:
                          "0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent)",
                      },
                    })}
                  >
                    <input
                      type="radio"
                      name={`${id}-kind`}
                      value={kind}
                      checked={form.kind === kind}
                      onChange={() => changeField("kind", kind)}
                      className={css({ m: 0 })}
                    />
                    <span
                      className={css({
                        display: "flex",
                        flexDirection: "column",
                        gap: "1px",
                      })}
                    >
                      <span
                        className={css({ fontSize: "14px", fontWeight: "600" })}
                      >
                        {name}
                      </span>
                      <span
                        className={css({ fontSize: "12px", color: "muted" })}
                      >
                        {hint}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>
              <label className={labelStyle} htmlFor={`${id}-name`}>
                Instance name
                <input
                  id={`${id}-name`}
                  className={inputStyle}
                  value={form.name}
                  onChange={(event) => changeField("name", event.target.value)}
                  placeholder={
                    form.kind === "sonarr" ? "Sonarr HD" : "Radarr 4K"
                  }
                  autoComplete="off"
                  maxLength={100}
                  aria-invalid={!!fieldErrors.name}
                  aria-describedby={
                    fieldErrors.name ? `${id}-name-error` : undefined
                  }
                />
                {fieldErrors.name && (
                  <span
                    id={`${id}-name-error`}
                    role="alert"
                    className={fieldErrorStyle}
                  >
                    {fieldErrors.name}
                  </span>
                )}
              </label>
              <label className={labelStyle} htmlFor={`${id}-url`}>
                Instance URL
                <input
                  id={`${id}-url`}
                  type="url"
                  className={inputStyle}
                  value={form.url}
                  onChange={(event) => changeField("url", event.target.value)}
                  placeholder={
                    form.kind === "sonarr"
                      ? "http://localhost:8989"
                      : "http://localhost:7878"
                  }
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={2048}
                  aria-invalid={!!fieldErrors.url}
                  aria-describedby={`${id}-url-hint${fieldErrors.url ? ` ${id}-url-error` : ""}`}
                />
                {fieldErrors.url && (
                  <span
                    id={`${id}-url-error`}
                    role="alert"
                    className={fieldErrorStyle}
                  >
                    {fieldErrors.url}
                  </span>
                )}
              </label>
              <p
                id={`${id}-url-hint`}
                className={css({
                  color: "muted",
                  fontSize: "11px",
                  lineHeight: "1.7",
                  mt: "-9px",
                  overflowWrap: "anywhere",
                })}
              >
                Use an address reachable from the Arrsenal server. Running in
                Docker? Try <code>host.docker.internal</code> instead of
                localhost for a service on your host. Reverse-proxy base paths
                are supported.
              </p>
              <div className={labelStyle}>
                <label htmlFor={`${id}-key`}>API key</label>
                <div className={css({ position: "relative" })}>
                  <input
                    id={`${id}-key`}
                    type={showKey ? "text" : "password"}
                    className={cx(inputStyle, css({ pr: "45px" }))}
                    value={form.apiKey}
                    onChange={(event) =>
                      changeField("apiKey", event.target.value)
                    }
                    placeholder={
                      editing?.hasApiKey
                        ? "Leave blank to keep the saved key"
                        : "Paste your API key"
                    }
                    autoComplete="new-password"
                    autoCapitalize="none"
                    spellCheck={false}
                    maxLength={512}
                    aria-invalid={!!fieldErrors.apiKey}
                    aria-describedby={`${id}-key-hint${fieldErrors.apiKey ? ` ${id}-key-error` : ""}`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={showKey ? "Hide API key" : "Show API key"}
                    aria-pressed={showKey}
                    onClick={() => setShowKey((value) => !value)}
                    className={css({
                      position: "absolute",
                      right: "4px",
                      top: "4px",
                    })}
                  >
                    {showKey ? (
                      <EyeSlashIcon size={17} />
                    ) : (
                      <EyeIcon size={17} />
                    )}
                  </Button>
                </div>
                {fieldErrors.apiKey && (
                  <span
                    id={`${id}-key-error`}
                    role="alert"
                    className={fieldErrorStyle}
                  >
                    {fieldErrors.apiKey}
                  </span>
                )}
                <p
                  id={`${id}-key-hint`}
                  className={css({
                    color: "muted",
                    fontSize: "11px",
                    fontWeight: "400",
                    lineHeight: "1.6",
                  })}
                >
                  {editing?.hasApiKey &&
                    "Leave blank to keep the saved API key, or enter a new one to replace it. "}
                  Find it in {form.kind === "sonarr" ? "Sonarr" : "Radarr"}{" "}
                  under Settings / General / Security.
                </p>
              </div>
            </fieldset>

            <div className={css({ display: "grid", gap: "12px", mt: "20px" })}>
              {error && (
                <Notice error>
                  <span
                    className={css({ overflowWrap: "anywhere", minWidth: 0 })}
                  >
                    {error}
                  </span>
                </Notice>
              )}
              {tested && (
                <output
                  className={css({
                    display: "flex",
                    gap: "8px",
                    alignItems: "flex-start",
                    color: "positive",
                    fontSize: "12px",
                    lineHeight: "1.6",
                  })}
                >
                  <CheckCircleIcon
                    size={17}
                    className={css({ flexShrink: 0, mt: "1px" })}
                  />
                  <span>
                    Connection verified
                    {tested.version ? ` (version ${tested.version})` : ""}. Not
                    saved yet.
                  </span>
                </output>
              )}
              {busy === "save" && (
                <output className={mutedStyle}>
                  Verifying and saving. Keep this dialog open until the request
                  finishes.
                </output>
              )}
              <div
                className={css({
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "10px",
                  borderTop: "1px solid token(colors.line)",
                  pt: "18px",
                })}
              >
                <Button
                  type="button"
                  size="sm"
                  disabled={!!busy}
                  onClick={() => void connect("test")}
                >
                  {busy === "test" ? (
                    <Spinner size={15} />
                  ) : (
                    <PlugIcon size={15} />
                  )}
                  {busy === "test" ? "Testing..." : "Test connection"}
                </Button>
                <Button
                  size="sm"
                  type="submit"
                  variant="primary"
                  disabled={!!busy}
                >
                  {busy === "save" ? (
                    <Spinner size={15} />
                  ) : editing ? (
                    <PencilSimpleIcon size={15} />
                  ) : (
                    <PlusIcon size={15} />
                  )}
                  {editing
                    ? busy === "save"
                      ? "Saving..."
                      : "Save changes"
                    : busy === "save"
                      ? "Connecting..."
                      : "Connect instance"}
                </Button>
              </div>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={!!removing}
        onOpenChange={(next) => {
          if (!next && !removeLock.current) setRemoving(null);
        }}
        title="Disconnect instance?"
        description="This removes the connection from Arrsenal only."
      >
        <div className={css({ display: "grid", gap: "18px", minWidth: 0 })}>
          <p className={cx(mutedStyle, css({ overflowWrap: "anywhere" }))}>
            <strong className={css({ color: "ink", fontWeight: "550" })}>
              {removing?.name}
            </strong>{" "}
            will no longer appear in your library or download queue here. This
            does not delete any upstream media, files, or downloads in Sonarr,
            Radarr, or your download client. You can reconnect at any time.
          </p>
          {removeError && (
            <Notice error>
              <span className={css({ overflowWrap: "anywhere", minWidth: 0 })}>
                {removeError}
              </span>
            </Notice>
          )}
          <div
            className={css({
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "flex-end",
              gap: "10px",
            })}
          >
            <Button
              size="sm"
              disabled={removeBusy}
              onClick={() => setRemoving(null)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={removeBusy}
              onClick={() => void disconnect()}
            >
              {removeBusy ? <Spinner size={15} /> : <PlugIcon size={15} />}
              {removeBusy ? "Disconnecting..." : "Disconnect instance"}
            </Button>
          </div>
        </div>
      </Modal>
    </Page>
  );
}
