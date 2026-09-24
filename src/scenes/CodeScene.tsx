import { type FC } from "react";
import {
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { SceneProps } from "./shared";

const keywordPattern =
  /^(SELECT|FROM|WHERE|JOIN|INNER|LEFT|RIGHT|ON|AS|CREATE|ALTER|DROP|TABLE|SCHEMA|USER|INDEX|VIEW|SEQUENCE|ADD|COLUMN|CONSTRAINT|PRIMARY|FOREIGN|KEY|REFERENCES|INSERT|UPDATE|DELETE|INTO|VALUES|SET|USE|GRANT|DEFAULT|INT|INTEGER|VARCHAR|NVARCHAR|CHAR|DECIMAL|NUMERIC|DATE|DATETIME|NULL|NOT|AND|OR|BEGIN|END|IF|ELSE|DECLARE|EXEC|PROCEDURE|FUNCTION|RETURN|const|let|var|function|class|interface|type|import|export|from|return|async|await|new|true|false|None|def|for|while|in|echo|docker|npm|git)$/i;

const tokenize = (line: string) =>
  line.match(
    /(--.*$|\/\/.*$|#.*$|'(?:\\.|[^'])*'|"(?:\\.|[^"])*"|`(?:\\.|[^`])*`|\b\d+(?:\.\d+)?\b|\b[A-Za-z_][A-Za-z0-9_]*\b|\s+|.)/g,
  ) ?? [line];

export const CodeScene: FC<SceneProps> = ({
  scene,
  theme,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (!scene.code) return null;

  const data = scene.code;
  const lines = data.code.split("\n");

  const entrance = spring({
    frame,
    fps,
    config: {
      damping: 18,
      stiffness: 120,
      mass: 0.8,
    },
  });

  const maxVisibleLines = 12;
  const maxScroll = Math.max(
    0,
    (lines.length - maxVisibleLines) * 38,
  );

  const scrollY =
    maxScroll > 0
      ? interpolate(
          frame,
          [
            Math.min(
              25,
              scene.durationInFrames * 0.15,
            ),
            Math.max(
              26,
              scene.durationInFrames - 25,
            ),
          ],
          [0, maxScroll],
          {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          },
        )
      : 0;

  const renderToken = (
    token: string,
    index: number,
  ) => {
    let color = theme.text;

    if (
      token.startsWith("--") ||
      token.startsWith("//") ||
      token.startsWith("#")
    ) {
      color = theme.muted;
    } else if (
      /^['"`]/.test(token)
    ) {
      color = theme.secondary;
    } else if (
      /^-?\d/.test(token)
    ) {
      color = theme.secondary;
    } else if (
      keywordPattern.test(token)
    ) {
      color = theme.primary;
    }

    return (
      <span
        key={`${index}-${token}`}
        style={{
          color,
          fontWeight:
            keywordPattern.test(token)
              ? 700
              : 500,
        }}
      >
        {token}
      </span>
    );
  };

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          opacity: entrance,
          transform: `translateY(${(1 - entrance) * 30}px)`,
        }}
      >
        <div
          style={{
            fontSize: 28,
            color: theme.primary,
            fontWeight: 700,
            letterSpacing: 2,
            textTransform: "uppercase",
            marginBottom: 14,
          }}
        >
          {data.language}
        </div>

        <div
          style={{
            fontSize: 62,
            lineHeight: 1.05,
            fontWeight: theme.headingWeight,
            color: theme.text,
            maxWidth: 1200,
          }}
        >
          {scene.headline}
        </div>

        {scene.supportingText[0] && (
          <div
            style={{
              marginTop: 16,
              fontSize: 28,
              color: theme.muted,
            }}
          >
            {scene.supportingText[0]}
          </div>
        )}
      </div>

      <div
        style={{
          marginTop: 38,
          flex: 1,
          minHeight: 0,
          borderRadius: theme.borderRadius,
          border: `1px solid ${theme.primary}55`,
          background: theme.surface,
          overflow: "hidden",
          boxShadow: `0 0 ${
            35 * theme.glowIntensity
          }px ${theme.primary}33`,
          opacity: entrance,
          transform: `scale(${0.96 + entrance * 0.04})`,
        }}
      >
        <div
          style={{
            height: 58,
            display: "flex",
            alignItems: "center",
            justifyContent:
              "space-between",
            padding: "0 24px",
            borderBottom: `1px solid ${theme.primary}33`,
            fontSize: 21,
          }}
        >
          <span
            style={{
              color: theme.muted,
            }}
          >
            {data.filename ||
              data.mode.toUpperCase()}
          </span>

          <span
            style={{
              color: theme.primary,
              textTransform: "uppercase",
              letterSpacing: 1.5,
            }}
          >
            {data.mode}
          </span>
        </div>

        <div
          style={{
            position: "relative",
            height: "calc(100% - 58px)",
            overflow: "hidden",
            padding: "26px 30px",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              transform: `translateY(-${scrollY}px)`,
            }}
          >
            {lines.map((line, index) => {
              const lineNumber = index + 1;

              const lineOpacity =
                interpolate(
                  frame,
                  [
                    index * 3,
                    index * 3 + 10,
                  ],
                  [0, 1],
                  {
                    extrapolateLeft:
                      "clamp",
                    extrapolateRight:
                      "clamp",
                  },
                );

              const highlighted =
                data.highlightLines.includes(
                  lineNumber,
                );

              return (
                <div
                  key={lineNumber}
                  style={{
                    minHeight: 38,
                    display: "flex",
                    alignItems:
                      "center",
                    opacity:
                      lineOpacity,
                    background:
                      highlighted
                        ? `${theme.primary}18`
                        : "transparent",
                    borderLeft:
                      highlighted
                        ? `3px solid ${theme.primary}`
                        : "3px solid transparent",
                    paddingLeft: 12,
                    fontFamily:
                      "Consolas, 'Courier New', monospace",
                    fontSize: 24,
                    whiteSpace: "pre",
                  }}
                >
                  <span
                    style={{
                      width: 54,
                      flexShrink: 0,
                      color:
                        highlighted
                          ? theme.primary
                          : theme.muted,
                      opacity: 0.65,
                      userSelect:
                        "none",
                    }}
                  >
                    {String(
                      lineNumber,
                    ).padStart(2, "0")}
                  </span>

                  <span>
                    {tokenize(
                      line,
                    ).map(
                      renderToken,
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};