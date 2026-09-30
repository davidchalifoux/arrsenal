import { css } from "@styled-system/css";

export const repoUrl = "https://github.com/davidchalifoux/arrsenal";

export const container = css({
  w: "full",
  maxW: "1160px",
  mx: "auto",
  px: { base: "4", md: "8" },
});

export const eyebrow = css({
  fontFamily: "mono",
  fontSize: "xs",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "subtle",
});

export const sectionTitle = css({
  fontSize: { base: "3xl", md: "4xl" },
  lineHeight: "1.1",
  letterSpacing: "-0.03em",
  fontWeight: "600",
  textWrap: "balance",
});

export const sectionLead = css({
  fontSize: { base: "md", md: "lg" },
  lineHeight: "1.6",
  color: "muted",
  maxW: "620px",
  textWrap: "pretty",
});

const buttonBase = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "2",
  h: "11",
  px: "5",
  rounded: "lg",
  fontSize: "sm",
  fontWeight: "500",
  transition: "background 150ms, border-color 150ms, color 150ms",
  _focusVisible: {
    outline: "2px solid",
    outlineColor: "accent",
    outlineOffset: "2px",
  },
} as const;

export const primaryButton = css({
  ...buttonBase,
  bg: "ink",
  color: "canvas",
  _hover: { bg: "white" },
});

export const secondaryButton = css({
  ...buttonBase,
  bg: "surface",
  color: "ink",
  borderWidth: "1px",
  borderColor: "lineStrong",
  _hover: { bg: "raised", borderColor: "faint" },
});
