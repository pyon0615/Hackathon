/**
 * LOCWISE — SVG Floor Plan Visualiser
 * Replaced Three.js/WebGL with SVG — works in all browsers without WebGL.
 * Same LayoutConfig data, rendered as a clean top-down architectural plan.
 */

import { LayoutConfig } from "@/data/layoutConfigs";

const SCALE = 38; // pixels per metre

export function BusinessLayout3D({ layout }: { layout: LayoutConfig }) {
  const { totalW, totalD, rooms, furniture } = layout;
  const W = totalW * SCALE;
  const H = totalD * SCALE;
  const PAD = 32;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#f5f0ea",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "auto",
      }}
    >
      <svg
        viewBox={`${-PAD} ${-PAD} ${W + PAD * 2} ${H + PAD * 2}`}
        style={{ width: "100%", height: "100%", maxWidth: W + PAD * 2 }}
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Grid lines */}
        <defs>
          <pattern id="grid" width={SCALE} height={SCALE} patternUnits="userSpaceOnUse">
            <path
              d={`M ${SCALE} 0 L 0 0 0 ${SCALE}`}
              fill="none"
              stroke="#d6cfc5"
              strokeWidth="0.5"
              opacity="0.5"
            />
          </pattern>
          <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="1" dy="1" stdDeviation="1.5" floodOpacity="0.12" />
          </filter>
        </defs>

        {/* Background grid */}
        <rect x={0} y={0} width={W} height={H} fill="url(#grid)" />

        {/* Outer wall */}
        <rect
          x={0} y={0} width={W} height={H}
          fill="none"
          stroke="#1c1917"
          strokeWidth="3"
        />

        {/* Room zones */}
        {rooms.map((room) => (
          <g key={room.id}>
            <rect
              x={room.x * SCALE}
              y={room.z * SCALE}
              width={room.w * SCALE}
              height={room.d * SCALE}
              fill={room.color}
              stroke="#c4b9aa"
              strokeWidth="0.8"
              filter="url(#shadow)"
            />
            <text
              x={(room.x + room.w / 2) * SCALE}
              y={(room.z + room.d / 2) * SCALE}
              textAnchor="middle"
              dominantBaseline="middle"
              style={{
                fontSize: Math.min(10, room.w * SCALE * 0.13),
                fontFamily: "JetBrains Mono, monospace",
                fill: "#57534e",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                pointerEvents: "none",
                userSelect: "none",
              }}
            >
              {room.label}
            </text>
          </g>
        ))}

        {/* Furniture pieces */}
        {furniture.map((piece, i) => (
          <g key={i}>
            <rect
              x={piece.x * SCALE + 1}
              y={piece.z * SCALE + 1}
              width={piece.w * SCALE - 2}
              height={piece.d * SCALE - 2}
              fill={piece.color}
              stroke="#78716c"
              strokeWidth="0.6"
              rx="1"
              opacity="0.92"
            />
            {piece.label && piece.w * SCALE > 28 && (
              <text
                x={(piece.x + piece.w / 2) * SCALE}
                y={(piece.z + piece.d / 2) * SCALE}
                textAnchor="middle"
                dominantBaseline="middle"
                style={{
                  fontSize: Math.min(8, piece.w * SCALE * 0.18),
                  fontFamily: "JetBrains Mono, monospace",
                  fill: "#fafaf8",
                  fontWeight: 600,
                  pointerEvents: "none",
                  userSelect: "none",
                }}
              >
                {piece.label}
              </text>
            )}
          </g>
        ))}

        {/* Scale bar */}
        <g transform={`translate(4, ${H + 10})`}>
          <line x1={0} y1={4} x2={SCALE * 5} y2={4} stroke="#1c1917" strokeWidth="1.5" />
          <line x1={0} y1={0} x2={0} y2={8} stroke="#1c1917" strokeWidth="1.5" />
          <line x1={SCALE * 5} y1={0} x2={SCALE * 5} y2={8} stroke="#1c1917" strokeWidth="1.5" />
          <text
            x={SCALE * 2.5} y={18}
            textAnchor="middle"
            style={{ fontSize: 9, fontFamily: "JetBrains Mono, monospace", fill: "#57534e" }}
          >
            5 m
          </text>
        </g>

        {/* North indicator */}
        <g transform={`translate(${W + 8}, 4)`}>
          <circle cx={10} cy={10} r={10} fill="#1c1917" />
          <text
            x={10} y={14}
            textAnchor="middle"
            style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", fill: "#fafaf8", fontWeight: 700 }}
          >
            N
          </text>
        </g>

        {/* Dimensions label */}
        <text
          x={W / 2}
          y={-10}
          textAnchor="middle"
          style={{
            fontSize: 10,
            fontFamily: "JetBrains Mono, monospace",
            fill: "#78716c",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          {layout.businessLabel} · {totalW}m × {totalD}m · {totalW * totalD} sqm
        </text>
      </svg>
    </div>
  );
}
