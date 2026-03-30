import React, { useEffect, useState } from 'react';
import { getLatestSnapshot, getStats, getActionSummary, Stats, Snapshot, ActionSummary } from '../api/client';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const COLORS = ['#0ea5e9', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981'];

export const Dashboard: React.FC = () => {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [actionSummary, setActionSummary] = useState<ActionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [snapshotRes, statsRes] = await Promise.all([
          getLatestSnapshot(),
          getStats(),
        ]);

        setSnapshot(snapshotRes.data);
        setStats(statsRes.data);

        if (snapshotRes.data?.id) {
          const summaryRes = await getActionSummary(snapshotRes.data.id);
          setActionSummary(summaryRes.data);
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
      <div className="flex items-center justify-center h-screen">
        <div className="text-xl text-gray-600">Loading dashboard...</div>
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

  const totalActions = actionSummary.reduce((sum, item) => sum + parseInt(item.count.toString()), 0);
  const totalSavings = actionSummary.reduce((sum, item) => sum + parseFloat(item.total_savings.toString()), 0);

  // Prepare chart data
  const actionTypeData = actionSummary.reduce((acc, item) => {
    const existing = acc.find(a => a.name === item.action_type);
    if (existing) {
      existing.count += parseInt(item.count.toString());
      existing.savings += parseFloat(item.total_savings.toString());
    } else {
      acc.push({
        name: item.action_type.replace(/_/g, ' ').toUpperCase(),
        count: parseInt(item.count.toString()),
        savings: parseFloat(item.total_savings.toString()),
      });
    }
    return acc;
  }, [] as Array<{ name: string; count: number; savings: number }>);

  const priorityData = actionSummary.reduce((acc, item) => {
    const existing = acc.find(a => a.name === item.priority);
    if (existing) {
      existing.value += parseInt(item.count.toString());
    } else {
      acc.push({
        name: item.priority,
        value: parseInt(item.count.toString()),
      });
    }
    return acc;
  }, [] as Array<{ name: string; value: number }>);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold text-gray-900">🎯 Keyword Ownership Engine</h1>
          <p className="mt-1 text-sm text-gray-500">Amazon PPC Multi-Product Portfolio Optimization</p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="text-3xl">📦</div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Products (ASINs)</dt>
                    <dd className="text-2xl font-bold text-gray-900">{stats?.products.toLocaleString()}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="text-3xl">📊</div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Campaigns</dt>
                    <dd className="text-2xl font-bold text-gray-900">{stats?.campaigns.toLocaleString()}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="text-3xl">🔑</div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Keywords</dt>
                    <dd className="text-2xl font-bold text-gray-900">{stats?.keywords.toLocaleString()}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="text-3xl">📸</div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Snapshots</dt>
                    <dd className="text-2xl font-bold text-gray-900">{stats?.snapshots.toLocaleString()}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Latest Snapshot Info */}
        {snapshot && (
          <div className="bg-white shadow rounded-lg mb-8 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">📅 Latest Snapshot</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <div>
                <p className="text-sm text-gray-500">Period</p>
                <p className="text-lg font-medium text-gray-900">
                  {new Date(snapshot.period_start).toLocaleDateString()} - {new Date(snapshot.period_end).toLocaleDateString()}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Marketplace</p>
                <p className="text-lg font-medium text-gray-900">{snapshot.marketplace}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Spend</p>
                <p className="text-lg font-medium text-gray-900">${snapshot.total_spend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Sales</p>
                <p className="text-lg font-medium text-gray-900">${snapshot.total_sales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">ACoS</p>
                <p className={`text-lg font-medium ${snapshot.acos > 50 ? 'text-red-600' : snapshot.acos > 30 ? 'text-yellow-600' : 'text-green-600'}`}>
                  {snapshot.acos ? snapshot.acos.toFixed(2) : '0.00'}%
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Uploaded</p>
                <p className="text-lg font-medium text-gray-900">{new Date(snapshot.upload_date).toLocaleDateString()}</p>
              </div>
            </div>
          </div>
        )}

        {/* Action Summary */}
        <div className="bg-white shadow rounded-lg mb-8 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">⚡ Action Summary</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="bg-blue-50 rounded-lg p-4">
              <p className="text-sm text-blue-600 font-medium">Total Actions</p>
              <p className="text-3xl font-bold text-blue-900">{totalActions.toLocaleString()}</p>
            </div>
            <div className="bg-green-50 rounded-lg p-4">
              <p className="text-sm text-green-600 font-medium">Est. Monthly Savings</p>
              <p className="text-3xl font-bold text-green-900">${totalSavings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Action Type Chart */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Actions by Type</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={actionTypeData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} fontSize={12} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="count" fill="#0ea5e9" name="Count" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Priority Distribution */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Priority Distribution</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={priorityData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }) => `${name}: ${value}`}
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

        {/* Quick Actions */}
        <div className="bg-white shadow rounded-lg p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">🚀 Quick Actions</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={() => window.location.href = '/actions'}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition duration-150"
            >
              View All Actions
            </button>
            <button
              onClick={() => window.location.href = '/ownership'}
              className="bg-purple-600 hover:bg-purple-700 text-white font-medium py-3 px-4 rounded-lg transition duration-150"
            >
              Ownership Matrix
            </button>
            <button
              onClick={() => window.location.href = '/categories'}
              className="bg-pink-600 hover:bg-pink-700 text-white font-medium py-3 px-4 rounded-lg transition duration-150"
            >
              Category Performance
            </button>
          </div>
        </div>

        {/* Export Downloads */}
        {snapshot && (
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">📥 Export Downloads</h2>
            <p className="text-sm text-gray-600 mb-4">Download ready-to-use optimization files</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <a
                href={`http://localhost:3001/api/snapshots/${snapshot.id}/export/bulk`}
                download
                className="flex items-center justify-center bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-4 rounded-lg transition duration-150"
              >
                <span className="mr-2">📋</span>
                Amazon Bulk Sheet
              </a>
              <a
                href={`http://localhost:3001/api/snapshots/${snapshot.id}/export/perpetua`}
                download
                className="flex items-center justify-center bg-orange-600 hover:bg-orange-700 text-white font-medium py-3 px-4 rounded-lg transition duration-150"
              >
                <span className="mr-2">📝</span>
                Perpetua Checklist
              </a>
              <a
                href={`http://localhost:3001/api/snapshots/${snapshot.id}/export/matrix`}
                download
                className="flex items-center justify-center bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 px-4 rounded-lg transition duration-150"
              >
                <span className="mr-2">📊</span>
                Ownership Matrix
              </a>
            </div>
            <div className="mt-4 p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-800">
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
