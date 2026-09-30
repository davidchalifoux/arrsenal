import { css } from "@styled-system/css";
import { container, eyebrow, sectionLead, sectionTitle } from "./styles";

const columns = [
  {
    title: "Arrsenal gives you",
    tone: "ink",
    items: [
      "One library across every instance",
      "Adding to several instances at once",
      "A combined queue, History, and Blocklist",
      "One Wanted list and one calendar",
      "Search and file management per target",
    ],
  },
  {
    title: "Sonarr and Radarr keep",
    tone: "muted",
    items: [
      "Indexers and download clients",
      "Quality profiles and root folders",
      "Media management and renaming",
      "Your existing data and history",
      "Their role as the source of truth",
    ],
  },
] as const;

export function Companion() {
  return (
    <section
      className={css({
        py: { base: "20", md: "28" },
        borderTopWidth: "1px",
        borderColor: "line",
      })}
    >
      <div
        className={`${container} ${css({
          display: "grid",
          gridTemplateColumns: { base: "1fr", lg: "5fr 7fr" },
          gap: { base: "10", lg: "16" },
        })}`}
      >
        <div>
          <p className={eyebrow}>Works with your setup</p>
          <h2 className={`${sectionTitle} ${css({ mt: "4" })}`}>
            A companion, not a replacement
          </h2>
          <p className={`${sectionLead} ${css({ mt: "5" })}`}>
            Arrsenal talks to Sonarr and Radarr through their v3 APIs. There's
            no database and nothing to migrate. Removing a connection only
            removes Arrsenal's own settings, never your media.
          </p>
        </div>
        <div
          className={css({
            display: "grid",
            gridTemplateColumns: { base: "1fr", sm: "1fr 1fr" },
            gap: "4",
          })}
        >
          {columns.map((column) => (
            <div
              key={column.title}
              className={css({
                rounded: "xl",
                borderWidth: "1px",
                borderColor: "line",
                bg: column.tone === "ink" ? "surface" : "transparent",
                p: "6",
              })}
            >
              <h3 className={css({ fontWeight: "500" })}>{column.title}</h3>
              <ul
                className={css({
                  mt: "4",
                  display: "grid",
                  gap: "3",
                  fontSize: "sm",
                  color: column.tone === "ink" ? "soft" : "subtle",
                })}
              >
                {column.items.map((item) => (
                  <li
                    key={item}
                    className={css({
                      display: "flex",
                      gap: "3",
                      lineHeight: "1.5",
                    })}
                  >
                    <span
                      aria-hidden
                      className={css({
                        flexShrink: "0",
                        mt: "2",
                        w: "1.5",
                        h: "1.5",
                        rounded: "full",
                        bg: column.tone === "ink" ? "accent" : "faint",
                      })}
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
