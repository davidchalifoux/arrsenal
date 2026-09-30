import { ArrowRightIcon, CheckIcon, XIcon } from "@phosphor-icons/react/ssr";
import { css } from "@styled-system/css";
import Image from "next/image";
import type { ReactNode } from "react";
import { container, eyebrow, sectionLead, sectionTitle } from "./styles";

const instances = [
  { name: "Sonarr HD", port: "8989", color: "sonarr" },
  { name: "Sonarr 4K", port: "8990", color: "sonarr" },
  { name: "Radarr HD", port: "7878", color: "radarr" },
  { name: "Radarr 4K", port: "7879", color: "radarr" },
] as const;

type Problem = {
  pain: string;
  painDetail: string;
  fix: string;
  fixDetail: string;
  visual?: ReactNode;
};

const problems: Problem[] = [
  {
    pain: "One library, split across four apps",
    painDetail:
      "Running separate HD and 4K instances means checking Sonarr HD, Sonarr 4K, Radarr HD, and Radarr 4K one by one just to answer “do I have this?”",
    fix: "Every title, merged, with every instance's status",
    fixDetail:
      "Matching titles combine into one entry. Each instance keeps its own availability and quality, shown side by side on every poster and row.",
    visual: <TargetChips />,
  },
  {
    pain: "Adding the same title over and over",
    painDetail:
      "Want a movie in HD and 4K? Search for it, pick a profile and root folder, then do it all again in the other instance.",
    fix: "Add once, to every instance you choose",
    fixDetail:
      "Pick the targets, set a quality profile and root folder for each, and add them together. Arrsenal remembers your last choice per instance, and if one target fails, you retry only that one.",
  },
  {
    pain: "Download queues scattered everywhere",
    painDetail:
      "A stalled import in one instance and a failed grab in another stay hidden until you check each Activity tab.",
    fix: "One combined queue, with bulk actions",
    fixDetail:
      "See progress from every instance in one table. Remove or blocklist items, grab pending releases, and retry imports one at a time or across a selection, with History and Blocklist alongside.",
  },
  {
    pain: "No single view of what's missing or coming up",
    painDetail:
      "Wanted lists and calendars live in each app separately, so the full picture of missing episodes and upcoming releases is never in one place.",
    fix: "One Wanted list and one calendar",
    fixDetail:
      "Wanted shows every monitored target missing files. Search them individually, by selection, or all at once. The calendar merges episodes and movie releases into one month and agenda.",
  },
  {
    pain: "Searching releases one app at a time",
    painDetail:
      "To look for a better release, you open the right instance, find the title again, and start an interactive search there.",
    fix: "Search from any title, for any target",
    fixDetail:
      "Start an automatic or manual search for any instance, season, or episode from the title's page. Results arrive in a sortable table with rejection reasons, and grabs ask for confirmation first.",
  },
  {
    pain: "Screens that go stale",
    painDetail:
      "With several dashboards open, it's easy to act on a queue or library that has already changed.",
    fix: "Live updates, and warnings when one breaks",
    fixDetail:
      "Library and queue changes stream in live from Sonarr and Radarr, with no interval polling. If an instance goes offline, the others stay visible and a persistent warning tells you which one.",
  },
];

