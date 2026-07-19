// Petits composants graphiques SVG "maison" (pas de dépendance recharts) —
// reproduisent le style des dashboards fournis : donut, courbe de tendance,
// barres par jour de semaine, barres horizontales classées, leaderboard.

export function DonutChart({ data, size = 160 }: { data: { label: string; value: number; color: string }[]; size?: number }) {
  const total = data.reduce((a, d) => a + d.value, 0) || 1;
  const radius = size / 2;
  const stroke = size * 0.22;
  const r = radius - stroke / 2;
  const circumference = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex items-center gap-5 flex-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`rotate(-90 ${radius} ${radius})`}>
          {data.map((d, i) => {
            const frac = d.value / total;
            const dash = frac * circumference;
            const el = (
              <circle
                key={i}
                cx={radius} cy={radius} r={r}
                fill="none" stroke={d.color} strokeWidth={stroke}
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              />
            );
            offset += dash;
            return el;
          })}
        </g>
        <text x={radius} y={radius - 4} textAnchor="middle" className="fill-slate-800" style={{ fontSize: size * 0.14, fontWeight: 800 }}>
          {total}
        </text>
        <text x={radius} y={radius + 16} textAnchor="middle" className="fill-slate-400" style={{ fontSize: size * 0.075 }}>
          total
        </text>
      </svg>
      <div className="space-y-1.5">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
            <span className="text-slate-600 font-medium">{d.label}</span>
            <span className="text-slate-400">{d.value} ({total ? Math.round(d.value / total * 100) : 0}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TrendArea({ points, color = '#1565C0', height = 180 }: { points: { label: string; value: number }[]; color?: string; height?: number }) {
  const width = Math.max(320, points.length * 28);
  const max = Math.max(1, ...points.map(p => p.value));
  const stepX = width / Math.max(1, points.length - 1);
  const toY = (v: number) => height - 24 - (v / max) * (height - 44);
  const coords = points.map((p, i) => [i * stepX, toY(p.value)] as [number, number]);
  const linePath = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ');
  const areaPath = `${linePath} L${coords[coords.length - 1]?.[0] ?? 0},${height - 24} L0,${height - 24} Z`;
  const gridLines = 4;

  return (
    <div className="overflow-x-auto scrollbar-hide">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="min-w-full">
        {Array.from({ length: gridLines + 1 }).map((_, i) => {
          const y = 20 + (i * (height - 44)) / gridLines;
          return <line key={i} x1={0} y1={y} x2={width} y2={y} stroke="#EEF2F6" strokeWidth={1} />;
        })}
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.25} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#trendFill)" />
        <path d={linePath} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        {coords.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={2.5} fill={color} />
        ))}
        {points.map((p, i) => (
          i % Math.ceil(points.length / 10 || 1) === 0 && (
            <text key={i} x={i * stepX} y={height - 6} textAnchor="middle" className="fill-slate-400" style={{ fontSize: 9 }}>
              {p.label}
            </text>
          )
        ))}
      </svg>
    </div>
  );
}

export function WeekdayBars({ data, color = '#1565C0' }: { data: { label: string; value: number }[]; color?: string }) {
  const max = Math.max(1, ...data.map(d => d.value));
  return (
    <div className="flex items-end justify-between gap-2 h-40 px-1">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
          <span className="text-[10px] font-bold text-slate-500">{d.value}</span>
          <div className="w-full rounded-t-md transition-all" style={{ height: `${Math.max(4, (d.value / max) * 110)}px`, background: color, opacity: 0.85 }} />
          <span className="text-[10px] text-slate-400">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

export function RankedBars({ data, color = '#1565C0' }: { data: { label: string; value: number; sub?: string }[]; color?: string }) {
  const max = Math.max(1, ...data.map(d => d.value));
  return (
    <div className="space-y-3">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-28 shrink-0 text-xs font-semibold text-slate-600 truncate text-right" title={d.label}>{d.label}</div>
          <div className="flex-1 h-4 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${(d.value / max) * 100}%`, background: color }} />
          </div>
          <div className="w-16 shrink-0 text-xs text-slate-700 font-bold">{d.value}{d.sub ? <span className="text-slate-400 font-normal"> {d.sub}</span> : ''}</div>
        </div>
      ))}
    </div>
  );
}

const MEDALS = ['🥇', '🥈', '🥉'];
const MEDAL_BG = ['bg-amber-100 text-amber-700', 'bg-slate-200 text-slate-600', 'bg-orange-100 text-orange-700'];

export function Leaderboard({ items }: { items: { name: string; sub?: string; value: number; unit?: string; color?: string; initials?: string }[] }) {
  return (
    <div className="space-y-1">
      {items.map((it, i) => (
        <div key={i} className="flex items-center justify-between py-2.5 border-b border-slate-50 last:border-0">
          <div className="flex items-center gap-3">
            <span className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${MEDAL_BG[i] ?? 'bg-slate-100 text-slate-400'}`}>
              {MEDALS[i] ?? i + 1}
            </span>
            <span className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
              style={{ background: it.color ?? '#546E7A' }}>
              {it.initials ?? it.name.slice(0, 2).toUpperCase()}
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-800">{it.name}</p>
              {it.sub && <p className="text-[11px] text-slate-400">{it.sub}</p>}
            </div>
          </div>
          <div className="text-right">
            <span className="text-sm font-black text-slate-800">{it.value}</span>
            {it.unit && <span className="text-[10px] text-slate-400 ml-1">{it.unit}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
