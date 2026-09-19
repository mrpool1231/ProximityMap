import { LAYER_BY_ID } from "@/lib/mapConfig";
import { Scale, Trophy } from "lucide-react";

const fmt = (m) => (m == null ? "—" : m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);

function Cell({ value, sub, win, testId }) {
  return (
    <td className={`px-2 py-1.5 text-right ${win ? "text-emerald-300" : "text-slate-300"}`} data-testid={testId}>
      <div className="font-mono text-sm font-semibold">{value}</div>
      <div className="font-mono text-[10px] text-slate-500">{sub}</div>
    </td>
  );
}

export default function CompareScorecard({ dataA, dataB, loadingB }) {
  const cats = Object.keys({ ...(dataA?.categories || {}), ...(dataB?.categories || {}) });
  let winsA = 0;
  let winsB = 0;
  const rows = cats.map((cat) => {
    const a = dataA?.categories?.[cat] || [];
    const b = dataB?.categories?.[cat] || [];
    const nearA = a[0]?.distance_m;
    const nearB = b[0]?.distance_m;
    let win = null;
    if (a.length !== b.length) win = a.length > b.length ? "A" : "B";
    else if (nearA != null && nearB != null && nearA !== nearB) win = nearA < nearB ? "A" : "B";
    if (win === "A") winsA += 1;
    if (win === "B") winsB += 1;
    return { cat, a, b, nearA, nearB, win };
  });
  const verdict = winsA === winsB ? "Even match" : winsA > winsB ? "Property A leads" : "Property B leads";

  return (
    <div className="rounded-lg border border-white/5 bg-slate-900/40 p-3" data-testid="compare-scorecard">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Scale size={13} className="text-teal-300" />
          <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400">Amenity scorecard</span>
        </div>
        <span className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-amber-300" data-testid="compare-verdict">
          <Trophy size={11} /> {loadingB ? "Scoring…" : verdict}
        </span>
      </div>
      <table className="w-full">
        <thead>
          <tr className="text-[10px] font-mono uppercase tracking-widest text-slate-500">
            <th className="pb-1 text-left">Category</th>
            <th className="pb-1 text-right text-amber-300">A</th>
            <th className="pb-1 text-right text-teal-300">B</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ cat, a, b, nearA, nearB, win }) => (
            <tr key={cat} className="border-t border-white/5" data-testid={`compare-row-${cat}`}>
              <td className="py-1.5 pr-2">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: LAYER_BY_ID[cat]?.color }} />
                  <span className="text-xs text-slate-200">{LAYER_BY_ID[cat]?.label || cat}</span>
                </div>
              </td>
              <Cell value={a.length} sub={fmt(nearA)} win={win === "A"} testId={`compare-a-${cat}`} />
              <Cell value={loadingB ? "…" : b.length} sub={loadingB ? "" : fmt(nearB)} win={win === "B"} testId={`compare-b-${cat}`} />
            </tr>
          ))}
          <tr className="border-t border-white/10">
            <td className="py-1.5 text-xs font-semibold text-slate-200">Total</td>
            <Cell value={dataA?.total ?? 0} sub={`${winsA} wins`} win={winsA > winsB} testId="compare-total-a" />
            <Cell value={loadingB ? "…" : dataB?.total ?? 0} sub={loadingB ? "" : `${winsB} wins`} win={winsB > winsA} testId="compare-total-b" />
          </tr>
        </tbody>
      </table>
    </div>
  );
}
