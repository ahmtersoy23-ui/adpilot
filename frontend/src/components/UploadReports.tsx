import React, { useState } from 'react';
import axios from 'axios';

export const UploadReports: React.FC = () => {
  const [files, setFiles] = useState<{
    searchTerm: File | null;
    targeting: File | null;
    product: File | null;
    purchasedProduct: File | null;
  }>({
    searchTerm: null,
    targeting: null,
    product: null,
    purchasedProduct: null,
  });
  const [catalogFile, setCatalogFile] = useState<File | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadingCatalog, setUploadingCatalog] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [catalogMessage, setCatalogMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleFileChange = (type: 'searchTerm' | 'targeting' | 'product' | 'purchasedProduct', file: File | null) => {
    setFiles(prev => ({ ...prev, [type]: file }));
  };

  const handleUpload = async () => {
    if (!files.searchTerm || !files.targeting || !files.product) {
      setMessage({ type: 'error', text: 'Lütfen tüm raporları yükleyin!' });
      return;
    }

    if (!startDate || !endDate) {
      setMessage({ type: 'error', text: 'Lütfen tarih aralığını seçin!' });
      return;
    }

    setUploading(true);
    setMessage(null);

    const formData = new FormData();
    formData.append('searchTerm', files.searchTerm);
    formData.append('targeting', files.targeting);
    formData.append('product', files.product);
    if (files.purchasedProduct) {
      formData.append('purchasedProduct', files.purchasedProduct);
    }
    formData.append('startDate', startDate);
    formData.append('endDate', endDate);

    try {
      const response = await axios.post(`${process.env.REACT_APP_API_URL}/api/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setMessage({
        type: 'success',
        text: `✅ Başarılı! Snapshot ID: ${response.data.snapshotId}. Ownership analizi başlatılıyor...`
      });

      // Clear form
      setFiles({ searchTerm: null, targeting: null, product: null, purchasedProduct: null });
      setStartDate('');
      setEndDate('');

      // Reload page after 2 seconds
      setTimeout(() => window.location.href = '/', 2000);
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: `❌ Hata: ${error.response?.data?.error || error.message}`
      });
    } finally {
      setUploading(false);
    }
  };

  const handleCatalogUpload = async () => {
    if (!catalogFile) {
      setCatalogMessage({ type: 'error', text: 'Lütfen catalog dosyasını seçin!' });
      return;
    }

    setUploadingCatalog(true);
    setCatalogMessage(null);

    const formData = new FormData();
    formData.append('catalog', catalogFile);

    try {
      const response = await axios.post(`${process.env.REACT_APP_API_URL}/api/products/import`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setCatalogMessage({
        type: 'success',
        text: `✅ Başarılı! Güncellenen: ${response.data.updated}, Yeni: ${response.data.created}, Atlanan: ${response.data.skipped}`
      });

      setCatalogFile(null);
    } catch (error: any) {
      setCatalogMessage({
        type: 'error',
        text: `❌ Hata: ${error.response?.data?.error || error.message}`
      });
    } finally {
      setUploadingCatalog(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <header className="bg-white shadow-lg border-b-4 border-blue-500">
        <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                📤 Yeni Rapor Yükle
              </h1>
              <p className="mt-2 text-sm text-gray-600">Amazon Ads raporlarını yükle ve analiz et</p>
            </div>
            <button
              onClick={() => window.location.href = '/'}
              className="bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white font-semibold py-3 px-6 rounded-xl shadow-lg transition duration-200 transform hover:scale-105"
            >
              ← Dashboard
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-2xl shadow-2xl p-8 border border-gray-100">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">📋 Amazon Ads Raporları</h2>
            <p className="text-gray-600">
              Sponsored Products raporlarını buradan yükle. Her üç rapor da gerekli.
            </p>
          </div>

          {/* File Uploads */}
          <div className="space-y-6 mb-8">
            {/* Search Term Report */}
            <div className="border-2 border-dashed border-blue-300 rounded-xl p-6 bg-blue-50/50 hover:border-blue-500 transition">
              <label className="block text-sm font-semibold text-gray-900 mb-3">
                1️⃣ Search Term Report
              </label>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => handleFileChange('searchTerm', e.target.files?.[0] || null)}
                className="block w-full text-sm text-gray-600 file:mr-4 file:py-3 file:px-6 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 cursor-pointer"
              />
              {files.searchTerm && (
                <p className="mt-2 text-sm text-green-600">✅ {files.searchTerm.name}</p>
              )}
            </div>

            {/* Targeting Report */}
            <div className="border-2 border-dashed border-purple-300 rounded-xl p-6 bg-purple-50/50 hover:border-purple-500 transition">
              <label className="block text-sm font-semibold text-gray-900 mb-3">
                2️⃣ Targeting Report
              </label>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => handleFileChange('targeting', e.target.files?.[0] || null)}
                className="block w-full text-sm text-gray-600 file:mr-4 file:py-3 file:px-6 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-purple-600 file:text-white hover:file:bg-purple-700 cursor-pointer"
              />
              {files.targeting && (
                <p className="mt-2 text-sm text-green-600">✅ {files.targeting.name}</p>
              )}
            </div>

            {/* Advertised Product Report */}
            <div className="border-2 border-dashed border-pink-300 rounded-xl p-6 bg-pink-50/50 hover:border-pink-500 transition">
              <label className="block text-sm font-semibold text-gray-900 mb-3">
                3️⃣ Advertised Product Report
              </label>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => handleFileChange('product', e.target.files?.[0] || null)}
                className="block w-full text-sm text-gray-600 file:mr-4 file:py-3 file:px-6 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-pink-600 file:text-white hover:file:bg-pink-700 cursor-pointer"
              />
              {files.product && (
                <p className="mt-2 text-sm text-green-600">✅ {files.product.name}</p>
              )}
            </div>

            {/* Purchased Product Report (Optional) */}
            <div className="border-2 border-dashed border-orange-300 rounded-xl p-6 bg-orange-50/50 hover:border-orange-500 transition">
              <label className="block text-sm font-semibold text-gray-900 mb-3">
                4️⃣ Purchased Product Report <span className="text-orange-600 text-xs">(Opsiyonel)</span>
              </label>
              <p className="text-xs text-gray-600 mb-3">
                Other SKU satışlarını detaylı analiz etmek için. Hangi ASIN reklamı hangi ASIN satışını getirdi?
              </p>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => handleFileChange('purchasedProduct', e.target.files?.[0] || null)}
                className="block w-full text-sm text-gray-600 file:mr-4 file:py-3 file:px-6 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-orange-600 file:text-white hover:file:bg-orange-700 cursor-pointer"
              />
              {files.purchasedProduct && (
                <p className="mt-2 text-sm text-green-600">✅ {files.purchasedProduct.name}</p>
              )}
            </div>
          </div>

          {/* Date Range */}
          <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl p-6 mb-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">📅 Tarih Aralığı</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Başlangıç Tarihi
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="block w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Bitiş Tarihi
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="block w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Message */}
          {message && (
            <div
              className={`rounded-xl p-4 mb-6 ${
                message.type === 'success'
                  ? 'bg-green-100 border-2 border-green-500 text-green-800'
                  : 'bg-red-100 border-2 border-red-500 text-red-800'
              }`}
            >
              <p className="font-medium">{message.text}</p>
            </div>
          )}

          {/* Upload Button */}
          <button
            onClick={handleUpload}
            disabled={uploading || !files.searchTerm || !files.targeting || !files.product || !startDate || !endDate}
            className={`w-full py-4 px-6 rounded-xl font-bold text-lg shadow-lg transition duration-200 transform hover:scale-105 ${
              uploading || !files.searchTerm || !files.targeting || !files.product || !startDate || !endDate
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white'
            }`}
          >
            {uploading ? '⏳ Yükleniyor...' : '🚀 Raporları Yükle ve Analiz Et'}
          </button>

          {/* Instructions */}
          <div className="mt-8 p-6 bg-blue-50 rounded-xl border-2 border-blue-200">
            <h4 className="font-semibold text-blue-900 mb-3">💡 Nasıl Kullanılır:</h4>
            <ol className="list-decimal list-inside space-y-2 text-sm text-blue-800">
              <li>Amazon Ads Console'a git → Reports → Create Report</li>
              <li><strong>3 zorunlu rapor:</strong> Search Term, Targeting, Advertised Product</li>
              <li><strong>1 opsiyonel rapor:</strong> Purchased Product (Other SKU detayları için)</li>
              <li>Dosyaları buraya yükle</li>
              <li>Tarih aralığını seç (raporlarla aynı olmalı)</li>
              <li>"Yükle ve Analiz Et" butonuna tıkla</li>
              <li>Ownership analizi otomatik çalışacak</li>
            </ol>
          </div>
        </div>

        {/* Product Catalog Import */}
        <div className="bg-white rounded-2xl shadow-2xl p-8 border border-gray-100 mt-8">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">📦 Product Catalog Import</h2>
            <p className="text-gray-600">
              ASIN-SKU-Name-Category eşleştirmelerini yükle. Kategoriler otomatik güncellenecek.
            </p>
            <p className="text-sm text-gray-500 mt-2">
              💡 <strong>Eşleştirme:</strong> Sadece ASIN'e göre yapılır<br/>
              💡 <strong>SKU'lar:</strong> Reklam raporlarından gelir ve korunur
            </p>
          </div>

          {/* Catalog File Upload */}
          <div className="border-2 border-dashed border-green-300 rounded-xl p-6 bg-green-50/50 hover:border-green-500 transition mb-6">
            <label className="block text-sm font-semibold text-gray-900 mb-3">
              📄 Excel Dosyası (.xlsx)
            </label>
            <p className="text-xs text-gray-600 mb-3">
              Gerekli: <strong>ASIN</strong>, <strong>Category</strong> | İsteğe bağlı: <strong>Product ID</strong>, <strong>Name</strong>
            </p>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setCatalogFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-gray-600 file:mr-4 file:py-3 file:px-6 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-green-600 file:text-white hover:file:bg-green-700 cursor-pointer"
            />
            {catalogFile && (
              <p className="mt-2 text-sm text-green-600">✅ {catalogFile.name}</p>
            )}
          </div>

          {/* Catalog Message */}
          {catalogMessage && (
            <div
              className={`rounded-xl p-4 mb-6 ${
                catalogMessage.type === 'success'
                  ? 'bg-green-100 border-2 border-green-500 text-green-800'
                  : 'bg-red-100 border-2 border-red-500 text-red-800'
              }`}
            >
              <p className="font-medium">{catalogMessage.text}</p>
            </div>
          )}

          {/* Upload Catalog Button */}
          <button
            onClick={handleCatalogUpload}
            disabled={uploadingCatalog || !catalogFile}
            className={`w-full py-4 px-6 rounded-xl font-bold text-lg shadow-lg transition duration-200 transform hover:scale-105 ${
              uploadingCatalog || !catalogFile
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white'
            }`}
          >
            {uploadingCatalog ? '⏳ Yükleniyor...' : '📥 Catalog\'u Import Et'}
          </button>

          {/* Catalog Instructions */}
          <div className="mt-6 p-6 bg-green-50 rounded-xl border-2 border-green-200">
            <h4 className="font-semibold text-green-900 mb-3">💡 Excel Formatı:</h4>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm text-green-800">
                <thead>
                  <tr className="border-b-2 border-green-300">
                    <th className="text-left px-3 py-2 font-semibold">ASIN</th>
                    <th className="text-left px-3 py-2 font-semibold">Product ID</th>
                    <th className="text-left px-3 py-2 font-semibold">Name</th>
                    <th className="text-left px-3 py-2 font-semibold">Category</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-green-200">
                    <td className="px-3 py-2">B0BS46KPY2</td>
                    <td className="px-3 py-2">CA-33_MIX_LA</td>
                    <td className="px-3 py-2">Multilayered Map</td>
                    <td className="px-3 py-2">World Maps</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2">B09WRQ4T5T</td>
                    <td className="px-3 py-2">CA-041-TG</td>
                    <td className="px-3 py-2">WA-Dua-Unv</td>
                    <td className="px-3 py-2">Islamic Wall Art</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
