import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Dashboard } from './components/Dashboard';
import { ActionList } from './components/ActionList';
import { OwnershipMatrix } from './components/OwnershipMatrix';
import { Categories } from './components/Categories';
import { UploadReports } from './components/UploadReports';
import { Settings } from './components/Settings';
import AsinList from './components/AsinList';
import KeywordList from './components/KeywordList';
import OtherSkuAnalysis from './components/OtherSkuAnalysis';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/upload" element={<UploadReports />} />
        <Route path="/actions" element={<ActionList />} />
        <Route path="/ownership" element={<OwnershipMatrix />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="/asins" element={<AsinList />} />
        <Route path="/keywords" element={<KeywordList />} />
        <Route path="/other-sku" element={<OtherSkuAnalysis />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Router>
  );
}

export default App;
