import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';

interface AsinPerformance {
  asin: string;
  sku: string;
  product_group: string;
  category: string;
  title: string;
  impressions: number;
  clicks: number;
  spend: number;
  total_sales: number;
  orders: number;
  ctr: number;
  cpc: number;
  acos: number;
  conversion_rate: number;
}

interface CategorySummary {
  category: string;
  product_count: number;
  impressions: number;
  clicks: number;
  spend: number;
  total_sales: number;
  orders: number;
  ctr: number;
  acos: number;
  conversion_rate: number;
}

interface Snapshot {
  id: number;
  period_start: string;
  period_end: string;
}

type SortField = keyof AsinPerformance;
type SortDirection = 'asc' | 'desc';

const SortableHeader: React.FC<{
  field: SortField;
  label: string;
  currentField: SortField;
  direction: SortDirection;
  onSort: (field: SortField) => void;
  align?: 'left' | 'right';
}> = ({ field, label, currentField, direction, onSort, align = 'left' }) => {
  const isActive = currentField === field;
  return (
    <th
      className={`px-4 py-3 ${align === 'right' ? 'text-right' : 'text-left'} text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none`}
      onClick={() => onSort(field)}
    >
      <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
        <span>{label}</span>
        <span className="text-gray-400">
          {isActive ? (direction === 'asc' ? '↑' : '↓') : '⇅'}
        </span>
      </div>
    </th>
  );
};

