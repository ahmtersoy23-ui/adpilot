import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';

interface Settings {
  target_acos: {
    default: number;
    by_category: { [key: string]: number };
  };
  min_orders_threshold: string;
  min_clicks_threshold: string;
  min_spend_threshold: string;
  hero_score_ratio: string;
}

export const Settings: React.FC = () => {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form state
  const [defaultAcos, setDefaultAcos] = useState(25);
  const [categoryAcos, setCategoryAcos] = useState<{ [key: string]: number }>({});
  const [minOrders, setMinOrders] = useState('5');
  const [minClicks, setMinClicks] = useState('50');
  const [minSpend, setMinSpend] = useState('10');
  const [heroScoreRatio, setHeroScoreRatio] = useState('0.5');

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/settings`);
      const data = response.data;
      setSettings(data);

      // Populate form
      setDefaultAcos(data.target_acos.default);
      setCategoryAcos(data.target_acos.by_category || {});
      setMinOrders(data.min_orders_threshold);
      setMinClicks(data.min_clicks_threshold);
      setMinSpend(data.min_spend_threshold);
      setHeroScoreRatio(data.hero_score_ratio);
    } catch (error) {
      console.error('Error fetching settings:', error);
      setMessage({ type: 'error', text: 'Failed to load settings' });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    try {
      // Update target_acos
      await axios.put(`${process.env.REACT_APP_API_URL}/api/settings/target_acos`, {
        value: {
          default: defaultAcos,
          by_category: categoryAcos,
        },
      });

      // Update thresholds
      await axios.put(`${process.env.REACT_APP_API_URL}/api/settings/min_orders_threshold`, {
        value: minOrders,
      });
      await axios.put(`${process.env.REACT_APP_API_URL}/api/settings/min_clicks_threshold`, {
        value: minClicks,
      });
      await axios.put(`${process.env.REACT_APP_API_URL}/api/settings/min_spend_threshold`, {
        value: minSpend,
      });
      await axios.put(`${process.env.REACT_APP_API_URL}/api/settings/hero_score_ratio`, {
        value: heroScoreRatio,
      });

      setMessage({
        type: 'success',
        text: 'Settings saved successfully! Changes will apply to future ownership analysis.',
      });
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: `Failed to save settings: ${error.response?.data?.error || error.message}`,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCategoryAcosChange = (category: string, value: string) => {
    setCategoryAcos({
      ...categoryAcos,
      [category]: parseFloat(value) || 0,
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-500">Loading settings...</div>
      </div>
    );
  }

  const categories = Object.keys(categoryAcos);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
            <Link
              to="/"
              className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
            >
              Back to Dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {/* Message */}
          {message && (
            <div
              className={`rounded-lg p-4 mb-6 ${
                message.type === 'success'
                  ? 'bg-green-100 border-2 border-green-500 text-green-800'
                  : 'bg-red-100 border-2 border-red-500 text-red-800'
              }`}
            >
              <p className="font-medium">{message.text}</p>
            </div>
          )}

          {/* Target ACoS Settings */}
          <div className="bg-white shadow rounded-lg p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Target ACoS</h2>
            <p className="text-sm text-gray-600 mb-6">
              Set target ACoS percentages for campaigns. Used by the Bid/ACoS action engine.
            </p>

            <div className="space-y-6">
              {/* Default ACoS */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Default Target ACoS (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={defaultAcos}
                  onChange={(e) => setDefaultAcos(parseFloat(e.target.value))}
                  className="block w-full max-w-xs px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Applied to campaigns without a specific category target
                </p>
              </div>

              {/* Category-specific ACoS */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3">
                  Category-Specific Targets
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {categories.map((category) => (
                    <div key={category}>
                      <label className="block text-sm text-gray-600 mb-1">
                        {category}
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={categoryAcos[category]}
                        onChange={(e) => handleCategoryAcosChange(category, e.target.value)}
                        className="block w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Ownership Thresholds */}
          <div className="bg-white shadow rounded-lg p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Ownership Thresholds</h2>
            <p className="text-sm text-gray-600 mb-6">
              Minimum performance criteria for Hero assignment. Higher values = more conservative.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Min Orders
                </label>
                <input
                  type="number"
                  min="0"
                  value={minOrders}
                  onChange={(e) => setMinOrders(e.target.value)}
                  className="block w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Min Clicks
                </label>
                <input
                  type="number"
                  min="0"
                  value={minClicks}
                  onChange={(e) => setMinClicks(e.target.value)}
                  className="block w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Min Spend ($)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={minSpend}
                  onChange={(e) => setMinSpend(e.target.value)}
                  className="block w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Hero Score Ratio
                </label>
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  value={heroScoreRatio}
                  onChange={(e) => setHeroScoreRatio(e.target.value)}
                  className="block w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="mt-1 text-xs text-gray-500">Support must have &gt; this ratio of Hero's score</p>
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className={`px-6 py-3 rounded-lg font-semibold shadow-lg transition ${
                saving
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};
