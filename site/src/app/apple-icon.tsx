import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// The icon.svg glyph on a full square; iOS applies its own rounded mask.
export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#e5e5e5",
      }}
    >
      <svg
        width="144"
        height="144"
        viewBox="0 0 64 64"
        fill="#191919"
        aria-hidden="true"
      >
        <path d="M4 54 26 10h12l11 22H35l-3-6-14 28Z" />
        <path d="M31 36h20l9 18H46l-4-8H26Z" />
      </svg>
    </div>,
    size,
  );
}