export function Problems() {
  return (
    <section
      id="problems"
      className={css({
        py: { base: "20", md: "28" },
        borderTopWidth: "1px",
        borderColor: "line",
        scrollMarginTop: "16",
      })}
    >
      <div className={container}>
        <div
          className={css({
            display: "grid",
            gridTemplateColumns: { base: "1fr", lg: "1fr 1fr" },
            gap: { base: "10", lg: "16" },
            alignItems: "center",
          })}
        >
          <div>
            <p className={eyebrow}>The problem</p>
            <h2 className={`${sectionTitle} ${css({ mt: "4" })}`}>
              Sonarr and Radarr are great. Juggling several of them isn't.
            </h2>
            <p className={`${sectionLead} ${css({ mt: "5" })}`}>
              A separate 4K library is a popular setup, but it doubles every
              chore. Arrsenal connects to the instances you already run and
              gives them one front end.
            </p>
          </div>
          <TabSprawl />
        </div>

        <ol
          className={css({
            mt: { base: "14", md: "20" },
            borderTopWidth: "1px",
            borderColor: "line",
          })}
        >
          {problems.map((problem, index) => (
            <li
              key={problem.pain}
              className={css({
                display: "grid",
                gridTemplateColumns: { base: "1fr", md: "3rem 1fr 1fr" },
                columnGap: { md: "8", lg: "12" },
                rowGap: "5",
                py: { base: "8", md: "10" },
                borderBottomWidth: "1px",
                borderColor: "line",
              })}
            >
              <span
                className={css({
                  fontFamily: "mono",
                  fontSize: "sm",
                  color: "faint",
                  pt: "0.5",
                })}
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <h3
                  className={css({
                    display: "flex",
                    gap: "2.5",
                    fontSize: "lg",
                    fontWeight: "500",
                    color: "soft",
                    letterSpacing: "-0.01em",
                  })}
                >
                  <XIcon
                    size={18}
                    weight="bold"
                    aria-hidden
                    className={css({
                      flexShrink: "0",
                      mt: "1",
                      color: "negative",
                    })}
                  />
                  {problem.pain}
                </h3>
                <p
                  className={css({
                    mt: "2",
                    pl: "7",
                    color: "subtle",
                    lineHeight: "1.6",
                    textWrap: "pretty",
                  })}
                >
                  {problem.painDetail}
                </p>
              </div>
              <div
                className={css({
                  rounded: "xl",
                  borderWidth: "1px",
                  borderColor: "line",
                  bg: "surface",
                  p: "5",
                })}
              >
                <p
                  className={css({
                    display: "flex",
                    gap: "2.5",
                    fontSize: "lg",
                    fontWeight: "500",
                    letterSpacing: "-0.01em",
                  })}
                >
                  <CheckIcon
                    size={18}
                    weight="bold"
                    aria-hidden
                    className={css({
                      flexShrink: "0",
                      mt: "1",
                      color: "positive",
                    })}
                  />
                  {problem.fix}
                </p>
                <p
                  className={css({
                    mt: "2",
                    pl: "7",
                    color: "muted",
                    lineHeight: "1.6",
                    textWrap: "pretty",
                  })}
                >
                  {problem.fixDetail}
                </p>
                {problem.visual}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** Four instance tabs collapsing into one Arrsenal tab. */
function TabSprawl() {
  return (
    <div
      aria-hidden
      className={css({
        display: "grid",
        gridTemplateColumns: { base: "1fr", sm: "1fr auto 1fr" },
        alignItems: "center",
        gap: "5",
        rounded: "2xl",
        borderWidth: "1px",
        borderColor: "line",
        bg: "surface",
        p: { base: "5", md: "7" },
      })}
    >
      <div className={css({ display: "grid", gap: "2" })}>
        {instances.map((instance, index) => (
          <div
            key={instance.name}
            style={{ transform: `translateX(${index * 6}px)` }}
            className={css({
              display: "flex",
              alignItems: "center",
              gap: "2.5",
              h: "10",
              px: "3",
              rounded: "md",
              borderWidth: "1px",
              borderColor: "lineStrong",
              bg: "raised",
              fontSize: "sm",
              color: "muted",
            })}
          >
            <span
              className={css({
                w: "2",
                h: "2",
                rounded: "full",
                bg: instance.color === "sonarr" ? "sonarr" : "radarr",
              })}
            />
            {instance.name}
            <span
              className={css({
                ml: "auto",
                fontFamily: "mono",
                fontSize: "xs",
                color: "faint",
              })}
            >
              :{instance.port}
            </span>
          </div>
        ))}
      </div>
      <ArrowRightIcon
        size={20}
        className={css({
          justifySelf: "center",
          color: "faint",
          transform: { base: "rotate(90deg)", sm: "none" },
        })}
      />
      <div
        className={css({
          display: "flex",
          alignItems: "center",
          gap: "2.5",
          h: "12",
          px: "4",
          rounded: "lg",
          borderWidth: "1px",
          borderColor: "faint",
          bg: "elevated",
          fontWeight: "500",
          boxShadow: "0 12px 40px -12px rgba(0, 0, 0, 0.8)",
        })}
      >
        <Image src="/logo.svg" alt="" width={18} height={18} />
        Arrsenal
        <span
          className={css({
            ml: "auto",
            fontFamily: "mono",
            fontSize: "xs",
            color: "subtle",
          })}
        >
          :3000
        </span>
      </div>
    </div>
  );
}

/** A miniature of the per-instance status chips from the library view. */
function TargetChips() {
  const chips = [
    { label: "HD", status: "Available", color: "positive" },
    { label: "4K", status: "Downloading", color: "info" },
  ] as const;
  return (
    <div
      className={css({
        mt: "4",
        pl: "7",
        display: "flex",
        flexWrap: "wrap",
        gap: "2",
      })}
    >
      {chips.map((chip) => (
        <span
          key={chip.label}
          className={css({
            display: "inline-flex",
            alignItems: "center",
            gap: "1.5",
            h: "7",
            px: "2.5",
            rounded: "md",
            borderWidth: "1px",
            borderColor: "lineStrong",
            bg: "raised",
            fontSize: "xs",
            color: "soft",
          })}
        >
          <span
            className={css({
              w: "1.5",
              h: "1.5",
              rounded: "full",
              bg: chip.color === "positive" ? "positive" : "info",
            })}
          />
          {chip.label}
          <span className={css({ color: "subtle" })}>{chip.status}</span>
        </span>
      ))}
    </div>
  );
}
