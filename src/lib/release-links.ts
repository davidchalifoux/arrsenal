import type { MediaItem } from "./types";

export function isMagnetLink(link: string) {
  return /^magnet:\?/i.test(link.trim());
}

/** Why a pasted torrent link can't be sent, or undefined when it can. */
export function torrentLinkProblem(link: string): string | undefined {
  const value = link.trim();
  if (isMagnetLink(value))
    return /[?&]xt=urn:bt[im]h:/i.test(value)
      ? undefined
      : "This magnet link has no info hash.";
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "Paste a magnet link or an HTTP(S) link to a .torrent file.";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    return "Paste a magnet link or an HTTP(S) link to a .torrent file.";
  // NZB links usually need the indexer's login, which the instance doesn't have.
  if (url.pathname.toLowerCase().endsWith(".nzb"))
    return "Download the NZB, then choose the file instead.";
  return undefined;
}

/** The release name a magnet link carries in its dn parameter. */
export function magnetName(link: string): string | undefined {
  const value = link.trim();
  if (!isMagnetLink(value)) return undefined;
  const name = new URLSearchParams(value.slice(value.indexOf("?") + 1))
    .get("dn")
    ?.trim();
  return name || undefined;
}

// Normalized to spellings Sonarr and Radarr recognize, so an overridden name
// keeps the quality its quality profile needs to accept the release.
const resolutions: [RegExp, string][] = [
  [/\b(2160p|4k|uhd)\b/i, "2160p"],
  [/\b1080[pi]\b/i, "1080p"],
  [/\b720p\b/i, "720p"],
  [/\b576p\b/i, "576p"],
  [/\b480p\b/i, "480p"],
];
const sources: [RegExp, string][] = [
  [/\bremux\b/i, "BluRay Remux"],
  [/\b(blu-?ray|bd(rip)?)\b/i, "BluRay"],
  [/\bweb-?dl\b/i, "WEB-DL"],
  [/\bweb-?rip\b/i, "WEBRip"],
  [/\bweb\b/i, "WEB-DL"],
  [/\bhdtv\b/i, "HDTV"],
  [/\b(dvd(rip)?|dvd-?r)\b/i, "DVD"],
];

function firstMatch(value: string, patterns: [RegExp, string][]) {
  return patterns.find(([pattern]) => pattern.test(value))?.[1];
}

/** A name Sonarr or Radarr always matches to this title, keeping any quality. */
export function overrideReleaseName(
  media: Pick<MediaItem, "kind" | "title" | "year">,
  sourceName = "",
) {
  const source = sourceName.replace(/[._]/g, " ");
  return [
    media.title,
    media.kind === "series" ? "S01" : media.year ? `(${media.year})` : "",
    firstMatch(source, resolutions),
    firstMatch(source, sources),
  ]
    .filter(Boolean)
    .join(" ");
}

const xmlEntities: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

/**
 * The release name for an uploaded NZB: its optional name field, or else the
 * file name, since indexers name downloads after the release.
 */
export function nzbReleaseName(text: string, fileName: string) {
  const meta = /<meta\s+type\s*=\s*["']name["']\s*>([^<]*)<\/meta>/i
    .exec(text)?.[1]
    ?.replace(/&(amp|lt|gt|quot|apos);/g, (_, entity) => xmlEntities[entity])
    .trim();
  return meta || fileName.replace(/\.(nzb|torrent)$/i, "").trim() || undefined;
}

export type ReleaseFileKind = "nzb" | "torrent";

const latin1 = new TextDecoder("latin1");

/** Reads a release file's kind from its content, whatever its extension. */
export function releaseFileKind(
  bytes: Uint8Array,
): ReleaseFileKind | undefined {
  if (torrentInfo(bytes)) return "torrent";
  const head = latin1.decode(bytes.subarray(0, 65536));
  return /<nzb[\s>]/i.test(head) ? "nzb" : undefined;
}

type Bencoded = Uint8Array | number | Bencoded[] | Map<string, Bencoded>;

// Enough of bencode to reach a torrent's info dictionary. Throws on bad input.
function bdecode(bytes: Uint8Array, start = 0, depth = 0): [Bencoded, number] {
  if (depth > 32) throw new Error("Too deep");
  const type = bytes[start];
  if (type === 0x69) {
    // i<digits>e
    const end = bytes.indexOf(0x65, start);
    if (end < 0) throw new Error("Unterminated integer");
    return [Number(latin1.decode(bytes.subarray(start + 1, end))), end + 1];
  }
  if (type === 0x6c || type === 0x64) {
    const list: Bencoded[] = [];
    const dict = new Map<string, Bencoded>();
    let offset = start + 1;
    while (bytes[offset] !== 0x65) {
      if (offset >= bytes.length) throw new Error("Unterminated container");
      if (type === 0x64) {
        const [key, afterKey] = bdecode(bytes, offset, depth + 1);
        if (!(key instanceof Uint8Array)) throw new Error("Invalid key");
        const [value, next] = bdecode(bytes, afterKey, depth + 1);
        dict.set(latin1.decode(key), value);
        offset = next;
      } else {
        const [value, next] = bdecode(bytes, offset, depth + 1);
        list.push(value);
        offset = next;
      }
    }
    return [type === 0x64 ? dict : list, offset + 1];
  }
  // <length>:<bytes>
  const colon = bytes.indexOf(0x3a, start);
  const length = Number(latin1.decode(bytes.subarray(start, colon)));
  if (colon < 0 || !Number.isSafeInteger(length) || length < 0)
    throw new Error("Invalid string");
  const end = colon + 1 + length;
  if (end > bytes.length) throw new Error("Truncated string");
  return [bytes.subarray(colon + 1, end), end];
}

function torrentInfo(bytes: Uint8Array) {
  if (bytes[0] !== 0x64) return undefined;
  try {
    const [root] = bdecode(bytes);
    const info = root instanceof Map ? root.get("info") : undefined;
    return info instanceof Map ? info : undefined;
  } catch {
    return undefined;
  }
}

/** A torrent file's own name, from its info dictionary. */
export function torrentFileName(bytes: Uint8Array): string | undefined {
  const info = torrentInfo(bytes);
  const name = info?.get("name.utf-8") ?? info?.get("name");
  return name instanceof Uint8Array
    ? new TextDecoder().decode(name).trim() || undefined
    : undefined;
}

/** The release name for an uploaded file, falling back to its file name. */
export function releaseFileName(
  bytes: Uint8Array,
  kind: ReleaseFileKind,
  fileName: string,
) {
  const fromFile = fileName.replace(/\.(nzb|torrent)$/i, "").trim();
  return kind === "torrent"
    ? torrentFileName(bytes) || fromFile || undefined
    : nzbReleaseName(
        new TextDecoder().decode(bytes.subarray(0, 65536)),
        fileName,
      );
}
