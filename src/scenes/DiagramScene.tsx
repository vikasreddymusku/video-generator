import { type FC } from "react";
import {
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { SceneProps } from "./shared";

type Position = {
  x: number;
  y: number;
};

export const DiagramScene: FC<SceneProps> = ({
  scene,
  theme,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (!scene.diagram) return null;

  const data = scene.diagram;

  const nodes = data.nodes;

  const cols =
    data.direction === "left-to-right"
      ? Math.min(4, nodes.length)
      : Math.max(
          1,
          Math.ceil(
            nodes.length /
              Math.min(4, nodes.length),
          ),
        );

  const rows = Math.ceil(
    nodes.length / cols,
  );

  const positions = new Map<
    string,
    Position
  >();

  nodes.forEach((node, index) => {
    const col = index % cols;
    const row = Math.floor(
      index / cols,
    );

    const x =
      cols === 1
        ? 800
        : 170 +
          (1260 * col) /
            Math.max(1, cols - 1);

    const y =
      rows === 1
        ? 290
        : 100 +
          (380 * row) /
            Math.max(1, rows - 1);

    positions.set(node.id, {
      x,
      y,
    });
  });

  const titleEntrance = spring({
    frame,
    fps,
    config: {
      damping: 18,
      stiffness: 120,
    },
  });

  return (
    <div
      style={{
        height: "100%",
      }}
    >
      <div
        style={{
          opacity: titleEntrance,
          transform: `translateY(${(1 - titleEntrance) * 25}px)`,
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
              color: theme.muted,
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
          marginTop: 24,
          height: 590,
          width: "100%",
        }}
      >
        <svg
          viewBox="0 0 1600 560"
          width="100%"
          height="100%"
          style={{
            overflow: "visible",
          }}
        >
          <defs>
            <marker
              id={`arrow-${scene.id}`}
              markerWidth="12"
              markerHeight="12"
              refX="9"
              refY="5"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path
                d="M0,0 L10,5 L0,10 z"
                fill={theme.primary}
              />
            </marker>
          </defs>

          {data.edges.map(
            (edge, index) => {
              const from =
                positions.get(
                  edge.from,
                );

              const to =
                positions.get(
                  edge.to,
                );

              if (!from || !to)
                return null;

              const progress =
                interpolate(
                  frame,
                  [
                    10 +
                      index * 5,
                    32 +
                      index * 5,
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
                <g
                  key={`${edge.from}-${edge.to}-${index}`}
                >
                  <path
                    d={`M ${from.x} ${from.y} L ${to.x} ${to.y}`}
                    fill="none"
                    stroke={
                      theme.primary
                    }
                    strokeWidth={4}
                    opacity={0.7}
                    pathLength={1}
                    strokeDasharray={1}
                    strokeDashoffset={
                      1 - progress
                    }
                    markerEnd={`url(#arrow-${scene.id})`}
                  />

                  {edge.label && (
                    <text
                      x={
                        (from.x +
                          to.x) /
                        2
                      }
                      y={
                        (from.y +
                          to.y) /
                          2 -
                        12
                      }
                      textAnchor="middle"
                      fill={
                        theme.muted
                      }
                      fontSize={20}
                      fontFamily={
                        theme.fontFamily
                      }
                      opacity={
                        progress
                      }
                    >
                      {
                        edge.label
                      }
                    </text>
                  )}
                </g>
              );
            },
          )}

          {nodes.map(
            (node, index) => {
              const position =
                positions.get(
                  node.id,
                )!;

              const entrance =
                spring({
                  frame:
                    frame -
                    index * 6,
                  fps,
                  config: {
                    damping: 18,
                    stiffness:
                      130,
                  },
                });

              const active =
                data.activeNodeId ===
                node.id;

              const width = 260;
              const height = 112;

              return (
                <g
                  key={node.id}
                  transform={`translate(${position.x}, ${position.y}) scale(${entrance})`}
                  opacity={
                    entrance
                  }
                >
                  <rect
                    x={
                      -width /
                      2
                    }
                    y={
                      -height /
                      2
                    }
                    width={
                      width
                    }
                    height={
                      height
                    }
                    rx={
                      theme.borderRadius
                    }
                    fill={
                      theme.surface
                    }
                    stroke={
                      active
                        ? theme
                            .secondary
                        : theme
                            .primary
                    }
                    strokeWidth={
                      active
                        ? 5
                        : 3
                    }
                  />

                  <text
                    x={0}
                    y={
                      node.detail
                        ? -7
                        : 9
                    }
                    textAnchor="middle"
                    fill={
                      theme.text
                    }
                    fontSize={27}
                    fontWeight={700}
                    fontFamily={
                      theme.fontFamily
                    }
                  >
                    {
                      node.label
                    }
                  </text>

                  {node.detail && (
                    <text
                      x={0}
                      y={30}
                      textAnchor="middle"
                      fill={
                        theme.muted
                      }
                      fontSize={18}
                      fontFamily={
                        theme.fontFamily
                      }
                    >
                      {
                        node.detail
                      }
                    </text>
                  )}

                  {node.group && (
                    <text
                      x={0}
                      y={-72}
                      textAnchor="middle"
                      fill={
                        theme.primary
                      }
                      fontSize={16}
                      fontFamily={
                        theme.fontFamily
                      }
                      letterSpacing={1.5}
                    >
                      {
                        node.group
                      }
                    </text>
                  )}
                </g>
              );
            },
          )}
        </svg>
      </div>
    </div>
  );
};