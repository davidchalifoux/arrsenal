import { css, cx } from "@styled-system/css";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { panelStyle } from "@/components/ui";
import { settingsSections } from "./sections";

export const metadata = { title: "Settings | Arrsenal" };

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ connect?: string | string[] }>;
}) {
  const params = await searchParams;
  if (params.connect === "1") redirect("/settings/connections?connect=1");
  return (
    <section aria-labelledby="settings-heading">
      <PageHeader id="settings-heading" title="Settings" />
      <div className={css({ display: "grid", gap: "16px" })}>
        {settingsSections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className={cx(
              panelStyle,
              css({
                display: "block",
                p: "20px",
                _hover: { borderColor: "subtle", bg: "elevated" },
                _focusVisible: {
                  outline: "2px solid token(colors.accent)",
                  outlineOffset: "3px",
                },
              }),
            )}
          >
            <h2 className={css({ fontSize: "16px", fontWeight: "550" })}>
              {section.title}
            </h2>
            <p
              className={css({
                color: "muted",
                fontSize: "13px",
                mt: "8px",
                lineHeight: "1.7",
              })}
            >
              {section.description}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
