"use client";

import { activitySections } from "@/components/activity-sections";
import { SectionNavigation } from "@/components/section-navigation";

export function ActivityNavigation() {
  return (
    <SectionNavigation
      label="Activity sections"
      heading="Activity"
      items={activitySections}
    />
  );
}
