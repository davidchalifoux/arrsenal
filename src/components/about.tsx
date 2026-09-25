"use client";

import {
  ArrowUpRightIcon,
  BookOpenIcon,
  BugIcon,
  GithubLogoIcon,
  RocketLaunchIcon,
} from "@phosphor-icons/react";
import { css, cx } from "@styled-system/css";
import type { ReactNode } from "react";
import { Logo } from "./logo";
import { PageHeader } from "./page-header";
import { mutedStyle, panelStyle } from "./ui";

export function About({
  version,
  repositoryUrl,
  children,
}: {
  version: string;
  repositoryUrl: string;
  children: ReactNode;
}) {
  const links = [
    {
      label: "GitHub repository",
      hint: "Source code and discussions",
      href: repositoryUrl,
      Icon: GithubLogoIcon,
    },
    {
      label: "Releases",
      hint: "Changelog for every version",
      href: `${repositoryUrl}/releases`,
      Icon: RocketLaunchIcon,
    },
    {
      label: "Documentation",
      hint: "Setup, configuration and security",
      href: `${repositoryUrl}#guides-and-reference`,
      Icon: BookOpenIcon,
    },
    {
      label: "Report an issue",
      hint: "Bugs and feature requests",
      href: `${repositoryUrl}/issues`,
      Icon: BugIcon,
    },
  ];
  return (
    <section aria-labelledby="about-heading" className={css({ minWidth: 0 })}>
      <PageHeader id="about-heading" title="About" />
      <div
        className={css({
          display: "grid",
          gap: "16px",
          maxWidth: "820px",
          minWidth: 0,
        })}
      >
        <div
          className={cx(
            panelStyle,
            css({
              display: "flex",
              alignItems: "center",
              gap: "18px",
              p: "22px",
              flexWrap: "wrap",
            }),
          )}
        >
          <span
            className={css({
              width: "56px",
              height: "56px",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
              borderRadius: "14px",
              bg: "elevated",
            })}
          >
            <Logo size={34} />
          </span>
          <div className={css({ flexGrow: 1, minWidth: "200px" })}>
            <h2
              className={css({
                fontSize: "18px",
                fontWeight: "600",
                letterSpacing: "-.3px",
              })}
            >
              Arrsenal
            </h2>
            <p className={mutedStyle}>
              One home for your Sonarr and Radarr libraries.
            </p>
          </div>
          <dl className={css({ textAlign: "right" })}>
            <dt
              className={css({
                fontSize: "11px",
                color: "subtle",
                textTransform: "uppercase",
                letterSpacing: ".05em",
              })}
            >
              Installed version
            </dt>
            <dd
              className={css({
                fontFamily: "mono",
                fontSize: "16px",
                fontWeight: "500",
              })}
            >
              v{version}
            </dd>
          </dl>
        </div>

        <div
          className={cx(
            panelStyle,
            mutedStyle,
            css({ p: "16px 20px", display: "grid", gap: "4px" }),
          )}
        >
          {children}
        </div>

        <ul
          className={css({
            display: "grid",
            gridTemplateColumns: {
              base: "minmax(0, 1fr)",
              md: "repeat(2, minmax(0, 1fr))",
            },
            gap: "12px",
            listStyle: "none",
            m: 0,
            p: 0,
          })}
        >
          {links.map(({ label, hint, href, Icon }) => (
            <li key={href}>
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={cx(
                  panelStyle,
                  css({
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    p: "14px 16px",
                    borderRadius: "12px",
                    transition: "border-color 150ms",
                    _hover: { borderColor: "faint" },
                  }),
                )}
              >
                <span
                  className={css({
                    width: "32px",
                    height: "32px",
                    display: "grid",
                    placeItems: "center",
                    flexShrink: 0,
                    borderRadius: "8px",
                    bg: "elevated",
                    color: "soft",
                  })}
                >
                  <Icon size={16} aria-hidden="true" />
                </span>
                <span
                  className={css({
                    flexGrow: 1,
                    display: "flex",
                    flexDirection: "column",
                    gap: "1px",
                  })}
                >
                  <span
                    className={css({ fontSize: "13px", fontWeight: "500" })}
                  >
                    {label}
                  </span>
                  <span className={css({ fontSize: "12px", color: "subtle" })}>
                    {hint}
                  </span>
                </span>
                <ArrowUpRightIcon
                  size={14}
                  aria-hidden="true"
                  className={css({ color: "subtle" })}
                />
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
