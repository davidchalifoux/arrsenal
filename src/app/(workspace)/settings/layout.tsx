import { css } from "@styled-system/css";
import type { ReactNode } from "react";
import { SettingsNavigation } from "./navigation";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className={css({
        display: "grid",
        gridTemplateColumns: {
          base: "minmax(0, 1fr)",
          lg: "180px minmax(0, 1fr)",
        },
        gap: { base: "16px", lg: "32px" },
        alignItems: "start",
        minWidth: 0,
      })}
    >
      <SettingsNavigation />
      <div className={css({ minWidth: 0 })}>{children}</div>
    </div>
  );
}
