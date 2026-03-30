import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';

interface OtherSkuData {
  campaign_name: string;
  product_group: string;
  adv_sales: number;
  other_sales: number;
  total_sales: number;
  other_sku_percentage: number;
  spend: number;
}

interface OtherSkuAsinData {
  asin: string;
  product_id: string;
  product_group: string;
  category: string;
  campaign_name: string;
  spend: number;
  adv_sales: number;
  other_sales: number;
  total_sales: number;
  other_sku_percentage: number;
}

interface PurchasedProductData {
  advertised_asin: string;
  advertised_sku: string;
  advertised_product_group: string;
  advertised_category: string;
  purchased_asin: string;
  purchased_sku: string;
  purchased_product_group: string;
  purchased_category: string;
  campaign_name: string;
  targeting: string;
  match_type: string;
  total_units: number;
  total_orders: number;
  total_sales: number;
}

interface Snapshot {
  id: number;
  period_start: string;
  period_end: string;
}

const OtherSkuAnalysis: React.FC = () => {
  const [viewType, setViewType] = useState<'campaign' | 'asin' | 'purchased'>('campaign');
  const [data, setData] = useState<OtherSkuData[]>([]);
  const [asinData, setAsinData] = useState<OtherSkuAsinData[]>([]);
  const [purchasedData, setPurchasedData] = useState<PurchasedProductData[]>([]);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<'other_sku_percentage' | 'other_sales' | 'total_sales'>('other_sku_percentage');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    fetchLatestSnapshot();
  }, []);

  const fetchLatestSnapshot = async () => {
    try {
      const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/snapshots/latest`);
      if (response.data) {
        setSnapshot(response.data);
        fetchOtherSkuData(response.data.id);
      }
    } catch (error) {
      console.error('Error fetching latest snapshot:', error);
      setLoading(false);
    }
  };

  const fetchOtherSkuData = async (snapshotId: number) => {
    try {
      setLoading(true);
      const [campaignResponse, asinResponse, purchasedResponse] = await Promise.all([
        axios.get(`${process.env.REACT_APP_API_URL}/api/snapshots/${snapshotId}/other-sku-analysis`),
        axios.get(`${process.env.REACT_APP_API_URL}/api/snapshots/${snapshotId}/other-sku-analysis-by-asin`),
        axios.get(`${process.env.REACT_APP_API_URL}/api/snapshots/${snapshotId}/purchased-product-analysis`)
      ]);
      setData(campaignResponse.data);
      setAsinData(asinResponse.data);
      setPurchasedData(purchasedResponse.data);
    } catch (error) {
      console.error('Error fetching Other SKU data:', error);
    } finally {
      setLoading(false);
    }
  };

  const sortedData = [...data].sort((a, b) => {
    const aVal = a[sortField];
    const bVal = b[sortField];
    return sortDirection === 'asc'
      ? Number(aVal) - Number(bVal)
      : Number(bVal) - Number(aVal);
  });

  const sortedAsinData = [...asinData].sort((a, b) => {
    const aVal = a[sortField];
    const bVal = b[sortField];
    return sortDirection === 'asc'
      ? Number(aVal) - Number(bVal)
      : Number(bVal) - Number(aVal);
  });

  const sortedPurchasedData = [...purchasedData].sort((a, b) => {
    if (sortField === 'total_sales') {
      return sortDirection === 'asc'
        ? Number(a.total_sales) - Number(b.total_sales)
        : Number(b.total_sales) - Number(a.total_sales);
    }
    return 0;
  });

  const toggleSort = (field: 'other_sku_percentage' | 'other_sales' | 'total_sales') => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-500">Loading Other SKU analysis...</div>
      </div>
    );
  }

  const currentData = viewType === 'campaign' ? data : (viewType === 'asin' ? asinData : []);
  const totalAdvSales = viewType !== 'purchased' ? currentData.reduce((sum, item) => sum + Number(item.adv_sales), 0) : 0;
  const totalOtherSales = viewType !== 'purchased' ? currentData.reduce((sum, item) => sum + Number(item.other_sales), 0) : 0;
  const totalPurchasedSales = viewType === 'purchased' ? purchasedData.reduce((sum, item) => sum + Number(item.total_sales), 0) : 0;
  const overallPercentage = totalAdvSales + totalOtherSales > 0
    ? (totalOtherSales / (totalAdvSales + totalOtherSales) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">🔀 Other SKU Analysis</h1>
              {snapshot && (
                <p className="text-sm text-gray-600 mt-1">
                  Period: {new Date(snapshot.period_start).toLocaleDateString()} - {new Date(snapshot.period_end).toLocaleDateString()}
                </p>
              )}
            </div>
            <Link
              to="/"
              className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
            >
              Back to Dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {/* Summary Cards */}
        {viewType !== 'purchased' ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-500 mb-2">Overall Other SKU Ratio</h3>
              <p className="text-3xl font-bold text-orange-600">{overallPercentage.toFixed(1)}%</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-500 mb-2">Advertised Sales</h3>
              <p className="text-3xl font-bold text-green-600">${totalAdvSales.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-500 mb-2">Other SKU Sales</h3>
              <p className="text-3xl font-bold text-orange-600">${totalOtherSales.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-500 mb-2">Total Purchased ASINs</h3>
              <p className="text-3xl font-bold text-purple-600">{purchasedData.length.toLocaleString()}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-500 mb-2">Total Other SKU Sales</h3>
              <p className="text-3xl font-bold text-orange-600">${totalPurchasedSales.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-500 mb-2">Unique Advertised ASINs</h3>
              <p className="text-3xl font-bold text-blue-600">
                {new Set(purchasedData.map(d => d.advertised_asin)).size}
              </p>
            </div>
          </div>
        )}

        {/* Info Box */}
        <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4 mb-6">
          {viewType === 'purchased' ? (
            <>
              <h3 className="font-semibold text-blue-900 mb-2">💡 Purchased Products Nedir?</h3>
              <p className="text-sm text-blue-800">
                Bu tabloda <strong>hangi advertised ASIN'in reklamı</strong> tıklandığında <strong>hangi purchased ASIN'in satıldığını</strong> görüyorsunuz.
                Bu data sayesinde cross-sell ilişkilerini tespit edebilir ve kampanyalarınızı optimize edebilirsiniz.
              </p>
            </>
          ) : (
            <>
              <h3 className="font-semibold text-blue-900 mb-2">💡 Other SKU Nedir?</h3>
              <p className="text-sm text-blue-800">
                <strong>Other SKU</strong> = Bir ASIN için reklam yapıyorsunuz ama müşteri başka bir ASIN'inizi satın alıyor.
                Yüksek Other SKU oranı, keyword ownership problemine işaret eder - yanlış ürünü reklam ediyorsunuz demektir.
              </p>
            </>
          )}
        </div>

        {/* View Type Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setViewType('campaign')}
            className={`px-6 py-3 rounded-lg font-semibold transition ${
              viewType === 'campaign'
                ? 'bg-blue-600 text-white shadow-lg'
                : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
            }`}
          >
            📊 By Campaign
          </button>
          <button
            onClick={() => setViewType('asin')}
            className={`px-6 py-3 rounded-lg font-semibold transition ${
              viewType === 'asin'
                ? 'bg-blue-600 text-white shadow-lg'
                : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
            }`}
          >
            🏷️ By ASIN
          </button>
          <button
            onClick={() => setViewType('purchased')}
            className={`px-6 py-3 rounded-lg font-semibold transition ${
              viewType === 'purchased'
                ? 'bg-blue-600 text-white shadow-lg'
                : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
            }`}
          >
            🛒 Purchased Products
          </button>
        </div>

        {/* Data Table */}
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            {viewType === 'purchased' ? (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Advertised ASIN
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Purchased ASIN
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Campaign
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Targeting
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Units
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Orders
                    </th>
                    <th
                      className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => toggleSort('total_sales')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>Sales</span>
                        <span className="text-gray-400">
                          {sortField === 'total_sales' ? (sortDirection === 'asc' ? '↑' : '↓') : '⇅'}
                        </span>
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {sortedPurchasedData.map((row, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm">
                        <div className="font-medium text-gray-900">{row.advertised_asin}</div>
                        <div className="text-xs text-gray-500">{row.advertised_product_group}</div>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="font-medium text-purple-700">{row.purchased_asin}</div>
                        <div className="text-xs text-gray-500">{row.purchased_product_group}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{row.campaign_name}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        <div>{row.targeting}</div>
                        <div className="text-xs text-gray-400">{row.match_type}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900">
                        {Number(row.total_units).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900">
                        {Number(row.total_orders).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-orange-600 font-medium">
                        ${Number(row.total_sales).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : viewType === 'campaign' ? (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Campaign
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Product Group
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Spend
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Adv Sales
                    </th>
                    <th
                      className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => toggleSort('other_sales')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>Other Sales</span>
                        <span className="text-gray-400">
                          {sortField === 'other_sales' ? (sortDirection === 'asc' ? '↑' : '↓') : '⇅'}
                        </span>
                      </div>
                    </th>
                    <th
                      className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => toggleSort('other_sku_percentage')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>Other %</span>
                        <span className="text-gray-400">
                          {sortField === 'other_sku_percentage' ? (sortDirection === 'asc' ? '↑' : '↓') : '⇅'}
                        </span>
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {sortedData.map((row, index) => {
                    const isHighRatio = Number(row.other_sku_percentage) > 30;
                    return (
                      <tr key={index} className={isHighRatio ? 'bg-orange-50' : 'hover:bg-gray-50'}>
                        <td className="px-4 py-3 text-sm text-gray-900">{row.campaign_name}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{row.product_group}</td>
                        <td className="px-4 py-3 text-sm text-right text-gray-900">
                          ${Number(row.spend).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-green-600 font-medium">
                          ${Number(row.adv_sales).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-orange-600 font-medium">
                          ${Number(row.other_sales).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 text-sm text-right">
                          <span className={`font-bold ${isHighRatio ? 'text-red-600' : 'text-orange-600'}`}>
                            {Number(row.other_sku_percentage).toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      ASIN (Advertised)
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Product Group
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Campaign
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Spend
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Adv Sales
                    </th>
                    <th
                      className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => toggleSort('other_sales')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>Other Sales</span>
                        <span className="text-gray-400">
                          {sortField === 'other_sales' ? (sortDirection === 'asc' ? '↑' : '↓') : '⇅'}
                        </span>
                      </div>
                    </th>
                    <th
                      className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => toggleSort('other_sku_percentage')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>Other %</span>
                        <span className="text-gray-400">
                          {sortField === 'other_sku_percentage' ? (sortDirection === 'asc' ? '↑' : '↓') : '⇅'}
                        </span>
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {sortedAsinData.map((row, index) => {
                    const isHighRatio = Number(row.other_sku_percentage) > 30;
                    return (
                      <tr key={index} className={isHighRatio ? 'bg-orange-50' : 'hover:bg-gray-50'}>
                        <td className="px-4 py-3 text-sm">
                          <div className="font-medium text-gray-900">{row.asin}</div>
                          <div className="text-xs text-gray-500">{row.product_id}</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{row.product_group}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{row.campaign_name}</td>
                        <td className="px-4 py-3 text-sm text-right text-gray-900">
                          ${Number(row.spend).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-green-600 font-medium">
                          ${Number(row.adv_sales).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-orange-600 font-medium">
                          ${Number(row.other_sales).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 text-sm text-right">
                          <span className={`font-bold ${isHighRatio ? 'text-red-600' : 'text-orange-600'}`}>
                            {Number(row.other_sku_percentage).toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {((viewType === 'campaign' && sortedData.length === 0) ||
            (viewType === 'asin' && sortedAsinData.length === 0) ||
            (viewType === 'purchased' && sortedPurchasedData.length === 0)) && (
            <div className="text-center py-8 text-gray-500">
              No data found
            </div>
          )}
        </div>

        <div className="mt-4 text-sm text-gray-600">
          {viewType === 'campaign'
            ? `Showing ${sortedData.length} campaigns with sales data`
            : viewType === 'asin'
            ? `Showing ${sortedAsinData.length} advertised ASINs with sales data`
            : `Showing ${sortedPurchasedData.length} purchased product mappings`
          }
        </div>

        {/* Action Recommendations */}
        <div className="mt-6 bg-yellow-50 border-2 border-yellow-200 rounded-lg p-6">
          <h3 className="font-semibold text-yellow-900 mb-3">
            {viewType === 'purchased' ? '🛒 Purchased Products Ne Anlama Gelir?' : '⚠️ Yüksek Other SKU Oranı Ne Anlama Gelir?'}
          </h3>
          {viewType === 'purchased' ? (
            <ul className="text-sm text-yellow-800 space-y-2">
              <li>• <strong>Advertised ASIN:</strong> Reklamı gösterilen ürün (müşteri bunu tıklıyor)</li>
              <li>• <strong>Purchased ASIN:</strong> Satın alınan ürün (müşteri bunu alıyor)</li>
              <li>• <strong>Cross-Sell Fırsatı:</strong> Eğer belirli bir advertised ASIN sürekli başka bir purchased ASIN'e yol açıyorsa, purchased ASIN'i doğrudan reklam etmeyi düşünün</li>
              <li>• <strong>Kampanya Optimizasyonu:</strong> Yüksek satış yapan purchased ASIN'leri kendi kampanyalarına taşıyın</li>
              <li>• <strong>Negative ASIN:</strong> Advertised ASIN'e purchased ASIN'i negative olarak ekleyerek kanibalizasyonu önleyin</li>
            </ul>
          ) : viewType === 'campaign' ? (
            <ul className="text-sm text-yellow-800 space-y-2">
              <li>• <strong>&gt;30% Other SKU:</strong> Yanlış ürünü reklam ediyorsunuz - keyword ownership problemi var</li>
              <li>• <strong>Çözüm 1:</strong> Hero ürünü belirleyip o ürünü reklam edin (Ownership Matrix'e bakın)</li>
              <li>• <strong>Çözüm 2:</strong> Other SKU'ları kampanyadan çıkarın (negative ASIN ekleyin)</li>
              <li>• <strong>Çözüm 3:</strong> Keyword'leri doğru ürüne atayın</li>
            </ul>
          ) : (
            <ul className="text-sm text-yellow-800 space-y-2">
              <li>• <strong>&gt;30% Other SKU:</strong> Bu ASIN'e tıklanıyor ama başka ürünler satılıyor</li>
              <li>• <strong>Çözüm 1:</strong> Bu ASIN'i kampanyadan çıkarın veya bid'ini azaltın</li>
              <li>• <strong>Çözüm 2:</strong> Satılan "other" ürünleri bu kampanyaya ekleyin</li>
              <li>• <strong>Çözüm 3:</strong> Bu ASIN'e negative ASIN olarak diğer ürünleri ekleyin</li>
              <li>• <strong>Analiz:</strong> Bu ASIN neden tıklanıyor ama satılmıyor? Fiyat, resim, listing kalitesi?</li>
            </ul>
          )}
        </div>
      </main>
    </div>
  );
};

export default OtherSkuAnalysis;
