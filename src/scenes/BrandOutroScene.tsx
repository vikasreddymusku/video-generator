import { Video } from "@remotion/media";
import {
  Easing,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { SceneProps } from "./shared";

export const BrandOutroScene = ({ theme, branding }: SceneProps) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const b = branding;
  if (!b || !b.outro.enabled || b.outro.mode === "none") return null;
  if (b.outro.mode === "uploaded" && b.outro.asset)
    return (
      <Video
        src={staticFile(b.outro.asset)}
        muted
        objectFit="cover"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      />
    );
  const enterEnd = Math.max(1, fps * 0.6);
  const enter = interpolate(frame, [0, enterEnd], [0, 1], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const details = [
    ["WEB", b.website, b.outro.showWebsite],
    ["EMAIL", b.email, b.outro.showEmail],
    ["PHONE", b.phone, b.outro.showPhone],
    ["ADDRESS", b.address, b.outro.showAddress],
  ] as const;
  const contacts = (
    <div
      style={{
        width: b.outro.qrEnabled ? Math.max(310, b.outro.qrSize + 100) : 460,
        borderLeft: `1px solid ${theme.primary}66`,
        paddingLeft: 40,
      }}
    >
      {b.outro.qrEnabled && b.outro.qrAsset && (
        <div
          style={{
            marginBottom: 28,
            textAlign: b.outro.qrPosition === "right" ? "right" : "left",
          }}
        >
          <Img
            src={staticFile(b.outro.qrAsset)}
            alt=""
            style={{
              width: b.outro.qrSize,
              height: b.outro.qrSize,
              background: "#fff",
              padding: 8,
            }}
          />
          <div style={{ marginTop: 12, fontSize: 17, color: theme.secondary }}>
            {b.outro.qrLabel}
          </div>
        </div>
      )}
      {details
        .filter(([, , enabled]) => enabled)
        .map(([key, value]) => (
          <div key={key} style={{ marginBottom: 18 }}>
            <div style={{ color: theme.primary, fontSize: 12, letterSpacing: 2 }}>
              {key}
            </div>
            <div
              style={{
                color: theme.text,
                fontSize: key === "ADDRESS" ? 18 : 25,
                lineHeight: 1.35,
              }}
            >
              {value}
            </div>
          </div>
        ))}
    </div>
  );
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 70,
        opacity: enter,
        transform: `translateY(${interpolate(frame, [0, enterEnd], [28, 0], {
          extrapolateRight: "clamp",
        })}px)`,
      }}
    >
      {b.outro.qrEnabled && b.outro.qrPosition === "left" && contacts}
      <div style={{ flex: 1, minWidth: 0 }}>
        {b.logoAsset ? (
          <Img
            src={staticFile(b.logoAsset)}
            alt=""
            style={{ width: 84, height: 84, objectFit: "contain", marginBottom: 24 }}
          />
        ) : (
          <div
            style={{
              color: theme.primary,
              fontSize: 28,
              letterSpacing: 5,
              marginBottom: 26,
            }}
          >
            {b.brandName.toUpperCase()}
          </div>
        )}
        {b.outro.showVideoTitle && (
          <div
            style={{
              fontSize: 67,
              fontWeight: 900,
              lineHeight: 1.1,
              color: theme.text,
            }}
          >
            {b.videoTitle}
          </div>
        )}
        <div
          style={{
            display: "inline-block",
            marginTop: 38,
            padding: "18px 30px",
            border: `2px solid ${theme.primary}`,
            color: theme.secondary,
            fontSize: 34,
            fontWeight: 800,
          }}
        >
          {b.cta.toUpperCase()} ?
        </div>
        {b.outro.showTagline && (
          <div
            style={{
              marginTop: 36,
              fontSize: 20,
              color: theme.muted,
              letterSpacing: 3,
            }}
          >
            {b.tagline}
          </div>
        )}
      </div>
      {(!b.outro.qrEnabled || b.outro.qrPosition === "right") && contacts}
    </div>
  );
};