const AsinList: React.FC = () => {
  const [asins, setAsins] = useState<AsinPerformance[]>([]);
  const [categorySummary, setCategorySummary] = useState<CategorySummary[]>([]);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('spend');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  useEffect(() => {
    fetchLatestSnapshot();
  }, []);

  const fetchLatestSnapshot = async () => {
    try {
      const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/snapshots/latest`);
      if (response.data) {
        setSnapshot(response.data);
        fetchAsins(response.data.id);
      }
    } catch (error) {
      console.error('Error fetching latest snapshot:', error);
      setLoading(false);
    }
  };

  const fetchAsins = async (snapshotId: number) => {
    try {
      setLoading(true);
      const [asinsResponse, summaryResponse] = await Promise.all([
        axios.get(`${process.env.REACT_APP_API_URL}/api/snapshots/${snapshotId}/asins`),
        axios.get(`${process.env.REACT_APP_API_URL}/api/snapshots/${snapshotId}/category-summary`)
      ]);
      setAsins(asinsResponse.data);
      setCategorySummary(summaryResponse.data);
    } catch (error) {
      console.error('Error fetching ASINs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const handleExport = () => {
    if (snapshot) {
      window.location.href = `${process.env.REACT_APP_API_URL}/api/snapshots/${snapshot.id}/export/asins`;
    }
  };

  const filteredAsins = asins.filter(asin =>
    asin.asin.toLowerCase().includes(searchTerm.toLowerCase()) ||
    asin.sku?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    asin.product_group?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    asin.category?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const sortedAsins = [...filteredAsins].sort((a, b) => {
    const aVal = a[sortField];
    const bVal = b[sortField];

    if (aVal === null || aVal === undefined) return 1;
    if (bVal === null || bVal === undefined) return -1;

    // Only use string comparison for text fields
    const textFields: SortField[] = ['asin', 'sku', 'product_group', 'category', 'title'];
    if (textFields.includes(sortField)) {
      const aStr = String(aVal || '');
      const bStr = String(bVal || '');
      return sortDirection === 'asc'
        ? aStr.localeCompare(bStr)
        : bStr.localeCompare(aStr);
    }

    // Use numeric comparison for all other fields
    return sortDirection === 'asc'
      ? Number(aVal) - Number(bVal)
      : Number(bVal) - Number(aVal);
  });

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-500">Loading ASINs...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">ASIN Performance</h1>
            {snapshot && (
              <p className="text-sm text-gray-600 mt-1">
                Period: {new Date(snapshot.period_start).toLocaleDateString()} - {new Date(snapshot.period_end).toLocaleDateString()}
              </p>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleExport}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center gap-2"
            >
              <span>📥</span>
              <span>Export Excel</span>
            </button>
            <Link
              to="/"
              className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
            >
              Back to Dashboard
            </Link>
          </div>
        </div>

        {/* Category Summary */}
        {categorySummary.length > 0 && (
          <div className="mb-6 bg-white rounded-lg shadow-md overflow-hidden">
            <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-4 py-3">
              <h2 className="text-lg font-semibold text-white">📊 Category Summary</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Products</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Spend</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Sales</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">ACoS %</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Orders</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">CVR %</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {categorySummary.map((cat, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{cat.category}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-600">{cat.product_count}</td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">
                        ${parseFloat(cat.spend.toString()).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-green-600">
                        ${parseFloat(cat.total_sales.toString()).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-sm text-right">
                        <span className={`font-medium ${parseFloat(cat.acos.toString()) > 30 ? 'text-red-600' : 'text-green-600'}`}>
                          {parseFloat(cat.acos.toString()).toFixed(2)}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900">{cat.orders.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900">
                        {parseFloat(cat.conversion_rate.toString()).toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <input
          type="text"
          placeholder="Search by ASIN, SKU, Product Group, or Category..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="bg-white shadow-md rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <SortableHeader field="asin" label="ASIN" currentField={sortField} direction={sortDirection} onSort={handleSort} />
                <SortableHeader field="product_group" label="Product Group" currentField={sortField} direction={sortDirection} onSort={handleSort} />
                <SortableHeader field="category" label="Category" currentField={sortField} direction={sortDirection} onSort={handleSort} />
                <SortableHeader field="impressions" label="Impressions" currentField={sortField} direction={sortDirection} onSort={handleSort} align="right" />
                <SortableHeader field="clicks" label="Clicks" currentField={sortField} direction={sortDirection} onSort={handleSort} align="right" />
                <SortableHeader field="ctr" label="CTR %" currentField={sortField} direction={sortDirection} onSort={handleSort} align="right" />
                <SortableHeader field="spend" label="Spend" currentField={sortField} direction={sortDirection} onSort={handleSort} align="right" />
                <SortableHeader field="total_sales" label="Sales" currentField={sortField} direction={sortDirection} onSort={handleSort} align="right" />
                <SortableHeader field="acos" label="ACoS %" currentField={sortField} direction={sortDirection} onSort={handleSort} align="right" />
                <SortableHeader field="orders" label="Orders" currentField={sortField} direction={sortDirection} onSort={handleSort} align="right" />
                <SortableHeader field="conversion_rate" label="CVR %" currentField={sortField} direction={sortDirection} onSort={handleSort} align="right" />
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sortedAsins.map((asin, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{asin.asin}</div>
                    {asin.sku && <div className="text-xs text-gray-500">{asin.sku}</div>}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">{asin.product_group}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{asin.category || '-'}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900">
                    {asin.impressions.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900">
                    {asin.clicks.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900">
                    {parseFloat(asin.ctr.toString()).toFixed(2)}%
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-medium text-gray-900">
                    ${parseFloat(asin.spend.toString()).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-medium text-green-600">
                    ${parseFloat(asin.total_sales.toString()).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-right">
                    <span className={`font-medium ${parseFloat(asin.acos.toString()) > 30 ? 'text-red-600' : 'text-green-600'}`}>
                      {parseFloat(asin.acos.toString()).toFixed(2)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900">
                    {asin.orders.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900">
                    {parseFloat(asin.conversion_rate.toString()).toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {sortedAsins.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No ASINs found
          </div>
        )}
      </div>

      <div className="mt-4 text-sm text-gray-600">
        Showing {sortedAsins.length} of {asins.length} ASINs
      </div>
    </div>
  );
};

export default AsinList;
