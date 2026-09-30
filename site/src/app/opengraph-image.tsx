import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const alt =
  "Arrsenal: every Sonarr and Radarr instance in one library, next to its poster library view";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const fontDir = join(process.cwd(), "node_modules/geist/dist/fonts/geist-sans");

export default async function OpengraphImage() {
  const [regular, semibold, screenshot] = await Promise.all([
    readFile(join(fontDir, "Geist-Regular.ttf")),
    readFile(join(fontDir, "Geist-SemiBold.ttf")),
    readFile(join(process.cwd(), "public/library.png"), "base64"),
  ]);

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        overflow: "hidden",
        background: "#101010",
        backgroundImage:
          "radial-gradient(circle at 18% 90%, rgba(53, 197, 244, 0.16), transparent 45%), radial-gradient(circle at 60% 100%, rgba(255, 194, 48, 0.12), transparent 45%)",
        fontFamily: "Geist",
        color: "#ededed",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: 520,
          padding: "64px 0 64px 72px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <svg
            width="40"
            height="40"
            viewBox="0 0 64 64"
            fill="#e5e5e5"
            aria-hidden="true"
          >
            <path d="M4 54 26 10h12l11 22H35l-3-6-14 28Z" />
            <path d="M31 36h20l9 18H46l-4-8H26Z" />
          </svg>
          <span style={{ fontSize: 32, fontWeight: 600, letterSpacing: -0.5 }}>
            Arrsenal
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span
            style={{
              fontSize: 64,
              fontWeight: 600,
              lineHeight: 1.05,
              letterSpacing: -2.5,
            }}
          >
            Every instance.
          </span>
          <span
            style={{
              fontSize: 64,
              fontWeight: 600,
              lineHeight: 1.05,
              letterSpacing: -2.5,
              color: "#8c8c8c",
            }}
          >
            One library.
          </span>
          <span
            style={{
              marginTop: 28,
              fontSize: 26,
              lineHeight: 1.4,
              color: "#a6a6a6",
            }}
          >
            One home for your Sonarr and Radarr libraries.
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              width: 12,
              height: 12,
              borderRadius: 6,
              background: "#35c5f4",
            }}
          />
          <span
            style={{
              width: 12,
              height: 12,
              borderRadius: 6,
              background: "#ffc230",
            }}
          />
          <span style={{ marginLeft: 6, fontSize: 22, color: "#8c8c8c" }}>
            arrsenal.com
          </span>
        </div>
      </div>
      {/* The product, bleeding off the right edge. */}
      <div
        style={{
          position: "absolute",
          top: 72,
          left: 620,
          display: "flex",
          padding: 8,
          borderRadius: 18,
          border: "1px solid #363636",
          background: "#161616",
          boxShadow: "0 30px 80px rgba(0, 0, 0, 0.7)",
        }}
      >
        {/* biome-ignore lint/performance/noImgElement: ImageResponse renders plain img elements */}
        <img
          src={`data:image/png;base64,${screenshot}`}
          alt=""
          width={900}
          height={553}
          style={{ borderRadius: 12 }}
        />
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: "Geist", data: regular, weight: 400, style: "normal" },
        { name: "Geist", data: semibold, weight: 600, style: "normal" },
      ],
    },
  );
}
