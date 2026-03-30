import React, { useEffect, useState } from 'react';
import { getLatestSnapshot, getCategories, CategoryPerformance } from '../api/client';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export const Categories: React.FC = () => {
  const [categories, setCategories] = useState<CategoryPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'performance' | 'insights'>('performance');

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        setLoading(true);
        const snapshotRes = await getLatestSnapshot();
        if (snapshotRes.data?.id) {
          const categoriesRes = await getCategories(snapshotRes.data.id);
          setCategories(categoriesRes.data);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load category data');
      } finally {
        setLoading(false);
      }
    };

    fetchCategories();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-xl text-gray-600">Loading categories...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-xl text-red-600">Error: {error}</div>
      </div>
    );
  }

  const totalSpend = categories.reduce((sum, c) => sum + parseFloat(c.total_spend.toString()), 0);
  const totalSales = categories.reduce((sum, c) => sum + parseFloat(c.total_sales.toString()), 0);
  const overallAcos = totalSales > 0 ? (totalSpend / totalSales * 100) : 0;

  const chartData = categories.map(c => ({
    name: c.category,
    Spend: parseFloat(c.total_spend.toString()),
    Sales: parseFloat(c.total_sales.toString()),
    ACoS: parseFloat(c.acos.toString()),
  }));

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">📊 Category Performance</h1>
              <p className="mt-1 text-sm text-gray-500">Performance metrics by product category</p>
            </div>
            <button
              onClick={() => window.location.href = '/'}
              className="bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded-lg transition duration-150"
            >
              ← Back to Dashboard
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {/* Summary */}
        <div className="bg-white shadow rounded-lg mb-6 p-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-gray-500">Total Categories</p>
              <p className="text-2xl font-bold text-gray-900">{categories.length}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Spend</p>
              <p className="text-2xl font-bold text-blue-600">${totalSpend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Sales</p>
              <p className="text-2xl font-bold text-green-600">${totalSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Overall ACoS</p>
              <p className={`text-2xl font-bold ${overallAcos > 50 ? 'text-red-600' : overallAcos > 30 ? 'text-yellow-600' : 'text-green-600'}`}>
                {overallAcos.toFixed(2)}%
              </p>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="bg-white shadow rounded-lg mb-6 p-2">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('performance')}
              className={`flex-1 py-3 px-6 rounded-lg font-semibold transition ${
                activeTab === 'performance'
                  ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              📊 Performance
            </button>
            <button
              onClick={() => setActiveTab('insights')}
              className={`flex-1 py-3 px-6 rounded-lg font-semibold transition ${
                activeTab === 'insights'
                  ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              💡 Strategic Insights
            </button>
          </div>
        </div>

        {/* Performance Tab */}
        {activeTab === 'performance' && (
          <>
            {/* Charts */}
        <div className="bg-white shadow rounded-lg mb-6 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Spend vs Sales by Category</h2>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" angle={-45} textAnchor="end" height={120} fontSize={12} />
              <YAxis />
              <Tooltip formatter={(value: any) => `$${parseFloat(value).toFixed(2)}`} />
              <Legend />
              <Bar dataKey="Spend" fill="#0ea5e9" />
              <Bar dataKey="Sales" fill="#10b981" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white shadow rounded-lg mb-6 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">ACoS by Category</h2>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" angle={-45} textAnchor="end" height={120} fontSize={12} />
              <YAxis label={{ value: 'ACoS (%)', angle: -90, position: 'insideLeft' }} />
              <Tooltip formatter={(value: any) => `${parseFloat(value).toFixed(2)}%`} />
              <Bar dataKey="ACoS" fill="#f59e0b" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Category Table */}
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <h2 className="text-xl font-semibold text-gray-900 p-6 pb-4">Category Details</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ASINs</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product Groups</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Spend</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Sales</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ACoS</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ROI</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {categories.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                      No category data available
                    </td>
                  </tr>
                ) : (
                  categories.map((cat) => {
                    const spend = parseFloat(cat.total_spend.toString());
                    const sales = parseFloat(cat.total_sales.toString());
                    const acos = parseFloat(cat.acos.toString());
                    const roi = spend > 0 ? ((sales - spend) / spend * 100) : 0;

                    return (
                      <tr key={cat.category} className="hover:bg-gray-50">
                        <td className="px-6 py-4 text-sm font-medium text-gray-900">
                          {cat.category}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {cat.asin_count}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {cat.product_groups}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          ${spend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          ${sales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`text-sm font-medium ${acos > 50 ? 'text-red-600' : acos > 30 ? 'text-yellow-600' : 'text-green-600'}`}>
                            {acos.toFixed(2)}%
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`text-sm font-medium ${roi < 0 ? 'text-red-600' : roi < 50 ? 'text-yellow-600' : 'text-green-600'}`}>
                            {roi >= 0 ? '+' : ''}{roi.toFixed(2)}%
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
          </>
        )}

        {/* Insights Tab */}
        {activeTab === 'insights' && (
          <div className="space-y-6">
            {/* Risk Matrix */}
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                <span>🎯</span>
                Category Risk & Opportunity Matrix
              </h2>
              <div className="grid grid-cols-1 gap-4">
                {categories.map((cat) => {
                  const spend = parseFloat(cat.total_spend.toString());
                  const sales = parseFloat(cat.total_sales.toString());
                  const acos = parseFloat(cat.acos.toString());
                  const roi = spend > 0 ? ((sales - spend) / spend * 100) : 0;

                  // Determine risk level
                  let riskLevel: 'low' | 'medium' | 'high' | 'critical';
                  let riskColor: string;
                  let riskLabel: string;

                  if (acos > 100) {
                    riskLevel = 'critical';
                    riskColor = 'from-red-500 to-red-600';
                    riskLabel = '🔴 Critical';
                  } else if (acos > 50) {
                    riskLevel = 'high';
                    riskColor = 'from-orange-500 to-orange-600';
                    riskLabel = '🟠 High Risk';
                  } else if (acos > 30) {
                    riskLevel = 'medium';
                    riskColor = 'from-yellow-500 to-yellow-600';
                    riskLabel = '🟡 Medium';
                  } else {
                    riskLevel = 'low';
                    riskColor = 'from-green-500 to-green-600';
                    riskLabel = '🟢 Healthy';
                  }

                  return (
                    <div key={cat.category} className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl p-5 border-2 border-gray-200">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <h3 className="text-lg font-bold text-gray-900 mb-1">{cat.category}</h3>
                          <div className="flex items-center gap-3 mb-2">
                            <span className={`px-3 py-1 rounded-lg text-sm font-bold text-white bg-gradient-to-r ${riskColor} shadow`}>
                              {riskLabel}
                            </span>
                            <span className="text-sm text-gray-600">
                              {cat.asin_count} ASINs · {cat.product_groups} Groups
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-gray-500">ROI</p>
                          <p className={`text-2xl font-black ${roi < 0 ? 'text-red-600' : roi < 50 ? 'text-yellow-600' : 'text-green-600'}`}>
                            {roi >= 0 ? '+' : ''}{roi.toFixed(0)}%
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3 mb-4">
                        <div className="bg-white rounded-lg p-3">
                          <p className="text-xs text-gray-500 mb-1">Spend</p>
                          <p className="text-sm font-bold text-gray-900">${spend.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                        </div>
                        <div className="bg-white rounded-lg p-3">
                          <p className="text-xs text-gray-500 mb-1">Sales</p>
                          <p className="text-sm font-bold text-gray-900">${sales.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                        </div>
                        <div className="bg-white rounded-lg p-3">
                          <p className="text-xs text-gray-500 mb-1">ACoS</p>
                          <p className="text-sm font-bold text-gray-900">{acos.toFixed(1)}%</p>
                        </div>
                      </div>

                      {/* Priority Actions */}
                      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 border-2 border-blue-200">
                        <p className="text-xs font-semibold text-blue-900 mb-3 flex items-center gap-2">
                          <span>🎯</span>
                          Öncelikli Aksiyonlar:
                        </p>
                        <div className="space-y-2">
                          {/* Critical Actions (ACoS > 100) */}
                          {acos > 100 && (
                            <div className="bg-red-100 border-l-4 border-red-500 p-2 rounded">
                              <p className="text-xs font-bold text-red-900 mb-1">🔥 ACİL (P1)</p>
                              <ul className="text-xs text-red-800 space-y-0.5">
                                <li>→ <strong>Campaign Pause:</strong> Zararlı kampanyaları durdur</li>
                                <li>→ <strong>Negative Keywords:</strong> Sıfır satış keywordleri ekle</li>
                                <li>→ <strong>Bid Reduction:</strong> CPC'yi %50+ düşür</li>
                              </ul>
                            </div>
                          )}

                          {/* High Priority Actions (50 < ACoS <= 100) */}
                          {acos > 50 && acos <= 100 && (
                            <div className="bg-orange-100 border-l-4 border-orange-500 p-2 rounded">
                              <p className="text-xs font-bold text-orange-900 mb-1">⚡ YÜKSEK ÖNCELİK (P2)</p>
                              <ul className="text-xs text-orange-800 space-y-0.5">
                                <li>→ <strong>Negative Keywords:</strong> Düşük ROI'li terimleri filtrele</li>
                                <li>→ <strong>Bid Optimization:</strong> %30-50 düşür</li>
                                <li>→ <strong>ASIN Remove:</strong> Performanssız ürünleri kaldır</li>
                              </ul>
                            </div>
                          )}

                          {/* Medium Priority Actions (30 < ACoS <= 50) */}
                          {acos > 30 && acos <= 50 && (
                            <div className="bg-yellow-100 border-l-4 border-yellow-500 p-2 rounded">
                              <p className="text-xs font-bold text-yellow-900 mb-1">📌 ORTA ÖNCELİK (P3)</p>
                              <ul className="text-xs text-yellow-800 space-y-0.5">
                                <li>→ <strong>Fine-tuning:</strong> Negative keyword optimizasyonu</li>
                                <li>→ <strong>Targeting Review:</strong> Otomatik kampanya analizi</li>
                                <li>→ <strong>Budget Reallocation:</strong> Bütçe dağılımını gözden geçir</li>
                              </ul>
                            </div>
                          )}

                          {/* Growth Actions (ACoS <= 30) */}
                          {acos <= 30 && (
                            <div className="bg-green-100 border-l-4 border-green-500 p-2 rounded">
                              <p className="text-xs font-bold text-green-900 mb-1">🚀 BÜYÜME FIRSATI</p>
                              <ul className="text-xs text-green-800 space-y-0.5">
                                {roi > 100 ? (
                                  <>
                                    <li>→ <strong>Scale Up:</strong> Bid'leri %20-30 artır</li>
                                    <li>→ <strong>Budget Increase:</strong> Günlük bütçeyi yükselt</li>
                                    <li>→ <strong>Expand Targeting:</strong> Yeni keyword'ler test et</li>
                                  </>
                                ) : (
                                  <>
                                    <li>→ <strong>Maintain:</strong> Mevcut stratejiyi sürdür</li>
                                    <li>→ <strong>Monitor:</strong> Performansı yakından takip et</li>
                                  </>
                                )}
                              </ul>
                            </div>
                          )}

                          {/* High Spend Warning */}
                          {spend > totalSpend * 0.25 && (
                            <div className="bg-purple-100 border-l-4 border-purple-500 p-2 rounded mt-2">
                              <p className="text-xs font-bold text-purple-900 mb-1">⚠️ DİKKAT</p>
                              <p className="text-xs text-purple-800">
                                Portfolio'nun <strong>%{((spend/totalSpend)*100).toFixed(0)}</strong>'ini oluşturuyor.
                                Düzenli olarak ownership matrix ve competitor analizi yap.
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Quick Insights */}
            <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-lg shadow p-6 border-2 border-purple-200">
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <span>⚡</span>
                Quick Insights
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(() => {
                  const highRiskCategories = categories.filter(c => parseFloat(c.acos.toString()) > 50);
                  const healthyCategories = categories.filter(c => parseFloat(c.acos.toString()) <= 30);
                  const topSpender = categories.reduce((max, c) =>
                    parseFloat(c.total_spend.toString()) > parseFloat(max.total_spend.toString()) ? c : max
                  , categories[0]);

                  return (
                    <>
                      <div className="bg-white rounded-lg p-4">
                        <p className="text-sm text-gray-600 mb-2">🔴 Yüksek Risk Kategorileri</p>
                        <p className="text-2xl font-black text-red-600">{highRiskCategories.length}</p>
                        <p className="text-xs text-gray-500 mt-1">ACoS {'>'}50%</p>
                      </div>
                      <div className="bg-white rounded-lg p-4">
                        <p className="text-sm text-gray-600 mb-2">🟢 Sağlıklı Kategoriler</p>
                        <p className="text-2xl font-black text-green-600">{healthyCategories.length}</p>
                        <p className="text-xs text-gray-500 mt-1">ACoS {'<'}30%</p>
                      </div>
                      <div className="bg-white rounded-lg p-4">
                        <p className="text-sm text-gray-600 mb-2">💰 En Yüksek Spend</p>
                        <p className="text-lg font-bold text-gray-900">{topSpender.category}</p>
                        <p className="text-xs text-gray-500 mt-1">${parseFloat(topSpender.total_spend.toString()).toLocaleString()}</p>
                      </div>
                      <div className="bg-white rounded-lg p-4">
                        <p className="text-sm text-gray-600 mb-2">📊 Ortalama ACoS</p>
                        <p className="text-2xl font-black text-gray-900">{overallAcos.toFixed(1)}%</p>
                        <p className="text-xs text-gray-500 mt-1">Tüm kategoriler</p>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
