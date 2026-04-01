import { useEffect, useState, useCallback } from 'react';
import {
  fetchHealth,
  fetchDashboardCategories,
  fetchDashboardCampaigns,
} from '../lib/api';
import type { Period, CategoryRow, CampaignRow } from '../lib/api';
import api from '../lib/api';
import { formatMoney, formatPercent } from '../lib/format';

const PERIODS: { value: Period; label: string }[] = [
  { value: 'L7', label: '7D' },
  { value: 'L14', label: '14D' },
  { value: 'L30', label: '30D' },
  { value: 'L60', label: '60D' },
  { value: 'L90', label: '90D' },
];

interface TargetAcosSettings {
  default: number;
  by_category: Record<string, number>;
  by_campaign: Record<string, number>;
}

export default function Settings() {
  const [health, setHealth] = useState<{ status: string; database: string } | null>(null);
  const [period, setPeriod] = useState<Period>('L30');
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [targets, setTargets] = useState<TargetAcosSettings>({ default: 25, by_category: {}, by_campaign: {} });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<'category' | 'campaign'>('category');

  // Load settings from DB
  useEffect(() => {
    fetchHealth().then(setHealth).catch(() => {});
    api.get('/settings/target_acos').then(({ data }) => {
      if (data) setTargets({ default: 25, by_category: {}, by_campaign: {}, ...data });
    }).catch(() => {});
  }, []);

  // Load performance data when period changes
  const loadData = useCallback(async (p: Period) => {
    setLoading(true);
    try {
      const [cats, camps] = await Promise.all([
        fetchDashboardCategories(p),
        fetchDashboardCampaigns(p, 50),
      ]);
      setCategories(cats);
      setCampaigns(camps);
    } catch { /* */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(period); }, [period, loadData]);

  // Save targets
  async function handleSave() {
    setSaving(true);
    try {
      await api.put('/settings/target_acos', { value: targets });
    } catch {
      alert('Failed to save');
    } finally {
      setSaving(false);
    }
  }

  function updateCategoryTarget(category: string, value: number) {
    setTargets(prev => ({
      ...prev,
      by_category: { ...prev.by_category, [category]: value },
    }));
  }

  function updateCampaignTarget(campaign: string, value: number) {
    setTargets(prev => ({
      ...prev,
      by_campaign: { ...prev.by_campaign, [campaign]: value },
    }));
  }

  function removeCampaignTarget(campaign: string) {
    setTargets(prev => {
      const copy = { ...prev.by_campaign };
      delete copy[campaign];
      return { ...prev, by_campaign: copy };
    });
  }

  function getEffectiveTarget(category: string, campaignName?: string): number {
    if (campaignName && targets.by_campaign[campaignName] != null) return targets.by_campaign[campaignName];
    if (targets.by_category[category] != null) return targets.by_category[category];
    return targets.default;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <div className="flex items-center gap-3">
          <PeriodSelector value={period} onChange={setPeriod} />
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Save Targets'}
          </button>
        </div>
      </div>

      {/* Connection + Default ACOS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
          <p className="text-xs font-medium text-slate-500 uppercase">Database</p>
          <div className="flex items-center gap-2 mt-2">
            <div className={`w-2.5 h-2.5 rounded-full ${health?.database === 'connected' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
            <span className="text-sm text-slate-700">{health?.database ?? 'unknown'}</span>
          </div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
          <p className="text-xs font-medium text-slate-500 uppercase">Default Target ACOS</p>
          <div className="flex items-center gap-2 mt-2">
            <input
              type="number"
              value={targets.default}
              onChange={e => setTargets(prev => ({ ...prev, default: parseFloat(e.target.value) || 0 }))}
              className="w-20 px-2 py-1 text-lg font-bold text-slate-900 border border-slate-200 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              step="1"
              min="1"
              max="100"
            />
            <span className="text-lg text-slate-500">%</span>
          </div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
          <p className="text-xs font-medium text-slate-500 uppercase">Period</p>
          <p className="text-lg font-bold text-slate-900 mt-2">{period.replace('L', 'Last ')} Days</p>
          <p className="text-xs text-slate-400 mt-1">ACOS data timeframe</p>
        </div>
      </div>

      {/* Tab selector */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setTab('category')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
            tab === 'category' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          By Category
        </button>
        <button
          onClick={() => setTab('campaign')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
            tab === 'campaign' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          By Campaign (Goal)
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
        </div>
      ) : tab === 'category' ? (
        /* Category targets */
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
            Category Targets ({period.replace('L', '')}D ACOS)
          </h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <Th align="left">Category</Th>
                <Th>Spend</Th>
                <Th>Sales</Th>
                <Th>Current ACOS</Th>
                <Th>Target ACOS</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {categories.map(cat => {
                const target = getEffectiveTarget(cat.category);
                const isOver = cat.acos > target;
                const delta = cat.acos - target;
                return (
                  <tr key={cat.category} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 px-3 font-medium text-slate-900">{cat.category}</td>
                    <Td>{formatMoney(cat.spend)}</Td>
                    <Td>{formatMoney(cat.sales)}</Td>
                    <Td className={isOver ? 'font-medium text-rose-600' : 'font-medium text-emerald-600'}>
                      {formatPercent(cat.acos)}
                    </Td>
                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <input
                          type="number"
                          value={targets.by_category[cat.category] ?? targets.default}
                          onChange={e => updateCategoryTarget(cat.category, parseFloat(e.target.value) || 0)}
                          className="w-16 px-2 py-1 text-sm border border-slate-200 rounded-md text-right focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                          step="1"
                          min="1"
                          max="100"
                        />
                        <span className="text-xs text-slate-400">%</span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                        isOver ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        {isOver ? `+${delta.toFixed(1)}%` : `${delta.toFixed(1)}%`}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* Campaign (Goal) targets */
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
            Campaign Targets ({period.replace('L', '')}D ACOS)
          </h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <Th align="left">Campaign</Th>
                <Th>Spend</Th>
                <Th>Sales</Th>
                <Th>Current ACOS</Th>
                <Th>Target ACOS</Th>
                <Th>Status</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map(camp => {
                const hasCustomTarget = targets.by_campaign[camp.campaign_name] != null;
                const target = getEffectiveTarget('', camp.campaign_name);
                const isOver = camp.acos > target;
                const delta = camp.acos - target;
                return (
                  <tr key={camp.campaign_name} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 px-3 font-medium text-slate-900 max-w-[250px] truncate" title={camp.campaign_name}>
                      {camp.campaign_name}
                    </td>
                    <Td>{formatMoney(camp.spend)}</Td>
                    <Td>{formatMoney(camp.sales)}</Td>
                    <Td className={isOver ? 'font-medium text-rose-600' : 'font-medium text-emerald-600'}>
                      {formatPercent(camp.acos)}
                    </Td>
                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <input
                          type="number"
                          value={targets.by_campaign[camp.campaign_name] ?? ''}
                          placeholder={String(targets.default)}
                          onChange={e => {
                            const val = e.target.value;
                            if (val === '') {
                              removeCampaignTarget(camp.campaign_name);
                            } else {
                              updateCampaignTarget(camp.campaign_name, parseFloat(val) || 0);
                            }
                          }}
                          className={`w-16 px-2 py-1 text-sm border rounded-md text-right focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                            hasCustomTarget ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200'
                          }`}
                          step="1"
                          min="1"
                          max="100"
                        />
                        <span className="text-xs text-slate-400">%</span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                        isOver ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        {isOver ? `+${delta.toFixed(1)}%` : `${delta.toFixed(1)}%`}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center w-8">
                      {hasCustomTarget && (
                        <button
                          onClick={() => removeCampaignTarget(camp.campaign_name)}
                          className="text-slate-400 hover:text-rose-500 transition-colors"
                          title="Remove custom target (use default)"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────

function PeriodSelector({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <div className="flex bg-slate-100 rounded-lg p-1 gap-0.5">
      {PERIODS.map(({ value: v, label }) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
            value === v ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Th({ children, align = 'right' }: { children?: React.ReactNode; align?: 'left' | 'right' }) {
  return <th className={`py-2.5 px-3 font-semibold text-slate-600 text-${align} whitespace-nowrap`}>{children}</th>;
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`py-3 px-3 text-right text-slate-700 whitespace-nowrap ${className}`}>{children}</td>;
}
