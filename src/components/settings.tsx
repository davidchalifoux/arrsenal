"use client";

import {
  ArrowClockwiseIcon,
  ArrowDownIcon,
  CheckCircleIcon,
  EyeIcon,
  EyeSlashIcon,
  FilmSlateIcon,
  PlugIcon,
  PlusIcon,
  ShieldCheckIcon,
  SquaresFourIcon,
  TelevisionIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { css, cx } from "@styled-system/css";
import { useEffect, useEffectEvent, useId, useRef, useState } from "react";
import { z } from "zod";
import { api } from "@/lib/client";
import type { ActionResponse, InstanceSummary } from "@/lib/types";
import {
  Button,
  inputStyle,
  labelStyle,
  Modal,
  mutedStyle,
  Notice,
  panelStyle,
  SelectField,
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

type InstanceForm = z.infer<typeof instanceSchema>;
const emptyForm: InstanceForm = {
  kind: "sonarr",
  name: "",
  url: "",
  apiKey: "",
};
const fieldErrorStyle = css({ color: "negative", fontSize: "12px" });

export function Settings({
  instances,
  onChanged,
  notify,
  autoOpen = false,
  onAutoOpened,
  onDismiss,
}: {
  instances: InstanceSummary[];
  onChanged: () => void;
  notify: (message: string, error?: boolean) => void;
  autoOpen?: boolean;
  onAutoOpened?: () => void;
  onDismiss?: () => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
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
    const parsed = instanceSchema.safeParse(form);
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
      method: "POST",
      body: JSON.stringify(parsed.data),
      signal: current.controller.signal,
    };

    try {
      if (action === "test") {
        const result = await api<ActionResponse & { version?: string }>(
          "/api/instances/test",
          init,
        );
        if (request.current !== current) return;
        if (!result.success) throw new Error(result.message);
        setTested({ version: result.version });
      } else {
        const result = await api<{ instance: InstanceSummary }>(
          "/api/instances",
          init,
        );
        if (request.current !== current) return;
        if (!result.instance?.connected)
          throw new Error(
            "The instance could not be verified. Refresh status before retrying.",
          );
        request.current = null;
        changeOpen(false);
        onChanged();
        notify(`${result.instance.name} connected.`);
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
      onChanged();
      notify(result.message);
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : "Could not disconnect the instance.";
      setRemoveError(message);
      notify(message, true);
      onChanged();
    } finally {
      removeLock.current = false;
      setRemoveBusy(false);
    }
  }

  return (
    <section className={css({ minWidth: 0 })} aria-labelledby={`${id}-heading`}>
      <div
        className={css({
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "16px",
          mb: "26px",
        })}
      >
        <div>
          <h1
            id={`${id}-heading`}
            className={css({
              fontSize: "25px",
              fontWeight: "600",
              letterSpacing: "-.7px",
            })}
          >
            Connections
          </h1>
          <p className={cx(mutedStyle, css({ mt: "5px" }))}>
            Your Sonarr and Radarr instances, connected in one place.
          </p>
        </div>
        <Button variant="primary" onClick={() => changeOpen(true)}>
          <PlusIcon size={15} /> Add instance
        </Button>
      </div>

      {instances.length ? (
        <div
          className={css({
            display: "grid",
            gridTemplateColumns: {
              base: "minmax(0, 1fr)",
              lg: "repeat(2, minmax(0, 1fr))",
            },
            gap: "16px",
          })}
        >
          {instances.map((instance) => {
            const healthy =
              instance.connected && instance.hasApiKey && !instance.error;
            const sonarr = instance.kind === "sonarr";
            return (
              <article
                key={instance.id}
                aria-label={`${instance.name} connection`}
                className={cx(panelStyle, css({ p: "20px", minWidth: 0 }))}
              >
                <div
                  className={css({
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                  })}
                >
                  <div
                    className={css({
                      display: "grid",
                      placeItems: "center",
                      width: "40px",
                      height: "40px",
                      borderRadius: "10px",
                      bg: "elevated",
                      color: sonarr ? "info" : "warning",
                      flexShrink: 0,
                    })}
                  >
                    {sonarr ? (
                      <TelevisionIcon size={21} />
                    ) : (
                      <FilmSlateIcon size={21} />
                    )}
                  </div>
                  <div className={css({ minWidth: 0, flex: 1 })}>
                    <h2
                      className={css({
                        fontSize: "15px",
                        fontWeight: "550",
                        overflowWrap: "anywhere",
                      })}
                    >
                      {instance.name}
                    </h2>
                    <p
                      className={css({
                        color: "muted",
                        fontSize: "11px",
                        mt: "3px",
                      })}
                    >
                      {sonarr ? "Sonarr / Shows" : "Radarr / Movies"}
                    </p>
                  </div>
                  <span
                    className={css({
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      color: healthy ? "positive" : "negative",
                      fontSize: "11px",
                      flexShrink: 0,
                    })}
                  >
                    <span
                      className={css({
                        width: "5px",
                        height: "5px",
                        borderRadius: "50%",
                        bg: "currentColor",
                      })}
                    />
                    {healthy ? "Connected" : "Unavailable"}
                  </span>
                </div>
                <p
                  title={instance.url}
                  className={css({
                    color: "muted",
                    fontSize: "12px",
                    overflowWrap: "anywhere",
                    my: "18px",
                  })}
                >
                  {instance.url}
                </p>
                {!healthy && (
                  <Notice error>
                    <span
                      className={css({ overflowWrap: "anywhere", minWidth: 0 })}
                    >
                      {instance.error ||
                        (!instance.hasApiKey
                          ? "The API key is missing. Reconnect this instance with its API key."
                          : "Could not reach this instance. Check its URL and network, then refresh status.")}
                    </span>
                  </Notice>
                )}
                <div
                  className={css({
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "10px",
                    borderTop: "1px solid token(colors.line)",
                    pt: "14px",
                    mt: healthy ? "0" : "16px",
                  })}
                >
                  <p
                    className={css({
                      fontSize: "11px",
                      color: "subtle",
                      overflowWrap: "anywhere",
                      minWidth: 0,
                    })}
                  >
                    Version{" "}
                    <span className={css({ color: "muted" })}>
                      {instance.version || "Not reported"}
                    </span>
                  </p>
                  <div className={css({ display: "flex", gap: "5px" })}>
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Refresh all instance statuses"
                      onClick={() => onChanged()}
                    >
                      <ArrowClockwiseIcon size={14} /> Refresh status
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Disconnect ${instance.name}`}
                      onClick={() => {
                        setRemoveError(undefined);
                        setRemoving(instance);
                      }}
                    >
                      <TrashIcon size={15} />
                    </Button>
                  </div>
                </div>
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
          <Button variant="primary" onClick={() => changeOpen(true)}>
            <PlusIcon size={15} /> Connect first instance
          </Button>
        </div>
      )}

      <aside
        className={cx(
          panelStyle,
          css({
            display: "flex",
            alignItems: "flex-start",
            gap: "13px",
            p: "20px",
            mt: "20px",
            bg: "transparent",
          }),
        )}
      >
        <ShieldCheckIcon
          size={21}
          className={css({ color: "muted", flexShrink: 0, mt: "2px" })}
        />
        <div className={css({ minWidth: 0 })}>
          <h2
            className={css({ fontSize: "13px", fontWeight: "550", mb: "5px" })}
          >
            Local by design
          </h2>
          <p
            className={cx(
              mutedStyle,
              css({ fontSize: "12px", overflowWrap: "anywhere" }),
            )}
          >
            Connections are stored in{" "}
            <code>~/.config/arrsenal/config.json</code>, or in{" "}
            <code>ARRSENAL_CONFIG_DIR</code> when set. Saved API keys stay on
            the server and are never included in library or connection
            responses.
          </p>
          <p
            className={css({
              color: "muted",
              fontSize: "12px",
              lineHeight: "1.7",
              mt: "6px",
            })}
          >
            For your own device or a trusted network only. Add authentication or
            a VPN before exposing Arrsenal remotely.
          </p>
        </div>
      </aside>

      <Modal
        open={open}
        onOpenChange={changeOpen}
        title="Connect an instance"
        description="Link Sonarr or Radarr using its address and API key. Connecting also verifies your settings."
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
              <div className={labelStyle}>
                <span>Instance type</span>
                <SelectField
                  label="Instance type"
                  value={form.kind}
                  onChange={(value) => {
                    if (value === "sonarr" || value === "radarr")
                      changeField("kind", value);
                  }}
                  options={[
                    { label: "Sonarr - Shows", value: "sonarr" },
                    { label: "Radarr - Movies", value: "radarr" },
                  ]}
                />
              </div>
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
                    placeholder="Paste your API key"
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
                <Button type="submit" variant="primary" disabled={!!busy}>
                  {busy === "save" ? (
                    <Spinner size={15} />
                  ) : (
                    <PlusIcon size={15} />
                  )}
                  {busy === "save" ? "Connecting..." : "Connect instance"}
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
            <Button disabled={removeBusy} onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={removeBusy}
              onClick={() => void disconnect()}
            >
              {removeBusy ? <Spinner size={15} /> : <PlugIcon size={15} />}
              {removeBusy ? "Disconnecting..." : "Disconnect instance"}
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
