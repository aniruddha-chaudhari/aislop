import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, spring, Easing } from "remotion";

export type GeneratedClipProps = {
  subtitle?: string;
  content: string;
  topic?: string;
  seed?: number;
  durationSeconds?: number;
  emphasis?: string;
};

export const GeneratedClip: React.FC<GeneratedClipProps> = ({
  content,
  emphasis = "The real",
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const videoWidth = width;
  const videoHeight = height;

  const progress = frame / fps;

  const messageEntrance = spring({
    frame,
    fps,
    config: { damping: 200 },
  });

  const sweepProgress = interpolate(
    progress,
    [0.3, 1.5],
    [0, 1],
    { extrapolateRight: "clamp" }
  );

  const commandReveal = spring({
    frame: frame - 60,
    fps,
    config: { damping: 200 },
  });

  const threatPulse = interpolate(
    progress,
    [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4],
    [0.6, 1, 0.7, 1, 0.8, 1, 0.7, 1, 0.8]
  );

  const messageX = interpolate(messageEntrance, [0, 1], [-300, videoWidth * 0.25]);
  const messageOpacity = interpolate(messageEntrance, [0, 0.5, 1], [0, 0.5, 1]);

  const hiddenLayerX = interpolate(sweepProgress, [0, 1], [videoWidth * 0.25, videoWidth * 0.55]);
  const hiddenLayerOpacity = interpolate(
    sweepProgress,
    [0, 0.3, 0.7, 1],
    [0, 0.9, 0.9, 0]
  );

  const aiPulse = interpolate(
    progress,
    [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4],
    [0.3, 1, 0.4, 1, 0.5, 0.8, 0.6, 0.4]
  );

  const commandX = interpolate(commandReveal, [0, 1], [videoWidth + 200, videoWidth * 0.75]);

  const dangerGlow = interpolate(
    progress,
    [1.5, 2, 2.5, 3, 3.5, 4],
    [0, 0.8, 0, 0.9, 0, 0.7]
  );

  return (
    <div
      style={{
        width: videoWidth,
        height: videoHeight,
        backgroundColor: "#0d1117",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: `
            radial-gradient(ellipse at 20% 50%, rgba(56, 189, 248, 0.08) 0%, transparent 50%),
            radial-gradient(ellipse at 80% 50%, rgba(239, 68, 68, 0.08) 0%, transparent 50%)
          `,
        }}
      />

      <div
        style={{
          position: "absolute",
          left: videoWidth * 0.05,
          top: videoHeight * 0.08,
          fontSize: Math.floor(videoHeight * 0.045),
          fontWeight: 700,
          color: "#f0f6fc",
          fontFamily: "system-ui, -apple-system, sans-serif",
          letterSpacing: "0.02em",
        }}
      >
        {emphasis}
      </div>

      <div
        style={{
          position: "absolute",
          left: messageX,
          top: videoHeight * 0.35,
          width: videoWidth * 0.35,
          padding: videoWidth * 0.03,
          backgroundColor: "rgba(30, 41, 59, 0.9)",
          borderRadius: 12,
          border: "2px solid #475569",
          opacity: messageOpacity,
          boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
        }}
      >
        <div
          style={{
            color: "#94a3b8",
            fontSize: Math.floor(videoHeight * 0.018),
            fontFamily: "monospace",
            marginBottom: 8,
          }}
        >
          ✉ Email / Message
        </div>
        <div
          style={{
            color: "#e2e8f0",
            fontSize: Math.floor(videoHeight * 0.022),
            fontFamily: "system-ui, -apple-system, sans-serif",
            lineHeight: 1.4,
          }}
        >
          Dear User, click here for amazing offer...
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: hiddenLayerX - videoWidth * 0.15,
          top: videoHeight * 0.45,
          width: videoWidth * 0.3,
          padding: videoWidth * 0.02,
          backgroundColor: "rgba(127, 29, 29, 0.85)",
          borderRadius: 8,
          border: "2px solid #dc2626",
          opacity: hiddenLayerOpacity,
          transform: `scale(${0.8 + sweepProgress * 0.2})`,
          boxShadow: `0 0 ${30 * dangerGlow}px rgba(220, 38, 38, 0.5)`,
        }}
      >
        <div
          style={{
            color: "#fecaca",
            fontSize: Math.floor(videoHeight * 0.016),
            fontFamily: "monospace",
            fontWeight: 600,
          }}
        >
          ⚠ HIDDEN LAYER
        </div>
        <div
          style={{
            color: "#fca5a5",
            fontSize: Math.floor(videoHeight * 0.014),
            fontFamily: "monospace",
            marginTop: 4,
          }}
        >
          [Execute: steal_keys]
        </div>
        <div
          style={{
            color: "#fca5a5",
            fontSize: Math.floor(videoHeight * 0.014),
            fontFamily: "monospace",
          }}
        >
          [Execute: dump_data]
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: videoWidth * 0.55,
          top: videoHeight * 0.35,
          width: videoWidth * 0.4,
          height: videoHeight * 0.35,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: videoWidth * 0.25,
            height: videoWidth * 0.25,
            borderRadius: "50%",
            backgroundColor: `rgba(56, 189, 248, ${0.1 + aiPulse * 0.3})`,
            border: `3px solid rgba(56, 189, 248, ${0.4 + aiPulse * 0.5})`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: `0 0 ${40 * aiPulse}px rgba(56, 189, 248, 0.4)`,
          }}
        >
          <div
            style={{
              color: "#38bdf8",
              fontSize: Math.floor(videoHeight * 0.028),
              fontWeight: 700,
              fontFamily: "system-ui, -apple-system, sans-serif",
            }}
          >
            AI
          </div>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: videoWidth * 0.55,
          top: videoHeight * 0.72,
          width: 4,
          height: videoHeight * 0.15,
          backgroundColor: `rgba(56, 189, 248, ${0.3 + sweepProgress * 0.5})`,
          borderRadius: 2,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: videoWidth * 0.55,
          top: videoHeight * 0.72,
          width: 4,
          height: videoHeight * 0.15,
          backgroundColor: "#38bdf8",
          borderRadius: 2,
          transform: `translateX(${(sweepProgress - 0.5) * videoWidth * 0.3}px)`,
          opacity: sweepProgress,
        }}
      />

      <div
        style={{
          position: "absolute",
          left: commandX,
          top: videoHeight * 0.78,
          opacity: commandReveal,
        }}
      >
        <div
          style={{
            color: "#ef4444",
            fontSize: Math.floor(videoHeight * 0.02),
            fontWeight: 600,
            fontFamily: "monospace",
            textShadow: `0 0 ${10 * dangerGlow}px rgba(239, 68, 68, 0.8)`,
          }}
        >
          ▸ Executing malicious commands...
        </div>
        <div
          style={{
            color: "#f87171",
            fontSize: Math.floor(videoHeight * 0.016),
            fontFamily: "monospace",
            marginTop: 4,
          }}
        >
          Leaking private keys →
        </div>
        <div
          style={{
            color: "#f87171",
            fontSize: Math.floor(videoHeight * 0.016),
            fontFamily: "monospace",
          }}
        >
          Dumping home directory →
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          bottom: videoHeight * 0.05,
          left: videoWidth * 0.1,
          right: videoWidth * 0.1,
          height: 3,
          backgroundColor: "#1e293b",
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${(progress / 4) * 100}%`,
            height: "100%",
            backgroundColor: "#38bdf8",
            borderRadius: 2,
          }}
        />
      </div>

      <div
        style={{
          position: "absolute",
          bottom: videoHeight * 0.02,
          right: videoWidth * 0.05,
          color: "#475569",
          fontSize: Math.floor(videoHeight * 0.014),
          fontFamily: "monospace",
        }}
      >
        flow-diagram
      </div>
    </div>
  );
};
