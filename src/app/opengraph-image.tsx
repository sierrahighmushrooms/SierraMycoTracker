import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Sierra Myco Lab — Modern Mushroom Cultivation & Diagnostics";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          padding: "80px",
          background:
            "linear-gradient(135deg, #030508 0%, #0c1220 55%, #1a1030 100%)",
          color: "#f8fafc",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 40 }}>
          <span style={{ fontSize: 64 }}>🍄</span>
          <span style={{ fontWeight: 700 }}>Sierra Myco Lab</span>
        </div>
        <div
          style={{
            marginTop: 40,
            fontSize: 68,
            fontWeight: 800,
            lineHeight: 1.1,
            maxWidth: 900,
          }}
        >
          Master Your Mushroom Cultivation
        </div>
        <div style={{ marginTop: 28, fontSize: 30, color: "#94a3b8", maxWidth: 860 }}>
          Batch lineage tracking, sterilization logs, yield analytics, and AI
          diagnostics — cloud-synced across every device.
        </div>
      </div>
    ),
    { ...size },
  );
}
