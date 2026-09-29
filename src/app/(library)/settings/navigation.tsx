"use client";

import {
  InfoIcon,
  PlugIcon,
  ShieldCheckIcon,
  SlidersHorizontalIcon,
} from "@phosphor-icons/react";
import { SectionNavigation } from "@/components/section-navigation";
import { settingsSections } from "./sections";

const icons = {
  "/settings/connections": PlugIcon,
  "/settings/security": ShieldCheckIcon,
  "/settings/about": InfoIcon,
} as Record<string, typeof PlugIcon>;

export function SettingsNavigation() {
  return (
    <SectionNavigation
      label="Settings sections"
      heading="Settings"
      items={settingsSections.map((section) => ({
        href: section.href,
        title: section.title,
        icon: icons[section.href] ?? SlidersHorizontalIcon,
      }))}
    />
  );
}
