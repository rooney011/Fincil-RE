import { ImageResponse } from "next/og";
import { bestLineFor, loadPublicSession } from "./loader";

export const runtime = "nodejs";
export const alt = "Fincil Council debate verdict";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const COLORS = {
  bg: "#09090b",
  fg: "#fafafa",
  muted: "#a1a1aa",
  border: "#27272a",
  approved: "#34d399",
  rejected: "#f87171",
  miser: "#cbd5e1",
  visionary: "#fcd34d",
};

function formatINR(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

type Props = { params: { sessionId: string } };

export default async function OgImage({ params }: Props) {
  const debate = await loadPublicSession(params.sessionId);

  const approved = debate?.verdict === "approved";
  const verdictColor = approved ? COLORS.approved : COLORS.rejected;
  const verdictLabel = approved
    ? "APPROVED"
    : debate?.verdict === "rejected"
      ? "REJECTED"
      : "NOT FOUND";

  const query = debate ? truncate(debate.query, 90) : "Debate not found";
  const amount = debate ? formatINR(debate.amount) : "";
  const miserLine = debate ? truncate(bestLineFor(debate.transcript, "miser") ?? "—", 180) : "";
  const visionaryLine = debate
    ? truncate(bestLineFor(debate.transcript, "visionary") ?? "—", 180)
    : "";
  const mathLine = debate ? truncate(debate.finance.mathVerdict, 200) : "";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          backgroundColor: COLORS.bg,
          color: COLORS.fg,
          display: "flex",
          flexDirection: "column",
          padding: 56,
          fontFamily: "'sans-serif'",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              fontSize: 22,
              color: COLORS.muted,
              letterSpacing: 1,
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                backgroundColor: COLORS.fg,
                color: COLORS.bg,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: 16,
              }}
            >
              F
            </div>
            <span>FINCIL COUNCIL</span>
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: verdictColor,
              padding: "8px 16px",
              border: `2px solid ${verdictColor}`,
              borderRadius: 999,
              letterSpacing: 2,
            }}
          >
            {verdictLabel}
          </div>
        </div>

        {/* Query + amount */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: 36,
            gap: 12,
          }}
        >
          <div
            style={{
              fontSize: 56,
              fontWeight: 700,
              lineHeight: 1.1,
              letterSpacing: -1,
            }}
          >
            {query}
          </div>
          {amount && (
            <div style={{ fontSize: 28, color: COLORS.muted }}>
              {amount}
              {debate?.category ? ` · ${debate.category}` : ""}
            </div>
          )}
        </div>

        {/* Persona quotes */}
        {debate && (
          <div
            style={{
              display: "flex",
              gap: 24,
              marginTop: 36,
              flex: 1,
            }}
          >
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                padding: 20,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 12,
                gap: 10,
              }}
            >
              <div
                style={{
                  fontSize: 18,
                  color: COLORS.miser,
                  letterSpacing: 1,
                  fontWeight: 600,
                }}
              >
                THE MISER
              </div>
              <div style={{ fontSize: 22, lineHeight: 1.35 }}>{miserLine}</div>
            </div>
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                padding: 20,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 12,
                gap: 10,
              }}
            >
              <div
                style={{
                  fontSize: 18,
                  color: COLORS.visionary,
                  letterSpacing: 1,
                  fontWeight: 600,
                }}
              >
                THE VISIONARY
              </div>
              <div style={{ fontSize: 22, lineHeight: 1.35 }}>
                {visionaryLine}
              </div>
            </div>
          </div>
        )}

        {/* Math footer */}
        {mathLine && (
          <div
            style={{
              fontSize: 20,
              color: COLORS.muted,
              marginTop: 24,
              lineHeight: 1.4,
              display: "flex",
            }}
          >
            {mathLine}
          </div>
        )}
      </div>
    ),
    { ...size },
  );
}
