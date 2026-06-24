import { memo, useState } from "react";
import { formatIDR, formatDateID } from "@/lib/format";

type Bucket = { date: string; omset: number };

const defaultLabel = (b: Bucket) => formatDateID(b.date + "T00:00:00");

function OmsetChart({ buckets, labelFor = defaultLabel }: { buckets: Bucket[]; labelFor?: (b: Bucket) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...buckets.map((b) => b.omset));
  const n = buckets.length || 1;
  const W = 100;
  const H = 100;
  const gap = 2;
  const bw = (W - gap * (n - 1)) / n;

  return (
    <div className="relative h-full w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-full w-full"
        onMouseLeave={() => setHover(null)}
      >
        {buckets.map((b, i) => {
          const h = (b.omset / max) * (H - 4);
          const x = i * (bw + gap);
          const y = H - h;
          return (
            <rect
              key={b.date}
              x={x}
              y={y}
              width={bw}
              height={Math.max(h, b.omset > 0 ? 1 : 0)}
              rx={1.2}
              fill="var(--primary)"
              opacity={hover === null || hover === i ? 1 : 0.5}
              onMouseEnter={() => setHover(i)}
              onTouchStart={() => setHover(i)}
            />
          );
        })}
      </svg>
      {hover !== null && buckets[hover] && (
        <div
          className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-lg border border-border bg-popover px-2 py-1 text-[11px] shadow-soft"
          style={{ left: `${((hover + 0.5) / n) * 100}%` }}
        >
          <div className="text-muted-foreground">{labelFor(buckets[hover])}</div>
          <div className="font-medium">{formatIDR(buckets[hover].omset)}</div>
        </div>
      )}
    </div>
  );
}

export default memo(OmsetChart);
