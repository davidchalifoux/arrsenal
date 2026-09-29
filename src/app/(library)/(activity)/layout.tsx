import { css } from "@styled-system/css";
import type { ReactNode } from "react";
import { ActivityNavigation } from "./navigation";

export default function ActivityLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className={css({
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
      })}
    >
      <ActivityNavigation />
      {children}
    </div>
  );
}
