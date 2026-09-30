import { ArrowRightIcon, GithubLogoIcon } from "@phosphor-icons/react/ssr";
import { css } from "@styled-system/css";
import Image from "next/image";
import { container, primaryButton, repoUrl, secondaryButton } from "./styles";

const links = [
  { href: `${repoUrl}#readme`, label: "Documentation" },
  { href: `${repoUrl}/blob/main/docs/usage.md`, label: "Usage guide" },
  { href: `${repoUrl}/releases`, label: "Releases" },
  { href: `${repoUrl}/issues`, label: "Report an issue" },
];

export function Closing() {
  return (
    <section
      className={css({
        py: { base: "20", md: "28" },
        borderTopWidth: "1px",
        borderColor: "line",
        bgImage:
          "radial-gradient(50% 80% at 50% 100%, rgba(255, 255, 255, 0.05), transparent 70%)",
      })}
    >
      <div
        className={`${container} ${css({
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
        })}`}
      >
        <Image src="/icon.svg" alt="" width={56} height={56} />
        <h2
          className={css({
            mt: "8",
            fontSize: { base: "3xl", sm: "4xl", md: "5xl" },
            lineHeight: "1.08",
            letterSpacing: "-0.04em",
            fontWeight: "600",
          })}
        >
          {/* One sentence per line, so the break always lands on the period. */}
          <span className={css({ display: "block" })}>
            Stop switching tabs.
          </span>
          <span className={css({ display: "block", color: "subtle" })}>
            Start managing your library.
          </span>
        </h2>
        <p
          className={css({
            mt: "5",
            fontSize: { base: "md", md: "lg" },
            lineHeight: "1.6",
            color: "muted",
            textWrap: "balance",
          })}
        >
          Self-hosted, nothing to migrate, and running in minutes.
        </p>
        <div
          className={css({
            mt: "8",
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
            Star on GitHub
          </a>
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer
      className={css({
        borderTopWidth: "1px",
        borderColor: "line",
        pt: "10",
        pb: "8",
      })}
    >
      <div className={container}>
        <div
          className={css({
            display: "flex",
            flexDirection: { base: "column", md: "row" },
            alignItems: { base: "flex-start", md: "center" },
            justifyContent: "space-between",
            gap: "6",
          })}
        >
          <div>
            <p
              className={css({
                display: "flex",
                alignItems: "center",
                gap: "2",
                fontWeight: "600",
              })}
            >
              <Image src="/logo.svg" alt="" width={18} height={18} />
              Arrsenal
            </p>
            <p className={css({ mt: "1.5", fontSize: "sm", color: "subtle" })}>
              One home for your Sonarr and Radarr libraries.
            </p>
          </div>
          <nav aria-label="Footer">
            <ul
              className={css({
                display: "flex",
                flexWrap: "wrap",
                columnGap: "6",
                rowGap: "2",
                fontSize: "sm",
                color: "subtle",
              })}
            >
              {links.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className={css({ _hover: { color: "ink" } })}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <div
          className={css({
            mt: "8",
            pt: "6",
            borderTopWidth: "1px",
            borderColor: "line",
            display: "flex",
            flexDirection: { base: "column", md: "row" },
            justifyContent: "space-between",
            gap: "2",
            fontSize: "xs",
            lineHeight: "1.6",
            color: "faint",
          })}
        >
          <p>
            Arrsenal is not endorsed by TMDB, TheTVDB, Sonarr, or Radarr. Poster
            artwork belongs to its respective owners.
          </p>
          <p>
            Open source under the{" "}
            <a
              href={`${repoUrl}/blob/main/LICENSE`}
              className={css({
                color: "subtle",
                textDecoration: "underline",
                textUnderlineOffset: "3px",
                _hover: { color: "ink" },
              })}
            >
              GPL-3.0 license
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
