import { useEffect, useState, useCallback } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import {
  fetchDashboardKpis,
  fetchDashboardDaily,
  fetchDashboardCampaigns,
  fetchDashboardSearchTerms,
  fetchDashboardCategories,
  fetchBudgetRecommendations,
} from '../lib/api';
import type {
  Period,
  KpiResponse,
  KpiValues,
  DailyRow,
  CampaignRow,
  SearchTermRow,
  CategoryRow,
  BudgetRecommendation,
} from '../lib/api';
import { formatMoney, formatPercent, formatDate } from '../lib/format';

const PERIODS: { value: Period; label: string }[] = [
  { value: 'L7', label: '7D' },
  { value: 'L14', label: '14D' },
  { value: 'L30', label: '30D' },
  { value: 'L60', label: '60D' },
  { value: 'L90', label: '90D' },
];

export default function Dashboard() {
  const [period, setPeriod] = useState<Period>('L30');
  const [kpis, setKpis] = useState<KpiResponse | null>(null);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [searchTerms, setSearchTerms] = useState<SearchTermRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [budgetAlerts, setBudgetAlerts] = useState<(BudgetRecommendation & { campaign_name?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (p: Period) => {
    setLoading(true);
    setError('');
    try {
      const [k, d, c, s, cat] = await Promise.all([
        fetchDashboardKpis(p),
        fetchDashboardDaily(p),
        fetchDashboardCampaigns(p),
        fetchDashboardSearchTerms(p),
        fetchDashboardCategories(p),
      ]);
      setKpis(k);
      setDaily(d);
      setCampaigns(c);
      setSearchTerms(s);
      setCategories(cat);

      // Budget recommendations — use campaign IDs from top campaigns
      try {
        const ids = c.map(camp => camp.campaign_id).filter(Boolean) as string[];
        if (ids.length) {
          const recs = await fetchBudgetRecommendations(ids);
          const nameMap = new Map(c.map(camp => [camp.campaign_id, camp.campaign_name]));
          setBudgetAlerts(recs.map(r => ({ ...r, campaign_name: nameMap.get(String(r.campaignId)) })));
        }
      } catch { /* budget recs are non-critical */ }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(period); }, [period, load]);

  function onPeriodChange(p: Period) {
    setPeriod(p);
  }

  if (error) {
    return (
      <div className="bg-rose-50 text-rose-700 px-4 py-3 rounded-lg text-sm">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header + Period selector */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          {kpis && (
            <p className="text-sm text-slate-500 mt-0.5">
              {formatDate(kpis.periodStart)} — {formatDate(kpis.periodEnd)}
            </p>
          )}
        </div>
        <PeriodSelector value={period} onChange={onPeriodChange} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          {kpis && <KpiCards kpis={kpis} />}

          {/* Budget Alerts */}
          {budgetAlerts.length > 0 && <BudgetAlerts data={budgetAlerts} />}

          {/* Time-series chart */}
          {daily.length > 0 && <DailyChart data={daily} />}

          {/* Category Performance */}
          {categories.length > 0 && <CategoriesTable data={categories} />}

          {/* Top Campaigns */}
          {campaigns.length > 0 && <CampaignsTable data={campaigns} />}

          {/* Top Search Terms */}
          {searchTerms.length > 0 && <SearchTermsTable data={searchTerms} />}
        </>
      )}
    </div>
  );
}

// ── Period Selector ──────────────────────────────────

function PeriodSelector({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <div className="flex bg-slate-100 rounded-lg p-1 gap-0.5">
      {PERIODS.map(({ value: v, label }) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`px-3.5 py-1.5 text-sm font-medium rounded-md transition-all ${
            value === v
              ? 'bg-white text-indigo-700 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ── KPI Cards ────────────────────────────────────────

const KPI_CONFIG: {
  key: keyof KpiValues;
  label: string;
  format: (v: number) => string;
  invertDelta?: boolean; // true = lower is better (ACOS, CPC)
}[] = [
  { key: 'spend', label: 'Spend', format: (v) => '$' + compactNum(v) },
  { key: 'sales', label: 'Sales', format: (v) => '$' + compactNum(v) },
  { key: 'acos', label: 'ACOS', format: (v) => formatPercent(v), invertDelta: true },
  { key: 'roas', label: 'ROAS', format: (v) => v.toFixed(2) + 'x' },
  { key: 'orders', label: 'Orders', format: (v) => v.toLocaleString() },
  { key: 'clicks', label: 'Clicks', format: (v) => compactNum(v) },
  { key: 'cpc', label: 'CPC', format: (v) => formatMoney(v), invertDelta: true },
  { key: 'ctr', label: 'CTR', format: (v) => formatPercent(v) },
];

function KpiCards({ kpis }: { kpis: KpiResponse }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
      {KPI_CONFIG.map(({ key, label, format, invertDelta }) => {
        const value = kpis.current[key];
        const change = kpis.change[key];
        return (
          <div
            key={key}
            className="bg-white rounded-lg border border-slate-200 shadow-sm p-4"
          >
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              {label}
            </p>
            <p className="text-xl font-bold text-slate-900 mt-1">{format(value)}</p>
            <DeltaBadge change={change} invert={invertDelta} />
          </div>
        );
      })}
    </div>
  );
}

function DeltaBadge({ change, invert }: { change: number | null; invert?: boolean }) {
  if (change === null) return <span className="text-xs text-slate-400 mt-1 block">N/A</span>;
  if (change === 0) return <span className="text-xs text-slate-400 mt-1 block">—</span>;

  const isPositive = change > 0;
  // For inverted metrics (ACOS, CPC), going up is bad
  const isGood = invert ? !isPositive : isPositive;

  return (
    <span
      className={`inline-flex items-center text-xs font-medium mt-1 ${
        isGood ? 'text-emerald-600' : 'text-rose-600'
      }`}
    >
      {isPositive ? '↑' : '↓'} {Math.abs(change).toFixed(1)}%
    </span>
  );
}

// ── Budget Alerts ────────────────────────────────────

function BudgetAlerts({ data }: { data: (BudgetRecommendation & { campaign_name?: string })[] }) {
  // Only show campaigns with missed opportunities
  const alerts = data.filter(r => {
    const m = r.sevenDaysMissedOpportunities;
    return m && m.percentTimeInBudget < 1;
  });

  if (!alerts.length) return null;

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-5">
      <div className="flex items-center gap-2 mb-3">
        <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
        <h3 className="text-sm font-semibold text-amber-800 uppercase tracking-wider">
          Budget-Constrained Campaigns ({alerts.length})
        </h3>
      </div>
      <div className="space-y-2">
        {alerts.map(r => {
          const m = r.sevenDaysMissedOpportunities!;
          const inBudgetPct = (m.percentTimeInBudget * 100).toFixed(0);
          const missedSales = (m.estimatedMissedSalesLower + m.estimatedMissedSalesUpper) / 2;
          const missedClicks = (m.estimatedMissedClicksLower + m.estimatedMissedClicksUpper) / 2;
          return (
            <div key={r.campaignId} className="flex items-center justify-between bg-white rounded-md px-4 py-2.5 border border-amber-100">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900 truncate" title={r.campaign_name}>
                  {r.campaign_name || r.campaignId}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  In budget {inBudgetPct}% of time
                  {missedClicks > 0 && <> · ~{Math.round(missedClicks)} missed clicks</>}
                  {missedSales > 0 && <> · ~${formatMoney(missedSales)} missed sales</>}
                </p>
              </div>
              <div className="text-right ml-4 flex-shrink-0">
                <p className="text-sm font-bold text-amber-700">${r.suggestedBudget}/day</p>
                <p className="text-xs text-slate-500">suggested</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Daily Chart ──────────────────────────────────────

function DailyChart({ data }: { data: DailyRow[] }) {
  const chartData = data.map(d => ({
    ...d,
    dateLabel: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  }));

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
      <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
        Daily Performance
      </h3>
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="dateLabel"
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            yAxisId="money"
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => '$' + compactNum(v)}
          />
          <YAxis
            yAxisId="pct"
            orientation="right"
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => v + '%'}
            domain={[0, 'auto']}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              fontSize: '12px',
            }}
            formatter={(value, name) => {
              const v = Number(value) || 0;
              if (name === 'ACOS') return [formatPercent(v), name];
              return [formatMoney(v), name];
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: '12px' }}
          />
          <Bar
            yAxisId="money"
            dataKey="spend"
            name="Spend"
            fill="#818cf8"
            radius={[2, 2, 0, 0]}
            opacity={0.7}
          />
          <Bar
            yAxisId="money"
            dataKey="sales"
            name="Sales"
            fill="#34d399"
            radius={[2, 2, 0, 0]}
            opacity={0.7}
          />
          <Line
            yAxisId="pct"
            dataKey="acos"
            name="ACOS"
            type="monotone"
            stroke="#f43f5e"
            strokeWidth={2}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Categories Table ─────────────────────────────────

function CategoriesTable({ data }: { data: CategoryRow[] }) {
  const totalSpend = data.reduce((s, c) => s + c.spend, 0);

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
      <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
        Category Performance
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200">
              <Th align="left">Category</Th>
              <Th>ASINs</Th>
              <Th>Spend</Th>
              <Th>% of Spend</Th>
              <Th>Sales</Th>
              <Th>ACOS</Th>
              <Th>ROAS</Th>
              <Th>Orders</Th>
              <Th>CPC</Th>
            </tr>
          </thead>
          <tbody>
            {data.map((c) => {
              const pctSpend = totalSpend > 0 ? (c.spend / totalSpend * 100) : 0;
              return (
                <tr key={c.category} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-2.5 px-3 font-medium text-slate-900">{c.category}</td>
                  <Td>{c.asin_count}</Td>
                  <Td>{formatMoney(c.spend)}</Td>
                  <Td>
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 bg-slate-100 rounded-full h-1.5">
                        <div
                          className="bg-indigo-500 h-1.5 rounded-full"
                          style={{ width: `${Math.min(pctSpend, 100)}%` }}
                        />
                      </div>
                      <span className="w-12 text-right">{pctSpend.toFixed(1)}%</span>
                    </div>
                  </Td>
                  <Td>{formatMoney(c.sales)}</Td>
                  <Td className={acosColor(c.acos)}>{formatPercent(c.acos)}</Td>
                  <Td>{c.roas.toFixed(2)}x</Td>
                  <Td>{c.orders.toLocaleString()}</Td>
                  <Td>{formatMoney(c.cpc)}</Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Campaigns Table ──────────────────────────────────

function CampaignsTable({ data }: { data: CampaignRow[] }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
      <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
        Top Campaigns
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200">
              <Th align="left">Campaign</Th>
              <Th>Spend</Th>
              <Th>Sales</Th>
              <Th>ACOS</Th>
              <Th>ROAS</Th>
              <Th>Orders</Th>
              <Th>CPC</Th>
              <Th>CTR</Th>
            </tr>
          </thead>
          <tbody>
            {data.map((c) => (
              <tr key={c.campaign_name} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="py-2.5 px-3 font-medium text-slate-900 max-w-xs truncate" title={c.campaign_name}>
                  {c.campaign_name}
                </td>
                <Td>{formatMoney(c.spend)}</Td>
                <Td>{formatMoney(c.sales)}</Td>
                <Td className={acosColor(c.acos)}>{formatPercent(c.acos)}</Td>
                <Td>{c.roas.toFixed(2)}x</Td>
                <Td>{c.orders.toLocaleString()}</Td>
                <Td>{formatMoney(c.cpc)}</Td>
                <Td>{formatPercent(c.ctr)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Search Terms Table ───────────────────────────────

function SearchTermsTable({ data }: { data: SearchTermRow[] }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
      <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
        Top Search Terms
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200">
              <Th align="left">Search Term</Th>
              <Th>Spend</Th>
              <Th>Sales</Th>
              <Th>ACOS</Th>
              <Th>Orders</Th>
              <Th>Clicks</Th>
              <Th>CPC</Th>
              <Th>CTR</Th>
            </tr>
          </thead>
          <tbody>
            {data.map((s) => (
              <tr key={s.search_term} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="py-2.5 px-3 font-medium text-slate-900 max-w-xs truncate" title={s.search_term}>
                  {s.search_term}
                </td>
                <Td>{formatMoney(s.spend)}</Td>
                <Td>{formatMoney(s.sales)}</Td>
                <Td className={acosColor(s.acos)}>{formatPercent(s.acos)}</Td>
                <Td>{s.orders.toLocaleString()}</Td>
                <Td>{s.clicks.toLocaleString()}</Td>
                <Td>{formatMoney(s.cpc)}</Td>
                <Td>{formatPercent(s.ctr)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Shared table components ──────────────────────────

function Th({ children, align = 'right' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th className={`py-2.5 px-3 font-semibold text-slate-600 text-${align} whitespace-nowrap`}>
      {children}
    </th>
  );
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={`py-2.5 px-3 text-right text-slate-700 whitespace-nowrap ${className}`}>
      {children}
    </td>
  );
}

// ── Utilities ────────────────────────────────────────

function acosColor(acos: number): string {
  if (acos > 30) return 'font-medium text-rose-600';
  if (acos < 20) return 'font-medium text-emerald-600';
  return 'font-medium text-amber-600';
}

function compactNum(value: number): string {
  if (Math.abs(value) >= 1_000_000) return (value / 1_000_000).toFixed(1) + 'M';
  if (Math.abs(value) >= 1_000) return (value / 1_000).toFixed(1) + 'K';
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}
