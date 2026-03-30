import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';

interface KeywordPerformance {
  keyword_text: string;
  keyword_type: string;
  impressions: number;
  clicks: number;
  spend: number;
  total_sales: number;
  orders: number;
  ctr: number;
  cpc: number;
  acos: number;
  conversion_rate: number;
  campaign_count: number;
}

interface Snapshot {
  id: number;
  period_start: string;
  period_end: string;
}

type SortField = keyof KeywordPerformance;
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

const KeywordList: React.FC = () => {
  const [keywords, setKeywords] = useState<KeywordPerformance[]>([]);
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
        fetchKeywords(response.data.id);
      }
    } catch (error) {
      console.error('Error fetching latest snapshot:', error);
      setLoading(false);
    }
  };

  const fetchKeywords = async (snapshotId: number) => {
    try {
      setLoading(true);
      const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/snapshots/${snapshotId}/keywords`);
      setKeywords(response.data);
    } catch (error) {
      console.error('Error fetching keywords:', error);
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
      window.location.href = `${process.env.REACT_APP_API_URL}/api/snapshots/${snapshot.id}/export/keywords`;
    }
  };

  const filteredKeywords = keywords.filter(keyword =>
    keyword.keyword_text.toLowerCase().includes(searchTerm.toLowerCase()) ||
    keyword.keyword_type?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const sortedKeywords = [...filteredKeywords].sort((a, b) => {
    const aVal = a[sortField];
    const bVal = b[sortField];

    if (aVal === null || aVal === undefined) return 1;
    if (bVal === null || bVal === undefined) return -1;

    // Only use string comparison for text fields
    const textFields: SortField[] = ['keyword_text', 'keyword_type'];
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
        <div className="text-gray-500">Loading keywords...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Keyword Performance</h1>
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

        <input
          type="text"
          placeholder="Search by keyword or type..."
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
                <SortableHeader field="keyword_text" label="Keyword" currentField={sortField} direction={sortDirection} onSort={handleSort} />
                <SortableHeader field="keyword_type" label="Type" currentField={sortField} direction={sortDirection} onSort={handleSort} />
                <SortableHeader field="campaign_count" label="Campaigns" currentField={sortField} direction={sortDirection} onSort={handleSort} align="right" />
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
              {sortedKeywords.map((keyword, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 max-w-xs">
                    {keyword.keyword_text}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {keyword.keyword_type || '-'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-600">
                    {keyword.campaign_count}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900">
                    {keyword.impressions.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900">
                    {keyword.clicks.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900">
                    {parseFloat(keyword.ctr.toString()).toFixed(2)}%
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-medium text-gray-900">
                    ${parseFloat(keyword.spend.toString()).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-medium text-green-600">
                    ${parseFloat(keyword.total_sales.toString()).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-right">
                    <span className={`font-medium ${parseFloat(keyword.acos.toString()) > 30 ? 'text-red-600' : 'text-green-600'}`}>
                      {parseFloat(keyword.acos.toString()).toFixed(2)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900">
                    {keyword.orders.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900">
                    {parseFloat(keyword.conversion_rate.toString()).toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {sortedKeywords.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No keywords found
          </div>
        )}
      </div>

      <div className="mt-4 text-sm text-gray-600">
        Showing {sortedKeywords.length} of {keywords.length} keywords
      </div>
    </div>
  );
};

export default KeywordList;
