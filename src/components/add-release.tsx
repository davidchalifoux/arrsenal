"use client";

import { ArrowDownIcon, FileIcon, XIcon } from "@phosphor-icons/react";
import { css } from "@styled-system/css";
import Link from "next/link";
import { type DragEvent, useId, useRef, useState } from "react";
import { api, sizeLabel } from "@/lib/client";
import { usePreferences } from "@/lib/preferences";
import {
  magnetName,
  overrideReleaseName,
  type ReleaseFileKind,
  releaseFileKind,
  releaseFileName,
  torrentLinkProblem,
} from "@/lib/release-links";
import type { ActionResponse, MediaItem, MediaTarget } from "@/lib/types";
import { browserAddress } from "./arrsenal-address";
import {
  Button,
  CheckField,
  inputRaw,
  inputStyle,
  labelStyle,
  Modal,
  mutedStyle,
  Notice,
  SelectField,
  Spinner,
} from "./ui";

const hintStyle = css({ color: "muted", fontSize: "11px", lineHeight: "1.6" });

// Matches the server's limit on uploaded release files.
const maxFileBytes = 10 * 1024 * 1024;

type ReleaseFile = {
  fileName: string;
  size: number;
  kind: ReleaseFileKind;
  data: string;
  name?: string;
};

const fileKindLabels: Record<ReleaseFileKind, string> = {
  nzb: "NZB",
  torrent: "Torrent",
};

