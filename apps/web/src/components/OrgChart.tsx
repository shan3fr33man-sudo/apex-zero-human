'use client';

interface AgentNode {
  id: string;
  name: string;
  role: string;
  status: string;
  reports_to: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  idle: '#6B6B6B',
  working: '#00FF88',
  paused: '#FFB800',
  stalled: '#FF4444',
  terminated: '#333333',
};

const NODE_W = 140;
const NODE_H = 48;
const GAP_X = 24;
const GAP_Y = 64;

export function OrgChart({ agents }: { agents: AgentNode[] }) {
  // Build tree structure
  const ceo = agents.find((a) => !a.reports_to);
  if (!ceo) {
    return (
      <div className="text-sm text-apex-muted font-sans p-8 text-center">
        No CEO agent found. Hire one to see the org chart.
      </div>
    );
  }

  const childrenMap = new Map<string, AgentNode[]>();
  for (const agent of agents) {
    if (agent.reports_to) {
      const siblings = childrenMap.get(agent.reports_to) ?? [];
      siblings.push(agent);
      childrenMap.set(agent.reports_to, siblings);
    }
  }

  // Layout: BFS levels
  type Positioned = AgentNode & { x: number; y: number; level: number };
  const positioned: Positioned[] = [];
  const edges: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];

  function layout(node: AgentNode, level: number, offsetX: number): number {
    const children = childrenMap.get(node.id) ?? [];
    if (children.length === 0) {
      const x = offsetX;
      const y = level * (NODE_H + GAP_Y);
      positioned.push({ ...node, x, y, level });
      return NODE_W;
    }

    let totalWidth = 0;
    const childPositions: number[] = [];
    for (const child of children) {
      const w = layout(child, level + 1, offsetX + totalWidth);
      childPositions.push(offsetX + totalWidth + w / 2);
      totalWidth += w + GAP_X;
    }
    totalWidth -= GAP_X; // remove trailing gap

    const x = offsetX + totalWidth / 2 - NODE_W / 2;
    const y = level * (NODE_H + GAP_Y);
    positioned.push({ ...node, x, y, level });

    // Edges from this node to children
    for (const cx of childPositions) {
      edges.push({
        x1: x + NODE_W / 2,
        y1: y + NODE_H,
        x2: cx,
        y2: y + NODE_H + GAP_Y,
      });
    }

    return Math.max(totalWidth, NODE_W);
  }

  const totalW = layout(ceo, 0, 0);
  const maxLevel = Math.max(...positioned.map((p) => p.level));
  const totalH = (maxLevel + 1) * (NODE_H + GAP_Y);

  return (
    <svg
      width="100%"
      viewBox={`-16 -8 ${totalW + 32} ${totalH + 16}`}
      className="overflow-visible"
    >
      {/* Edges */}
      {edges.map((e, i) => (
        <line
          key={i}
          x1={e.x1}
          y1={e.y1}
          x2={e.x2}
          y2={e.y2}
          stroke="#1F1F1F"
          strokeWidth="1.5"
        />
      ))}

      {/* Nodes */}
      {positioned.map((node) => (
        <g key={node.id} transform={`translate(${node.x}, ${node.y})`}>
          <rect
            width={NODE_W}
            height={NODE_H}
            rx="4"
            fill="#111111"
            stroke={STATUS_COLORS[node.status] ?? '#1F1F1F'}
            strokeWidth="1.5"
          />
          <text
            x={NODE_W / 2}
            y={18}
            textAnchor="middle"
            fill="#F5F5F5"
            fontSize="11"
            fontFamily="var(--font-dm-sans), sans-serif"
          >
            {node.name}
          </text>
          <text
            x={NODE_W / 2}
            y={34}
            textAnchor="middle"
            fill="#6B6B6B"
            fontSize="9"
            fontFamily="var(--font-space-mono), monospace"
            style={{ textTransform: 'uppercase' }}
          >
            {node.role}
          </text>
          <circle
            cx={NODE_W - 10}
            cy={10}
            r="3"
            fill={STATUS_COLORS[node.status] ?? '#6B6B6B'}
          />
        </g>
      ))}
    </svg>
  );
}
