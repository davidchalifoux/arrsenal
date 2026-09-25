import { css } from "@styled-system/css";
import type { ReactNode } from "react";
import { SettingsNavigation } from "./navigation";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className={css({
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr)",
        gap: { base: "16px", lg: "0" },
        alignItems: "start",
        minWidth: 0,
        // The shell drops its top gap for pages with an action bar, but on
        // small screens this section menu sits above that bar.
        "&:has([role=toolbar]) > nav": { mt: "18px" },
      })}
    >
      <SettingsNavigation />
      <div className={css({ minWidth: 0 })}>{children}</div>
    </div>
  );
}
