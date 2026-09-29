import {
  ClockCounterClockwiseIcon,
  DownloadSimpleIcon,
  ProhibitIcon,
} from "@phosphor-icons/react";
import type { SectionNavigationItem } from "./section-navigation";

export const activitySections: SectionNavigationItem[] = [
  { href: "/queue", title: "Queue", icon: DownloadSimpleIcon },
  { href: "/history", title: "History", icon: ClockCounterClockwiseIcon },
  { href: "/blocklist", title: "Blocklist", icon: ProhibitIcon },
];
