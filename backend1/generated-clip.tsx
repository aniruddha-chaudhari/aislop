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

const ORBIT_COUNT = 12;
const RADIAL_COUNT = 8;

export const GeneratedClip: React.FC<GeneratedClipProps> = ({
  content,
  emphasis,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const entranceSpring = spring({
    frame,
    fps,
    config: { damping: 200 },
  });

  const orbitRotation = interpolate(
    frame,
    [0, durationInFrames],
    [0, 360],
    {
      easing: Easing.linear,
      extrapolateRight: "clamp",
    }
  );

  const pulseScale = interpolate(
    frame % (2 * fps),
    [0, 2 * fps],
    [0.9, 1.1],
    {
      easing: Easing.inOut(Easing.sin),
      extrapolateRight: "clamp",
    }
  );

  const coreOpacity = interpolate(
    frame,
    [0, 0.5 * fps],
    [0, 1],
    {
      easing: Easing.out(Easing.quad),
      extrapolateRight: "clamp",
    }
  );

  const ringExpand = spring({
    frame: frame - 0.5 * fps,
    fps,
    config: { damping: 150 },
  });

  const radialFade = interpolate(
    frame,
    [1 * fps, 2 * fps],
    [0, 1],
    {
      easing: Easing.out(Easing.quad),
      extrapolateRight: "clamp",
    }
  );

  const holdCalm = interpolate(
    frame,
    [durationInFrames - 1.5 * fps, durationInFrames],
    [1, 0.3],
    {
      easing: Easing.out(Easing.quad),
      extrapolateRight: "clamp",
    }
  );

  const orbitParticles = Array.from({ length: ORBIT_COUNT }).map((_, i) => {
    const angle = (i / ORBIT_COUNT) * 2 * Math.PI;
    const radius = 120 + Math.sin(i * 0.8) * 20;
    const delayFactor = i / ORBIT_COUNT;
    
    const particleSpring = spring({
      frame: frame - delayFactor * 0.5 * fps,
      fps,
      config: { damping: 180 },
    });

    const currentAngle = angle + (orbitRotation * Math.PI) / 180;
    const x = Math.cos(currentAngle) * radius * particleSpring;
    const y = Math.sin(currentAngle) * radius * particleSpring;

    const size = 6 + Math.sin(i * 1.5) * 3;
    const opacity = 0.4 + particleSpring * 0.6;

    return { x, y, size, opacity, delayFactor };
  });

  const radialBars = Array.from({ length: RADIAL_COUNT }).map((_, i) => {
    const angle = (i / RADIAL_COUNT) * 2 * Math.PI - Math.PI / 2;
    const barLength = 40 + (i % 3) * 25;
    const barDelay = i / RADIAL_COUNT;
    
    const lengthSpring = spring({
      frame: frame - barDelay * 0.3 * fps,
      fps,
      config: { damping: 200 },
    });

    const x = Math.cos(angle) * 80 * lengthSpring;
    const y = Math.sin(angle) * 80 * lengthSpring;

    return { x, y, length: barLength * lengthSpring, angle: (angle * 180) / Math.PI };
  });

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        backgroundColor: "#0a0a0f",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "radial-gradient(ellipse at center, #1a1520 0%, #0a0a0f 70%)",
        }}
      />

      <div
        style={{
          position: "relative",
          width: 300,
          height: 300,
          transform: `scale(${entranceSpring})`,
          opacity: coreOpacity,
        }}
      >
        {radialBars.map((bar, i) => (
          <div
            key={`bar-${i}`}
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: 4,
              height: bar.length,
              backgroundColor: `rgba(239, 68, 68, ${radialFade * 0.6})`,
              borderRadius: 2,
              transform: `translate(-50%, -50%) translate(${bar.x}px, ${bar.y}px) rotate(${bar.angle}deg)`,
              opacity: radialFade,
            }}
          />
        ))}

        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: 80,
            height: 80,
            borderRadius: "50%",
            backgroundColor: "rgba(220, 38, 38, 0.3)",
            border: "2px solid rgba(239, 68, 68, 0.8)",
            transform: `translate(-50%, -50%) scale(${pulseScale})`,
            boxShadow: "0 0 40px rgba(220, 38, 38, 0.5), inset 0 0 20px rgba(239, 68, 68, 0.3)",
          }}
        />

        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: 50,
            height: 50,
            borderRadius: "50%",
            backgroundColor: "rgba(239, 68, 68, 0.9)",
            transform: `translate(-50%, -50%) scale(${pulseScale * 0.9})`,
            boxShadow: "0 0 30px rgba(239, 68, 68, 0.8)",
          }}
        />

        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: 30,
            height: 30,
            borderRadius: "50%",
            backgroundColor: "#fef2f2",
            transform: `translate(-50%, -50%) scale(${pulseScale * 0.8})`,
          }}
        />

        {orbitParticles.map((particle, i) => (
          <div
            key={`orbit-${i}`}
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: particle.size,
              height: particle.size,
              borderRadius: "50%",
              backgroundColor: i < 8 ? "#ef4444" : "#fb923c",
              transform: `translate(-50%, -50%) translate(${particle.x}px, ${particle.y}px)`,
              opacity: particle.opacity * (1 - holdCalm * 0.5),
              boxShadow: `0 0 ${particle.size * 2}px ${i < 8 ? "rgba(239, 68, 68, 0.6)" : "rgba(251, 146, 60, 0.6)"}`,
            }}
          />
        ))}

        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: `translate(-50%, -50%)`,
            opacity: radialFade * (1 - holdCalm * 0.3),
          }}
        >
          <span
            style={{
              fontSize: 28,
              fontWeight: 900,
              color: "#fef2f2",
              letterSpacing: "0.15em",
              textShadow: "0 0 20px rgba(239, 68, 68, 0.8), 0 2px 4px rgba(0, 0, 0, 0.5)",
              fontFamily: "system-ui, -apple-system, sans-serif",
              whiteSpace: "nowrap",
            }}
          >
            {emphasis?.toUpperCase() || "OVER SIXTY"}
          </span>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 60,
          left: "50%",
          transform: `translateX(-50%)`,
          opacity: holdCalm,
        }}
      >
        <div
          style={{
            width: 200,
            height: 4,
            backgroundColor: "rgba(239, 68, 68, 0.3)",
            borderRadius: 2,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: "63%",
              height: "100%",
              backgroundColor: "#ef4444",
              borderRadius: 2,
            }}
          />
        </div>
        <div
          style={{
            marginTop: 8,
            fontSize: 14,
            color: "rgba(254, 242, 242, 0.7)",
            textAlign: "center",
            fontFamily: "system-ui, -apple-system, sans-serif",
            letterSpacing: "0.1em",
          }}
        >
          VULNERABLE
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          top: 40,
          right: 40,
          width: 60,
          height: 60,
          borderRadius: "50%",
          border: "2px solid rgba(239, 68, 68, 0.2)",
          opacity: ringExpand * 0.5,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 40,
          right: 40,
          width: 90,
          height: 90,
          borderRadius: "50%",
          border: "1px solid rgba(239, 68, 68, 0.1)",
          opacity: ringExpand * 0.3,
        }}
      />
    </div>
  );
};
