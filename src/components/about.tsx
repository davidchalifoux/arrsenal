"use client";

import { ArrowSquareOutIcon, GithubLogoIcon } from "@phosphor-icons/react";
import { css, cx } from "@styled-system/css";
import type { ReactNode } from "react";
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
  return (
    <section aria-labelledby="about-heading" className={css({ minWidth: 0 })}>
      <PageHeader id="about-heading" title="About" />
      <div
        className={cx(
          panelStyle,
          css({ p: "20px", maxWidth: "640px", display: "grid", gap: "18px" }),
        )}
      >
        <div>
          <h2 className={css({ fontSize: "18px", fontWeight: "600" })}>
            Arrsenal
          </h2>
          <p className={mutedStyle}>
            Your Sonarr and Radarr libraries, together.
          </p>
        </div>
        <dl>
          <dt className={mutedStyle}>Installed version</dt>
          <dd className={css({ fontSize: "15px", fontWeight: "550" })}>
            v{version}
          </dd>
        </dl>
        <div className={mutedStyle}>{children}</div>
        <div
          className={css({ display: "flex", flexWrap: "wrap", gap: "18px" })}
        >
          {[
            {
              label: "GitHub repository",
              href: repositoryUrl,
              Icon: GithubLogoIcon,
            },
            {
              label: "Releases",
              href: `${repositoryUrl}/releases`,
              Icon: ArrowSquareOutIcon,
            },
          ].map(({ label, href, Icon }) => (
            <a
              key={href}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={css({
                display: "inline-flex",
                alignItems: "center",
                gap: "7px",
                fontSize: "13px",
                color: "ink",
                textDecoration: "underline",
                textUnderlineOffset: "3px",
                _hover: { color: "accent" },
                _focusVisible: {
                  outline: "2px solid token(colors.accent)",
                  outlineOffset: "4px",
                },
              })}
            >
              <Icon size={16} aria-hidden="true" />
              {label}
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
