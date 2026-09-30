import { GithubLogoIcon } from "@phosphor-icons/react/ssr";
import { css } from "@styled-system/css";
import Image from "next/image";
import { container, repoUrl } from "./styles";

const links = [
  { href: "#problems", label: "Why Arrsenal" },
  { href: "#features", label: "Features" },
  { href: "#install", label: "Install" },
];

export function Nav() {
  return (
    <header
      className={css({
        position: "sticky",
        top: "0",
        zIndex: "10",
        borderBottomWidth: "1px",
        borderColor: "line",
        bg: "rgba(16, 16, 16, 0.78)",
        backdropFilter: "blur(14px) saturate(140%)",
      })}
    >
      <nav
        aria-label="Main"
        className={`${container} ${css({
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          h: "16",
        })}`}
      >
        <a
          href="#top"
          className={css({
            display: "flex",
            alignItems: "center",
            gap: "2.5",
            fontWeight: "600",
            letterSpacing: "-0.01em",
          })}
        >
          <Image src="/logo.svg" alt="" width={24} height={24} preload />
          Arrsenal
        </a>
        <div
          className={css({
            display: "flex",
            alignItems: "center",
            gap: { base: "4", md: "8" },
          })}
        >
          <ul
            className={css({
              display: { base: "none", md: "flex" },
              gap: "7",
              fontSize: "sm",
              color: "muted",
            })}
          >
            {links.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className={css({ _hover: { color: "ink" } })}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
          <a
            href={repoUrl}
            className={css({
              display: "inline-flex",
              alignItems: "center",
              gap: "2",
              h: "9",
              px: "3.5",
              rounded: "md",
              fontSize: "sm",
              borderWidth: "1px",
              borderColor: "lineStrong",
              _hover: { bg: "raised" },
            })}
          >
            <GithubLogoIcon size={16} weight="fill" aria-hidden />
            GitHub
          </a>
        </div>
      </nav>
    </header>
  );
}
