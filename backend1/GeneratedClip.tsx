import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

export type GeneratedClipProps = {
  subtitle?: string;
  content: string;
  topic?: string;
  seed?: number;
  durationSeconds?: number;
  emphasis?: string;
};

const COLORS = {
  bg: "#180e0b",
  primary: "#a0524a",
  accent: "#d4a0a0",
};

const Building2Icon: React.FC<{ color: string; size: number }> = ({ color, size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
    <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
    <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
    <path d="M10 6h4" />
    <path d="M10 10h4" />
    <path d="M10 14h4" />
    <path d="M10 18h4" />
  </svg>
);

const AlertOctagonIcon: React.FC<{ color: string; size: number }> = ({ color, size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2v6" />
    <path d="m15.5 4.5 4.5 4.5" />
    <path d="M22 8.5v7" />
    <path d="m19.5 15.5 4.5 4.5" />
    <path d="M12 16v6" />
    <path d="m8.5 19.5-4.5-4.5" />
    <path d="M2 15.5v-7" />
    <path d="m4.5 8.5-4.5-4.5" />
    <path d="m8 12-2-2" />
    <path d="m14 12 2-2" />
    <path d="m12 8 2 2" />
    <path d="m12 16-2 2" />
  </svg>
);

export const GeneratedClip: React.FC<GeneratedClipProps> = ({
  subtitle = "Cisco and Sophos warn: 63% vulnerable, recommend blocking entirely or sandboxing",
  content = "Expert Warning Panel",
  emphasis = "63% vulnerable — industry experts recommend blocking",
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const wipeProgress = interpolate(frame, [0, 22], [0, 1], {
    extrapolateRight: "clamp",
  });

  const easedWipe = 1 - Math.pow(1 - wipeProgress, 3);

  const counterValue = interpolate(frame, [0, 60], [0, 63], {
    extrapolateRight: "clamp",
  });

  const driftX = frame > 22 ? Math.sin(frame / 80) * 2 : 0;

  const iconScale = spring({ frame, from: 0, to: 1, fps, config: { damping: 12 } });
  const emphasisOpacity = interpolate(frame, [30, 50], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg, overflow: "hidden" }}>
      <svg
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
        }}
      >
        <filter id="grainFilter">
          <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="4" seed={5} result="noise" />
          <feColorMatrix type="saturate" values="0" result="monoNoise" />
          <feBlend in="SourceGraphic" in2="monoNoise" mode="multiply" result="blend" />
          <feComponentTransfer in="blend" result="finalNoise">
            <feFuncA type="linear" slope={0.15} />
          </feComponentTransfer>
        </filter>
        <rect width="100%" height="100%" filter="url(#grainFilter)" />
      </svg>

      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: `${easedWipe * 100}%`,
          height: "100%",
          backgroundColor: COLORS.primary,
          opacity: 0.9,
        }}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 32,
          paddingHorizontal: 40,
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: `translate(-50%, -50%) translateX(${driftX}px)`,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
            opacity: iconScale,
          }}
        >
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: 16,
              backgroundColor: "rgba(160, 82, 74, 0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: `2px solid ${COLORS.primary}`,
            }}
          >
            <Building2Icon color={COLORS.accent} size={40} />
          </div>
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: 16,
              backgroundColor: "rgba(160, 82, 74, 0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: `2px solid ${COLORS.primary}`,
            }}
          >
            <AlertOctagonIcon color={COLORS.accent} size={40} />
          </div>
        </div>

        <div
          style={{
            fontSize: 48,
            fontWeight: 700,
            color: COLORS.accent,
            textAlign: "center",
            letterSpacing: -1,
          }}
        >
          {content}
        </div>

        <div
          style={{
            fontSize: 72,
            fontWeight: 800,
            color: COLORS.accent,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {Math.round(counterValue)}%
        </div>

        <div
          style={{
            fontSize: 24,
            color: COLORS.accent,
            opacity: 0.8,
            textAlign: "center",
            maxWidth: width * 0.8,
            lineHeight: 1.4,
          }}
        >
          vulnerable
        </div>

        <div
          style={{
            fontSize: 28,
            fontWeight: 600,
            color: COLORS.accent,
            textAlign: "center",
            opacity: emphasisOpacity,
            marginTop: 16,
            paddingHorizontal: 24,
            paddingVertical: 12,
            backgroundColor: "rgba(160, 82, 74, 0.4)",
            borderRadius: 8,
          }}
        >
          {emphasis}
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 60,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          paddingHorizontal: 20,
        }}
      >
        <div
          style={{
            fontSize: 22,
            color: COLORS.accent,
            textAlign: "center",
            opacity: 0.9,
            maxWidth: width * 0.85,
            lineHeight: 1.5,
          }}
        >
          {subtitle}
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 12,
          right: 16,
          fontSize: 11,
          color: COLORS.primary,
          opacity: 0.5,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        8/8
      </div>
    </AbsoluteFill>
  );
};
