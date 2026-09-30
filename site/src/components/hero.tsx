import { ArrowRightIcon, GithubLogoIcon } from "@phosphor-icons/react/ssr";
import { css } from "@styled-system/css";
import Image from "next/image";
import { container, primaryButton, repoUrl, secondaryButton } from "./styles";

// Grouped in pairs so a narrow screen breaks between pairs, never leaving a
// separator stranded at the end of a line.
const highlights = [
  ["Open source", "Self-hosted"],
  ["Runs in Docker", "No database"],
];

const separator = css({ color: "faint", px: "2.5" });

function Separator({ className = separator }: { className?: string }) {
  return (
    <>
      <span aria-hidden className={className}>
        ·
      </span>
      {/* Screen readers skip the dot, so give them a pause instead. */}
      <span className={css({ srOnly: true })}>, </span>
    </>
  );
}

export function Hero() {
  return (
    <section
      id="top"
      className={css({
        position: "relative",
        overflow: "hidden",
        pt: { base: "16", md: "24" },
        pb: { base: "16", md: "24" },
      })}
    >
      {/* Sonarr blue and Radarr amber meeting behind the product. */}
      <div
        aria-hidden
        className={css({
          position: "absolute",
          inset: "0",
          pointerEvents: "none",
          bgImage:
            "radial-gradient(40% 36% at 30% 58%, rgba(53, 197, 244, 0.13), transparent 70%), radial-gradient(40% 36% at 70% 58%, rgba(255, 194, 48, 0.1), transparent 70%)",
        })}
      />
      <div className={`${container} ${css({ position: "relative" })}`}>
        <div
          className={css({
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
          })}
        >
          <p
            className={css({
              display: "inline-flex",
              alignItems: "center",
              gap: "2",
              h: "8",
              px: "3.5",
              rounded: "full",
              borderWidth: "1px",
              borderColor: "lineStrong",
              bg: "surface",
              fontSize: "sm",
              color: "soft",
            })}
          >
            <span className={css({ display: "flex", gap: "1" })} aria-hidden>
              <span
                className={css({
                  w: "2",
                  h: "2",
                  rounded: "full",
                  bg: "sonarr",
                })}
              />
              <span
                className={css({
                  w: "2",
                  h: "2",
                  rounded: "full",
                  bg: "radarr",
                })}
              />
            </span>
            A companion for Sonarr and Radarr
          </p>
          <h1
            className={css({
              mt: "6",
              maxW: "880px",
              fontSize: { base: "4xl", sm: "5xl", md: "6xl", lg: "7xl" },
              lineHeight: "1.02",
              letterSpacing: "-0.045em",
              fontWeight: "600",
              textWrap: "balance",
            })}
          >
            Every instance. One library.
          </h1>
          <p
            className={css({
              mt: "6",
              maxW: "640px",
              fontSize: { base: "lg", md: "xl" },
              lineHeight: "1.55",
              color: "muted",
              textWrap: "pretty",
            })}
          >
            Arrsenal brings your movies, shows, and download queues into one web
            interface, even when your HD and 4K libraries live on separate
            Sonarr and Radarr instances.
          </p>
          <div
            className={css({
              mt: "9",
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              gap: "3",
            })}
          >
            <a href="#install" className={primaryButton}>
              Install with Docker
              <ArrowRightIcon size={16} weight="bold" aria-hidden />
            </a>
            <a href={repoUrl} className={secondaryButton}>
              <GithubLogoIcon size={16} weight="fill" aria-hidden />
              View on GitHub
            </a>
          </div>
          <p
            className={css({
              mt: "7",
              display: "flex",
              flexDirection: { base: "column", sm: "row" },
              alignItems: "center",
              rowGap: "1.5",
              fontSize: "sm",
              color: "subtle",
            })}
          >
            {highlights.map((pair, index) => (
              <span key={pair[0]} className={css({ display: "flex" })}>
                {index > 0 && (
                  <Separator
                    className={css({
                      display: { base: "none", sm: "inline" },
                      color: "faint",
                      px: "2.5",
                    })}
                  />
                )}
                {pair[0]}
                <Separator />
                {pair[1]}
              </span>
            ))}
          </p>
        </div>

        <figure className={css({ mt: { base: "14", md: "20" } })}>
          <div
            className={css({
              rounded: { base: "lg", md: "xl" },
              borderWidth: "1px",
              borderColor: "lineStrong",
              bg: "surface",
              p: { base: "1", md: "1.5" },
              boxShadow:
                "0 40px 120px -30px rgba(0, 0, 0, 0.9), 0 0 0 1px rgba(255, 255, 255, 0.02)",
            })}
          >
            <Image
              src="/library.png"
              alt="Arrsenal's library in poster view, showing movies and shows from four Sonarr and Radarr instances with HD and 4K availability on every title"
              width={2880}
              height={1770}
              preload
              sizes="(min-width: 1160px) 1100px, 100vw"
              className={css({
                display: "block",
                w: "full",
                h: "auto",
                rounded: { base: "md", md: "lg" },
              })}
            />
          </div>
          <figcaption
            className={css({
              mt: "4",
              textAlign: "center",
              fontSize: "xs",
              color: "faint",
            })}
          >
            Two Sonarr and two Radarr instances in one view. Poster artwork
            belongs to its respective owners.
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
