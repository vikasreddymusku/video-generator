import { type FC } from "react";
import {
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { SceneProps } from "./shared";

function animatedValue(
  value: string,
  progress: number,
) {
  const match = value.match(
    /^([^0-9-]*)(-?\d+(?:\.\d+)?)(.*)$/,
  );

  if (!match) return value;

  const prefix = match[1];
  const numeric =
    Number(match[2]);
  const suffix = match[3];

  if (
    !Number.isFinite(numeric)
  )
    return value;

  const decimals =
    match[2].includes(".")
      ? match[2].split(".")[1]
          .length
      : 0;

  const current =
    numeric * progress;

  return `${prefix}${current.toFixed(
    decimals,
  )}${suffix}`;
}

export const MetricsScene: FC<
  SceneProps
> = ({ scene, theme }) => {
  const frame =
    useCurrentFrame();

  const { fps } =
    useVideoConfig();

  if (!scene.metrics)
    return null;

  const data =
    scene.metrics;

  const titleEntrance =
    spring({
      frame,
      fps,
      config: {
        damping: 18,
        stiffness: 120,
      },
    });

  const columns =
    data.layout ===
    "comparison"
      ? Math.min(
          2,
          data.metrics.length,
        )
      : Math.min(
          3,
          data.metrics.length,
        );

  return (
    <div
      style={{
        height: "100%",
      }}
    >
      <div
        style={{
          opacity:
            titleEntrance,
          transform: `translateY(${(1 - titleEntrance) * 26}px)`,
        }}
      >
        <div
          style={{
            fontSize: 62,
            fontWeight:
              theme.headingWeight,
            color: theme.text,
          }}
        >
          {scene.headline}
        </div>

        {scene.supportingText[0] && (
          <div
            style={{
              marginTop: 14,
              fontSize: 28,
              color:
                theme.muted,
            }}
          >
            {
              scene
                .supportingText[0]
            }
          </div>
        )}
      </div>

      <div
        style={{
          marginTop: 55,
          display: "grid",
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          gap: 28,
        }}
      >
        {data.metrics.map(
          (metric, index) => {
            const entrance =
              spring({
                frame:
                  frame -
                  index * 6,
                fps,
                config: {
                  damping: 18,
                  stiffness:
                    125,
                },
              });

            const progress =
              interpolate(
                frame,
                [
                  12 +
                    index * 6,
                  42 +
                    index * 6,
                ],
                [0, 1],
                {
                  extrapolateLeft:
                    "clamp",
                  extrapolateRight:
                    "clamp",
                },
              );

            return (
              <div
                key={`${metric.label}-${index}`}
                style={{
                  minHeight: 235,
                  padding:
                    "34px 38px",
                  boxSizing:
                    "border-box",
                  borderRadius:
                    theme.borderRadius,
                  background:
                    theme.surface,
                  border: `1px solid ${theme.primary}55`,
                  boxShadow: `0 0 ${
                    28 *
                    theme.glowIntensity
                  }px ${theme.primary}25`,
                  opacity:
                    entrance,
                  transform: `translateY(${(1 - entrance) * 32}px) scale(${0.96 + entrance * 0.04})`,
                }}
              >
                <div
                  style={{
                    fontSize: 23,
                    color:
                      theme.muted,
                    marginBottom:
                      18,
                  }}
                >
                  {
                    metric.label
                  }
                </div>

                <div
                  style={{
                    display:
                      "flex",
                    alignItems:
                      "baseline",
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      fontSize:
                        68,
                      lineHeight: 1,
                      fontWeight:
                        theme.headingWeight,
                      color:
                        theme.primary,
                    }}
                  >
                    {animatedValue(
                      metric.value,
                      progress,
                    )}
                  </div>

                  {metric.unit && (
                    <div
                      style={{
                        fontSize:
                          27,
                        color:
                          theme.secondary,
                      }}
                    >
                      {
                        metric.unit
                      }
                    </div>
                  )}
                </div>

                {metric.context && (
                  <div
                    style={{
                      marginTop:
                        20,
                      fontSize:
                        21,
                      lineHeight:
                        1.4,
                      color:
                        theme.text,
                    }}
                  >
                    {
                      metric.context
                    }
                  </div>
                )}

                {data.layout ===
                  "progress" && (
                  <div
                    style={{
                      marginTop:
                        28,
                      height: 7,
                      borderRadius:
                        999,
                      overflow:
                        "hidden",
                      background: `${theme.muted}30`,
                    }}
                  >
                    <div
                      style={{
                        width: `${progress * 100}%`,
                        height:
                          "100%",
                        background:
                          theme.primary,
                      }}
                    />
                  </div>
                )}
              </div>
            );
          },
        )}
      </div>
    </div>
  );
};