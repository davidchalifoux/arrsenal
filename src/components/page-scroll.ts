"use client";

import { createContext, useContext } from "react";

export const PageScrollContext = createContext<HTMLElement | null>(null);

/** The scrolling body of the current page, once it has mounted. */
export function usePageScrollElement() {
  return useContext(PageScrollContext);
}