async function readReleaseFile(file: File): Promise<ReleaseFile> {
  if (file.size > maxFileBytes)
    throw new Error("Release files can be at most 10 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  // The content decides, so a misnamed file still goes out the right way.
  const kind = releaseFileKind(bytes);
  if (!kind) throw new Error("This file isn't an NZB or a torrent file.");
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return {
    fileName: file.name,
    size: file.size,
    kind,
    data: btoa(binary),
    name: releaseFileName(bytes, kind, file.name),
  };
}

export function AddRelease({
  media,
  target,
  onTarget,
  onClose,
  notify,
}: {
  media: MediaItem;
  target: MediaTarget;
  onTarget: (target: MediaTarget) => void;
  onClose: () => void;
  notify: (message: string, error?: boolean) => void;
}) {
  const id = useId();
  const preferences = usePreferences();
  const sendLock = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [link, setLink] = useState("");
  const [upload, setUpload] = useState<ReleaseFile | null>(null);
  const [dragging, setDragging] = useState(false);
  const [override, setOverride] = useState(false);
  const [customName, setCustomName] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const linkProblem = link.trim() ? torrentLinkProblem(link) : undefined;
  const ready = upload !== null || (Boolean(link.trim()) && !linkProblem);
  const sourceName = upload ? upload.name : magnetName(link);
  // Without a name in the link or file, the override is the only name there is.
  const overriding = override || (ready && !sourceName);
  const name = overriding ? customName : (sourceName ?? "");
  const noun = media.kind === "movie" ? "movie" : "show";
  const address = preferences.data?.arrsenalUrl || browserAddress();

  function refreshName(next?: string) {
    setError("");
    if (!override || !customName)
      setCustomName(overrideReleaseName(media, next));
  }

  async function chooseFile(file: File | undefined) {
    if (!file || sending) return;
    try {
      const next = await readReleaseFile(file);
      setUpload(next);
      setLink("");
      refreshName(next.name);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to read file.");
    }
  }

  function clearFile() {
    setUpload(null);
    if (fileInput.current) fileInput.current.value = "";
    refreshName();
  }

  function dragFile(event: DragEvent) {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    setDragging(event.type !== "dragleave");
  }

  async function send() {
    if (sendLock.current || !ready || !name.trim()) return;
    sendLock.current = true;
    setSending(true);
    setError("");
    try {
      const result = await api<ActionResponse>("/api/releases/push", {
        method: "POST",
        body: JSON.stringify({
          instanceId: target.instanceId,
          remoteId: target.remoteId,
          kind: media.kind,
          title: name.trim(),
          ...(upload ? { file: upload.data } : { link: link.trim() }),
        }),
      });
      if (!result.success) throw new Error(result.message);
      notify(result.message);
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to send release.",
      );
    } finally {
      sendLock.current = false;
      setSending(false);
    }
  }

  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open && !sendLock.current) onClose();
      }}
      title="Add release"
      description={`Send an NZB, torrent file or torrent link to ${target.instanceName} for ${media.title}. Your instance's quality rules still apply.`}
    >
      <form
        className={css({
          display: "grid",
          // Without minmax(0, …) a long file name widens the column past the dialog.
          gridTemplateColumns: "minmax(0, 1fr)",
          gap: "18px",
          minWidth: 0,
        })}
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
        onDragEnter={dragFile}
        onDragOver={dragFile}
        onDragLeave={(event) => {
          // Only leaving the form itself ends the drag, not moving between children.
          if (!event.currentTarget.contains(event.relatedTarget as Node))
            dragFile(event);
        }}
        onDrop={(event) => {
          if (!event.dataTransfer.files.length) return;
          event.preventDefault();
          setDragging(false);
          void chooseFile(event.dataTransfer.files[0]);
        }}
      >
        {media.targets.length > 1 && (
          <SelectField
            label="Instance"
            disabled={sending}
            value={target.instanceId}
            options={media.targets.map((item) => ({
              value: item.instanceId,
              label: item.instanceName,
            }))}
            onChange={(value) => {
              const next = media.targets.find(
                (item) => item.instanceId === value,
              );
              if (next) onTarget(next);
            }}
          />
        )}
        <div className={labelStyle}>
          <label htmlFor={upload ? undefined : `${id}-link`}>Release</label>
          <input
            ref={fileInput}
            type="file"
            hidden
            aria-label="Release file"
            accept=".nzb,.torrent,application/x-nzb,application/x-bittorrent"
            onChange={(event) => void chooseFile(event.target.files?.[0])}
          />
          {upload ? (
            <div
              className={css(inputRaw, {
                display: "flex",
                alignItems: "center",
                gap: "10px",
                pr: "6px",
              })}
            >
              <FileIcon
                size={16}
                aria-hidden="true"
                className={css({ flexShrink: 0, color: "accent" })}
              />
              <span
                title={upload.fileName}
                className={css({
                  flex: 1,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontSize: "13px",
                })}
              >
                {upload.fileName}
              </span>
              <span
                className={css({
                  flexShrink: 0,
                  px: "5px",
                  py: "1px",
                  border: "1px solid token(colors.line)",
                  borderRadius: "4px",
                  color: "muted",
                  fontSize: "10px",
                })}
              >
                {fileKindLabels[upload.kind]}
              </span>
              <span
                className={css({
                  flexShrink: 0,
                  color: "muted",
                  fontSize: "11px",
                })}
              >
                {sizeLabel(upload.size)}
              </span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Remove file"
                disabled={sending}
                onClick={clearFile}
                styles={css.raw({ width: "28px", height: "28px" })}
              >
                <XIcon size={14} />
              </Button>
            </div>
          ) : (
            <div
              className={css({
                display: "flex",
                gap: "8px",
                borderRadius: "11px",
                outline: dragging ? "2px dashed token(colors.accent)" : "none",
                outlineOffset: "3px",
              })}
            >
              <input
                id={`${id}-link`}
                className={inputStyle}
                value={link}
                onChange={(event) => {
                  setLink(event.target.value);
                  refreshName(magnetName(event.target.value));
                }}
                placeholder="Paste a magnet or .torrent link"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={8192}
                disabled={sending}
                aria-invalid={Boolean(linkProblem)}
                aria-describedby={`${id}-source-hint`}
              />
              <Button
                type="button"
                disabled={sending}
                onClick={() => fileInput.current?.click()}
                styles={css.raw({ height: "40px", flexShrink: 0 })}
              >
                <FileIcon size={15} />
                Choose file
              </Button>
            </div>
          )}
          <span id={`${id}-source-hint`} className={hintStyle}>
            {linkProblem ? (
              <span className={css({ color: "negative" })}>{linkProblem}</span>
            ) : upload ? (
              <>
                {target.instanceName} downloads this{" "}
                {upload.kind === "nzb" ? "NZB" : "torrent file"} from {address}.{" "}
                <Link
                  href="/settings/connections"
                  className={css({
                    color: "accent",
                    _hover: { textDecoration: "underline" },
                  })}
                >
                  Change address
                </Link>
              </>
            ) : (
              "Or drag an .nzb or .torrent file here."
            )}
          </span>
        </div>
        {ready && (
          <>
            <div className={labelStyle}>
              <label htmlFor={`${id}-name`}>Release name</label>
              <input
                id={`${id}-name`}
                className={inputStyle}
                value={name}
                onChange={(event) => setCustomName(event.target.value)}
                readOnly={!overriding}
                disabled={sending}
                placeholder={overrideReleaseName(media)}
                autoComplete="off"
                spellCheck={false}
                maxLength={500}
                aria-describedby={`${id}-name-hint`}
              />
              <span id={`${id}-name-hint`} className={hintStyle}>
                {overriding
                  ? `${target.instanceName} reads the ${media.kind === "series" ? "season, episodes" : "year"} and quality from this name. Keep a quality like 1080p BluRay in it, or your quality profile may reject the release.`
                  : `${target.instanceName} matches this name to a ${noun} on its own. Check it is the release you meant.`}
              </span>
            </div>
            <CheckField
              checked={overriding}
              disabled={sending || !ready || !sourceName}
              onChange={(value) => {
                setOverride(value);
                setError("");
              }}
            >
              Override name so {target.instanceName} files it under{" "}
              {media.title}
            </CheckField>
            {ready && !sourceName && (
              <p className={mutedStyle}>
                This {upload ? "file" : "link"} doesn&apos;t include a release
                name, so one was made from the {noun}&apos;s title.
              </p>
            )}
          </>
        )}
        {error && <Notice error>{error}</Notice>}
        <div
          className={css({
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "flex-end",
            gap: "10px",
          })}
        >
          <Button type="button" disabled={sending} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={sending || !ready || !name.trim()}
          >
            {sending ? <Spinner size={15} /> : <ArrowDownIcon size={15} />}
            {sending ? "Sending..." : `Send to ${target.instanceName}`}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
