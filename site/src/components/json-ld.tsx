import type { Thing, WithContext } from "schema-dts";

/**
 * Renders schema.org structured data. Next.js has no metadata API for JSON-LD,
 * so its guide recommends a native script tag, with `<` escaped to prevent
 * breaking out of the tag.
 */
export function JsonLd<T extends Thing>({ data }: { data: WithContext<T> }) {
  return (
    <script
      type="application/ld+json"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: serialized JSON with < escaped
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
