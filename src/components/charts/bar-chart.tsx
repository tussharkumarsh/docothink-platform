/**
 * Minimal server-rendered SVG charts (no chart library). Single series → one brand hue, no legend;
 * thin bars with 4px rounded tops anchored to the baseline, 2px gaps, recessive grid, per-bar hover
 * highlight + tooltip, and a visually hidden table so the data never depends on seeing the chart.
 */

type Datum = { label: string; value: number };

/** Round a maximum up to 1, 2 or 5 × 10^n so the axis gets clean ticks. */
export function niceMax(max: number): number {
  if (max <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(max));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * pow >= max)!;
  return step * pow;
}

function DataTable({ title, data, format }: { title: string; data: Datum[]; format: (v: number) => string }) {
  return (
    <table className="sr-only">
      <caption>{title}</caption>
      <thead><tr><th scope="col">Period</th><th scope="col">Value</th></tr></thead>
      <tbody>{data.map((d) => <tr key={d.label}><th scope="row">{d.label}</th><td>{format(d.value)}</td></tr>)}</tbody>
    </table>
  );
}

export function BarChart({ data, format, title, height = 180 }: { data: Datum[]; format: (v: number) => string; title: string; height?: number }) {
  if (data.length === 0) return <p className="py-8 text-center text-sm text-slate-500">No data for this period.</p>;
  const max = niceMax(Math.max(...data.map((d) => d.value)));
  const width = 600;
  const padLeft = 56;
  const padBottom = 24;
  const plotH = height - padBottom - 8;
  const slot = (width - padLeft) / data.length;
  const barW = Math.max(4, Math.min(28, slot - 2));
  const ticks = [0, 0.5, 1].map((t) => t * max);
  const latest = data[data.length - 1];
  const peak = data.reduce((a, b) => (b.value > a.value ? b : a));
  const summary = `${title}: ${data.length} periods, highest ${format(peak.value)} (${peak.label}), latest ${format(latest.value)} (${latest.label}).`;
  const labelEvery = Math.ceil(data.length / 8);

  return (
    <figure>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={summary} className="h-auto w-full overflow-visible">
        {ticks.map((t) => {
          const y = 8 + plotH - (t / max) * plotH;
          return (
            <g key={t}>
              <line x1={padLeft} x2={width} y1={y} y2={y} className="stroke-slate-200" strokeWidth={1} strokeDasharray={t === 0 ? undefined : "2 4"} />
              <text x={padLeft - 8} y={y + 4} textAnchor="end" className="fill-slate-500 text-[11px]">{format(t)}</text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const h = Math.max(d.value > 0 ? 2 : 0, (d.value / max) * plotH);
          const x = padLeft + i * slot + (slot - barW) / 2;
          const y = 8 + plotH - h;
          const r = Math.min(4, barW / 2, h);
          // Rounded top corners only; the bar sits flat on the baseline.
          const path = h > 0
            ? `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + barW - r} Q${x + barW},${y} ${x + barW},${y + r} V${y + h} Z`
            : "";
          return (
            <g key={d.label} className="group">
              {/* Hit target taller and wider than the bar. */}
              <rect x={padLeft + i * slot} y={8} width={slot} height={plotH} fill="transparent">
                <title>{`${d.label}: ${format(d.value)}`}</title>
              </rect>
              {path && <path d={path} className="pointer-events-none fill-brand-600 transition-opacity group-hover:opacity-80" />}
              <text x={x + barW / 2} y={y - 6} textAnchor="middle" className="pointer-events-none fill-slate-800 text-[11px] opacity-0 group-hover:opacity-100">{format(d.value)}</text>
              {i % labelEvery === 0 && (
                <text x={x + barW / 2} y={height - 6} textAnchor="middle" className="fill-slate-500 text-[11px]">{d.label}</text>
              )}
            </g>
          );
        })}
      </svg>
      <DataTable title={title} data={data} format={format} />
    </figure>
  );
}

/** Horizontal share bars: each row's label, value and share of the total. */
export function HBar({ data, format, title }: { data: Datum[]; format: (v: number) => string; title: string }) {
  const total = data.reduce((sum, d) => sum + Math.max(0, d.value), 0);
  if (total <= 0) return <p className="py-4 text-sm text-slate-500">No data for this period.</p>;
  return (
    <figure aria-label={title}>
      <dl className="space-y-3">
        {data.map((d) => {
          const pct = Math.round((Math.max(0, d.value) / total) * 100);
          return (
            <div key={d.label} title={`${d.label}: ${format(d.value)} (${pct}%)`}>
              <div className="mb-1 flex justify-between text-sm">
                <dt className="capitalize text-slate-700">{d.label}</dt>
                <dd className="tabular-nums text-slate-900">{format(d.value)} <span className="text-slate-500">· {pct}%</span></dd>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                <div className="h-full rounded-full bg-brand-600" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </dl>
    </figure>
  );
}
