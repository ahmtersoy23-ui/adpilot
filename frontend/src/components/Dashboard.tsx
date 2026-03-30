import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getLatestSnapshot, getStats, getActionSummary, getActions, getSnapshots, Stats, Snapshot, ActionSummary, Action } from '../api/client';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';
const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899'];

// Custom tick component for multi-line labels
const CustomAxisTick = (props: any) => {
  const { x, y, payload } = props;
  const lines = payload.value.split(' '); // Split by space

  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={0}
        y={0}
        dy={25}
        textAnchor="middle"
        fill="#374151"
        fontSize={12}
      >
        {lines.map((line: string, index: number) => (
          <tspan x={0} dy={index === 0 ? 0 : 15} key={index}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
};

export const Dashboard: React.FC = () => {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [allSnapshots, setAllSnapshots] = useState<Snapshot[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [actionSummary, setActionSummary] = useState<ActionSummary[]>([]);
  const [quickWins, setQuickWins] = useState<Action[]>([]);
  const [allActions, setAllActions] = useState<Action[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [snapshotRes, statsRes, snapshotsRes] = await Promise.all([
          getLatestSnapshot(),
          getStats(),
          getSnapshots(),
        ]);

        setSnapshot(snapshotRes.data);
        setStats(statsRes.data);
        setAllSnapshots(snapshotsRes.data);

        if (snapshotRes.data?.id) {
          const [summaryRes, prioritySummaryRes, p1ActionsRes, allActionsRes] = await Promise.all([
            getActionSummary(snapshotRes.data.id), // Action type summary
            getActionSummary(snapshotRes.data.id, 'priority'), // Priority summary
            getActions(snapshotRes.data.id, { priority: 'P1' }),
            getActions(snapshotRes.data.id),
          ]);
          // Combine both summaries for different charts
          setActionSummary([...summaryRes.data, ...prioritySummaryRes.data]);
          setQuickWins(p1ActionsRes.data.slice(0, 10)); // Top 10 P1 actions
          setAllActions(allActionsRes.data);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-4"></div>
          <div className="text-xl font-semibold text-gray-700">Loading dashboard...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-red-50 to-orange-50">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md">
          <div className="text-6xl mb-4">❌</div>
          <div className="text-xl font-bold text-red-600 mb-2">Error Loading Data</div>
          <div className="text-gray-600">{error}</div>
        </div>
      </div>
    );
  }

  // Filter action type summary (where priority === 'all')
  const actionTypeSummary = actionSummary.filter(item => item.priority === 'all');
  // Filter priority summary (where action_type === 'all')
  const prioritySummary = actionSummary.filter(item => item.action_type === 'all');

  const totalActions = actionTypeSummary.reduce((sum, item) => sum + parseInt(item.count.toString()), 0);
  const totalSavings = actionTypeSummary.reduce((sum, item) => sum + parseFloat(item.total_savings.toString()), 0);

  // Calculate savings by priority for Strategic Roadmap
  const p1Savings = prioritySummary.find(item => item.priority === 'P1')?.total_savings || 0;
  const p2Savings = prioritySummary.find(item => item.priority === 'P2')?.total_savings || 0;
  const p3Savings = prioritySummary.find(item => item.priority === 'P3')?.total_savings || 0;

  const phase1Savings = parseFloat(p1Savings.toString()); // P1 = This week / Quick wins
  const phase2Savings = parseFloat(p2Savings.toString()); // P2 = This month / Medium priority
  const phase3Savings = parseFloat(p3Savings.toString()); // P3 = Process / Long-term

  const actionTypeData = actionTypeSummary.map(item => {
    const labels: Record<string, string> = {
      'negative_add': 'Negatif KW',
      'negative_asin_add': 'Negatif ASIN',
      'campaign_pause': 'Kampanya Durdur',
      'asin_remove': 'ASIN Kaldır',
    };
    return {
      name: labels[item.action_type] || item.action_type,
      count: parseInt(item.count.toString()),
    };
  });

  const priorityData = prioritySummary.map(item => ({
    name: item.priority,
    value: parseInt(item.count.toString()),
  }));

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Header */}
      <header className="bg-white shadow-xl border-b-4 border-gradient-to-r from-blue-500 to-purple-500">
        <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-5xl font-black bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
                🎯 Keyword Ownership Engine
              </h1>
              <p className="mt-2 text-gray-600 font-medium">Amazon PPC Multi-Product Portfolio Optimization</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => window.location.href = '/settings'}
                className="bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white font-bold py-4 px-6 rounded-xl shadow-2xl transition duration-200 transform hover:scale-105 flex items-center space-x-2"
              >
                <span className="text-2xl">⚙️</span>
                <span>Settings</span>
              </button>
              <button
                onClick={() => window.location.href = '/upload'}
                className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-bold py-4 px-8 rounded-xl shadow-2xl transition duration-200 transform hover:scale-105 flex items-center space-x-2"
              >
                <span className="text-2xl">📤</span>
                <span>Yeni Rapor Yükle</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl shadow-xl p-6 text-white transform hover:scale-105 transition">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-100 text-sm font-medium mb-1">Products</p>
                <p className="text-4xl font-black">{stats?.products.toLocaleString()}</p>
              </div>
              <div className="text-6xl opacity-20">📦</div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl shadow-xl p-6 text-white transform hover:scale-105 transition">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-purple-100 text-sm font-medium mb-1">Campaigns</p>
                <p className="text-4xl font-black">{stats?.campaigns.toLocaleString()}</p>
              </div>
              <div className="text-6xl opacity-20">📊</div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-pink-500 to-pink-600 rounded-2xl shadow-xl p-6 text-white transform hover:scale-105 transition">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-pink-100 text-sm font-medium mb-1">Keywords</p>
                <p className="text-4xl font-black">{stats?.keywords.toLocaleString()}</p>
              </div>
              <div className="text-6xl opacity-20">🔑</div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-2xl shadow-xl p-6 text-white transform hover:scale-105 transition">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-indigo-100 text-sm font-medium mb-1">Snapshots</p>
                <p className="text-4xl font-black">{stats?.snapshots.toLocaleString()}</p>
              </div>
              <div className="text-6xl opacity-20">📸</div>
            </div>
          </div>

          {/* Other SKU Gauge */}
          {stats?.otherSkuRatio && (
            <Link to="/other-sku" className="block">
              <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl shadow-xl p-6 text-white transform hover:scale-105 transition cursor-pointer">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-orange-100 text-sm font-medium mb-1">Other SKU Ratio</p>
                    <p className="text-4xl font-black">{stats.otherSkuRatio.percentage.toFixed(1)}%</p>
                  </div>
                  <div className="text-6xl opacity-20">🔀</div>
                </div>
                <div className="text-xs text-orange-100">
                  <div>Advertised: ${stats.otherSkuRatio.advSales.toLocaleString()}</div>
                  <div>Other: ${stats.otherSkuRatio.otherSales.toLocaleString()}</div>
                </div>
                <div className="mt-2 text-xs text-orange-200 font-medium">
                  👉 Click for details
                </div>
              </div>
            </Link>
          )}
        </div>

        {/* Latest Snapshot */}
        {snapshot && (
          <div className="bg-white rounded-2xl shadow-2xl p-8 mb-8 border-2 border-gray-100">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
              <span className="text-3xl mr-3">📅</span>
              Latest Snapshot
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
              <div className="text-center p-4 bg-gray-50 rounded-xl">
                <p className="text-xs text-gray-500 font-medium mb-2">Period</p>
                <p className="text-sm font-bold text-gray-900">
                  {new Date(snapshot.period_start).toLocaleDateString('tr-TR')}
                </p>
                <p className="text-xs text-gray-400">-</p>
                <p className="text-sm font-bold text-gray-900">
                  {new Date(snapshot.period_end).toLocaleDateString('tr-TR')}
                </p>
              </div>
              <div className="text-center p-4 bg-blue-50 rounded-xl">
                <p className="text-xs text-blue-600 font-medium mb-2">Marketplace</p>
                <p className="text-2xl font-black text-blue-900">{snapshot.marketplace}</p>
              </div>
              <div className="text-center p-4 bg-purple-50 rounded-xl">
                <p className="text-xs text-purple-600 font-medium mb-2">Spend</p>
                <p className="text-lg font-black text-purple-900">${snapshot.total_spend.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-xl">
                <p className="text-xs text-green-600 font-medium mb-2">Sales</p>
                <p className="text-lg font-black text-green-900">${snapshot.total_sales.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
              </div>
              <div className="text-center p-4 bg-gradient-to-br from-red-50 to-orange-50 rounded-xl">
                <p className="text-xs text-orange-600 font-medium mb-2">ACoS</p>
                <p className={`text-2xl font-black ${Number(snapshot.acos) > 50 ? 'text-red-600' : Number(snapshot.acos) > 30 ? 'text-orange-600' : 'text-green-600'}`}>
                  {snapshot.acos ? Number(snapshot.acos).toFixed(1) : '0.0'}%
                </p>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-xl">
                <p className="text-xs text-gray-500 font-medium mb-2">Uploaded</p>
                <p className="text-sm font-bold text-gray-900">{new Date(snapshot.upload_date).toLocaleDateString('tr-TR')}</p>
              </div>
            </div>
          </div>
        )}

        {/* Quick Wins & Strategic Overview */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Quick Wins Widget */}
          <div className="bg-gradient-to-br from-red-50 to-orange-50 rounded-2xl shadow-2xl p-8 border-2 border-red-200">
            <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center">
              <span className="text-3xl mr-3">🔥</span>
              Quick Wins (P1)
            </h2>
            <p className="text-gray-600 mb-6">En yüksek öncelikli aksiyonlar - bugün başla!</p>
            {quickWins.length > 0 ? (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {quickWins.map((action, index) => (
                  <div key={action.id} className="bg-white rounded-lg p-4 shadow-md border-l-4 border-red-500">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-lg font-bold text-red-600">#{index + 1}</span>
                          <span className="text-xs font-semibold px-2 py-1 rounded bg-red-100 text-red-700">
                            {action.action_type === 'campaign_pause' && 'Kampanya Kapat'}
                            {action.action_type === 'negative_add' && 'Negative KW'}
                            {action.action_type === 'asin_remove' && 'ASIN Kaldır'}
                            {action.action_type === 'negative_asin_add' && 'Negative ASIN'}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-gray-900 mb-1">
                          {action.target_campaign}
                        </p>
                        {action.target_keyword && (
                          <p className="text-xs text-gray-600">KW: {action.target_keyword}</p>
                        )}
                        {action.target_asin && (
                          <p className="text-xs text-gray-600">ASIN: {action.target_asin}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-black text-green-600">
                          ${Number(action.estimated_monthly_savings).toFixed(0)}
                        </p>
                        <p className="text-xs text-gray-500">/ ay</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8">P1 aksiyonu bulunamadı</p>
            )}
            <button
              onClick={() => window.location.href = '/actions?priority=P1'}
              className="mt-6 w-full bg-gradient-to-r from-red-500 to-orange-600 hover:from-red-600 hover:to-orange-700 text-white font-bold py-3 px-6 rounded-xl shadow-lg transition transform hover:scale-105"
            >
              Tüm P1 Aksiyonları Gör →
            </button>
          </div>

          {/* Strategic Overview */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl shadow-2xl p-8 border-2 border-blue-200">
            <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center">
              <span className="text-3xl mr-3">🎯</span>
              Stratejik Yol Haritası
            </h2>
            <p className="text-gray-600 mb-6">Fazlı uygulama planı ve tasarruf hedefleri</p>

            <div className="space-y-4">
              {/* Phase 1 */}
              <div className="bg-white rounded-xl p-5 shadow-md border-l-4 border-green-500">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">✅</span>
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">Faz 1: Bu Hafta (P1)</h3>
                      <p className="text-xs text-gray-600">Yüksek öncelik - Hızlı kazanım</p>
                    </div>
                  </div>
                  <p className="text-xl font-black text-green-600">~${phase1Savings.toLocaleString(undefined, { maximumFractionDigits: 0 })}/ay</p>
                </div>
                <ul className="text-sm text-gray-700 space-y-1 ml-11">
                  <li>• Kampanya kapat (P1)</li>
                  <li>• Top negative keyword ekle</li>
                </ul>
              </div>

              {/* Phase 2 */}
              <div className="bg-white rounded-xl p-5 shadow-md border-l-4 border-yellow-500">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">⏳</span>
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">Faz 2: Bu Ay (P2)</h3>
                      <p className="text-xs text-gray-600">Orta öncelik - Bid & ASIN optimize</p>
                    </div>
                  </div>
                  <p className="text-xl font-black text-yellow-600">+${phase2Savings.toLocaleString(undefined, { maximumFractionDigits: 0 })}/ay</p>
                </div>
                <ul className="text-sm text-gray-700 space-y-1 ml-11">
                  <li>• Auto bid ayarla</li>
                  <li>• Düşük performanslı ASIN kaldır</li>
                </ul>
              </div>

              {/* Phase 3 */}
              <div className="bg-white rounded-xl p-5 shadow-md border-l-4 border-purple-500">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">🚀</span>
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">Faz 3: Süreç (P3)</h3>
                      <p className="text-xs text-gray-600">Düşük öncelik - Ownership optimize</p>
                    </div>
                  </div>
                  <p className="text-xl font-black text-purple-600">+${phase3Savings.toLocaleString(undefined, { maximumFractionDigits: 0 })}/ay</p>
                </div>
                <ul className="text-sm text-gray-700 space-y-1 ml-11">
                  <li>• Ownership-bazlı negative KW</li>
                  <li>• ASIN çakışma çözümü</li>
                </ul>
              </div>
            </div>

            <div className="mt-6 p-4 bg-indigo-100 rounded-xl border-2 border-indigo-300">
              <p className="text-indigo-900 font-medium text-sm">
                <strong>💡 Toplam Potansiyel:</strong> P1+P2 <strong className="text-indigo-700">~${(phase1Savings + phase2Savings).toLocaleString(undefined, { maximumFractionDigits: 0 })}/ay</strong> (hızlı),
                Tüm aksiyonlar <strong className="text-indigo-700">${totalSavings.toLocaleString(undefined, { maximumFractionDigits: 0 })}/ay</strong> maksimum
              </p>
            </div>
          </div>
        </div>

        {/* Applied Actions Tracker */}
        {allActions.length > 0 && (() => {
          const appliedActions = allActions.filter(a => a.status === 'applied');
          const skippedActions = allActions.filter(a => a.status === 'skipped');
          const pendingActions = allActions.filter(a => a.status === 'pending');
          const totalAppliedSavings = appliedActions.reduce((sum, a) => sum + Number(a.estimated_monthly_savings), 0);
          const appliedPercentage = (appliedActions.length / allActions.length) * 100;

          return (
            <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl shadow-2xl p-8 mb-8 border-2 border-emerald-200">
              <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center">
                <span className="text-3xl mr-3">📊</span>
                Uygulama Takibi
              </h2>
              <p className="text-gray-600 mb-6">Uygulanan aksiyonlar ve tasarruf takibi</p>

              {/* Progress Bar */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">İlerleme</span>
                  <span className="text-sm font-bold text-emerald-700">{appliedPercentage.toFixed(1)}% Tamamlandı</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-emerald-500 to-green-600 h-4 rounded-full transition-all duration-500"
                    style={{ width: `${appliedPercentage}%` }}
                  />
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-white rounded-xl p-4 shadow-md">
                  <p className="text-xs text-gray-500 mb-1">Toplam Aksiyon</p>
                  <p className="text-2xl font-black text-gray-900">{allActions.length}</p>
                </div>
                <div className="bg-green-100 rounded-xl p-4 shadow-md border-2 border-green-300">
                  <p className="text-xs text-green-700 mb-1">✅ Uygulandı</p>
                  <p className="text-2xl font-black text-green-700">{appliedActions.length}</p>
                </div>
                <div className="bg-yellow-100 rounded-xl p-4 shadow-md border-2 border-yellow-300">
                  <p className="text-xs text-yellow-700 mb-1">⏭️ Atlandı</p>
                  <p className="text-2xl font-black text-yellow-700">{skippedActions.length}</p>
                </div>
                <div className="bg-gray-100 rounded-xl p-4 shadow-md">
                  <p className="text-xs text-gray-600 mb-1">⏳ Beklemede</p>
                  <p className="text-2xl font-black text-gray-700">{pendingActions.length}</p>
                </div>
              </div>

              {/* Savings Achieved */}
              <div className="bg-white rounded-xl p-6 shadow-lg border-2 border-emerald-300">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">💰 Elde Edilen Tasarruf</p>
                    <p className="text-4xl font-black text-emerald-600">
                      ${totalAppliedSavings.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      <span className="text-lg text-gray-500">/ay</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">Potansiyel Toplam</p>
                    <p className="text-xl font-bold text-gray-700">${totalSavings.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Snapshot Comparison */}
        {allSnapshots.length >= 2 && (() => {
          const [current, previous] = allSnapshots.slice(0, 2);
          const spendChange = Number(current.total_spend) - Number(previous.total_spend);
          const salesChange = Number(current.total_sales) - Number(previous.total_sales);
          const acosChange = Number(current.acos) - Number(previous.acos);
          const spendChangePercent = (spendChange / Number(previous.total_spend)) * 100;
          const salesChangePercent = (salesChange / Number(previous.total_sales)) * 100;

          return (
            <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-2xl shadow-2xl p-8 mb-8 border-2 border-purple-200">
              <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center">
                <span className="text-3xl mr-3">📈</span>
                Snapshot Karşılaştırma
              </h2>
              <p className="text-gray-600 mb-6">
                Son iki snapshot arasındaki değişim (
                {new Date(previous.period_end).toLocaleDateString('tr-TR')} →{' '}
                {new Date(current.period_end).toLocaleDateString('tr-TR')})
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Spend Change */}
                <div className="bg-white rounded-xl p-6 shadow-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-600">💸 Spend</span>
                    <span className={`text-xs font-bold px-2 py-1 rounded ${
                      spendChange < 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {spendChange < 0 ? '↓' : '↑'} {Math.abs(spendChangePercent).toFixed(1)}%
                    </span>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <p className="text-xs text-gray-500">Önceki</p>
                      <p className="text-lg font-bold text-gray-700">
                        ${Number(previous.total_spend).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </p>
                    </div>
                    <div className="text-center text-xl">→</div>
                    <div>
                      <p className="text-xs text-gray-500">Şu an</p>
                      <p className="text-2xl font-black text-purple-600">
                        ${Number(current.total_spend).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </p>
                    </div>
                  </div>
                  <div className={`mt-3 text-sm font-bold ${spendChange < 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {spendChange < 0 ? '✅ Azaldı: ' : '⚠️ Arttı: '}
                    ${Math.abs(spendChange).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </div>
                </div>

                {/* Sales Change */}
                <div className="bg-white rounded-xl p-6 shadow-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-600">💰 Sales</span>
                    <span className={`text-xs font-bold px-2 py-1 rounded ${
                      salesChange > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {salesChange > 0 ? '↑' : '↓'} {Math.abs(salesChangePercent).toFixed(1)}%
                    </span>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <p className="text-xs text-gray-500">Önceki</p>
                      <p className="text-lg font-bold text-gray-700">
                        ${Number(previous.total_sales).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </p>
                    </div>
                    <div className="text-center text-xl">→</div>
                    <div>
                      <p className="text-xs text-gray-500">Şu an</p>
                      <p className="text-2xl font-black text-green-600">
                        ${Number(current.total_sales).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </p>
                    </div>
                  </div>
                  <div className={`mt-3 text-sm font-bold ${salesChange > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {salesChange > 0 ? '✅ Arttı: ' : '⚠️ Azaldı: '}
                    ${Math.abs(salesChange).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </div>
                </div>

                {/* ACoS Change */}
                <div className="bg-white rounded-xl p-6 shadow-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-600">🎯 ACoS</span>
                    <span className={`text-xs font-bold px-2 py-1 rounded ${
                      acosChange < 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {acosChange < 0 ? '↓' : '↑'} {Math.abs(acosChange).toFixed(1)}pp
                    </span>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <p className="text-xs text-gray-500">Önceki</p>
                      <p className="text-lg font-bold text-gray-700">
                        {Number(previous.acos).toFixed(1)}%
                      </p>
                    </div>
                    <div className="text-center text-xl">→</div>
                    <div>
                      <p className="text-xs text-gray-500">Şu an</p>
                      <p className={`text-2xl font-black ${
                        Number(current.acos) < 30 ? 'text-green-600' : Number(current.acos) < 50 ? 'text-orange-600' : 'text-red-600'
                      }`}>
                        {Number(current.acos).toFixed(1)}%
                      </p>
                    </div>
                  </div>
                  <div className={`mt-3 text-sm font-bold ${acosChange < 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {acosChange < 0 ? '✅ İyileşti' : '⚠️ Kötüleşti'}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Action Summary */}
        <div className="bg-white rounded-2xl shadow-2xl p-8 mb-8 border-2 border-gray-100">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
            <span className="text-3xl mr-3">⚡</span>
            Action Summary
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-8 text-white shadow-xl">
              <p className="text-blue-100 text-sm font-medium mb-2">Total Actions</p>
              <p className="text-6xl font-black">{totalActions.toLocaleString()}</p>
            </div>
            <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl p-8 text-white shadow-xl">
              <p className="text-green-100 text-sm font-medium mb-2">Est. Monthly Savings</p>
              <p className="text-5xl font-black">${totalSavings.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-gray-50 rounded-xl p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Actions by Type</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={actionTypeData} margin={{ bottom: 80 }} barCategoryGap="25%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="name"
                    height={100}
                    interval={0}
                    tick={<CustomAxisTick />}
                  />
                  <YAxis tick={{ fill: '#374151' }} />
                  <Tooltip contentStyle={{ borderRadius: '0.5rem', border: '2px solid #3b82f6' }} />
                  <Bar dataKey="count" fill="#3b82f6" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-gray-50 rounded-xl p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Priority Distribution</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={priorityData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={(entry) => `${entry.name}: ${entry.value}`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {priorityData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Navigation Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <button
            onClick={() => window.location.href = '/actions'}
            className="bg-gradient-to-br from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-bold py-8 px-6 rounded-2xl shadow-2xl transition duration-200 transform hover:scale-105 text-left"
          >
            <div className="text-5xl mb-3">⚡</div>
            <div className="text-2xl font-black mb-2">Action List</div>
            <div className="text-blue-100 text-sm">View all optimization actions</div>
          </button>

          <button
            onClick={() => window.location.href = '/ownership'}
            className="bg-gradient-to-br from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white font-bold py-8 px-6 rounded-2xl shadow-2xl transition duration-200 transform hover:scale-105 text-left"
          >
            <div className="text-5xl mb-3">👑</div>
            <div className="text-2xl font-black mb-2">Ownership Matrix</div>
            <div className="text-purple-100 text-sm">Keyword ownership analysis</div>
          </button>

          <button
            onClick={() => window.location.href = '/categories'}
            className="bg-gradient-to-br from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 text-white font-bold py-8 px-6 rounded-2xl shadow-2xl transition duration-200 transform hover:scale-105 text-left"
          >
            <div className="text-5xl mb-3">📊</div>
            <div className="text-2xl font-black mb-2">Categories</div>
            <div className="text-pink-100 text-sm">Performance by category</div>
          </button>

          <button
            onClick={() => window.location.href = '/asins'}
            className="bg-gradient-to-br from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-bold py-8 px-6 rounded-2xl shadow-2xl transition duration-200 transform hover:scale-105 text-left"
          >
            <div className="text-5xl mb-3">📦</div>
            <div className="text-2xl font-black mb-2">ASIN Performance</div>
            <div className="text-green-100 text-sm">Impressions, clicks, conversions</div>
          </button>

          <button
            onClick={() => window.location.href = '/keywords'}
            className="bg-gradient-to-br from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white font-bold py-8 px-6 rounded-2xl shadow-2xl transition duration-200 transform hover:scale-105 text-left"
          >
            <div className="text-5xl mb-3">🔑</div>
            <div className="text-2xl font-black mb-2">Keyword Performance</div>
            <div className="text-indigo-100 text-sm">Impressions, clicks, conversions</div>
          </button>
        </div>

        {/* Export Downloads */}
        {snapshot && (
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl shadow-2xl p-8 border-2 border-green-200">
            <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center">
              <span className="text-3xl mr-3">📥</span>
              Export Downloads
            </h2>
            <p className="text-gray-600 mb-6">Download ready-to-use optimization files</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <a
                href={`${API_BASE_URL}/api/snapshots/${snapshot.id}/export/bulk`}
                download
                className="flex items-center justify-center bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-bold py-6 px-6 rounded-xl shadow-xl transition duration-200 transform hover:scale-105"
              >
                <span className="text-3xl mr-3">📋</span>
                <span className="text-lg">Amazon Bulk Sheet</span>
              </a>
              <a
                href={`${API_BASE_URL}/api/snapshots/${snapshot.id}/export/perpetua`}
                download
                className="flex items-center justify-center bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-bold py-6 px-6 rounded-xl shadow-xl transition duration-200 transform hover:scale-105"
              >
                <span className="text-3xl mr-3">📝</span>
                <span className="text-lg">Perpetua Checklist</span>
              </a>
              <a
                href={`${API_BASE_URL}/api/snapshots/${snapshot.id}/export/matrix`}
                download
                className="flex items-center justify-center bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white font-bold py-6 px-6 rounded-xl shadow-xl transition duration-200 transform hover:scale-105"
              >
                <span className="text-3xl mr-3">📊</span>
                <span className="text-lg">Ownership Matrix</span>
              </a>
            </div>
            <div className="mt-6 p-6 bg-blue-100 rounded-xl border-2 border-blue-300">
              <p className="text-blue-900 font-medium">
                <strong>💡 Tip:</strong> Upload the Bulk Sheet directly to Amazon Ads Console.
                Use the Perpetua Checklist for manual actions in your Perpetua dashboard.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
