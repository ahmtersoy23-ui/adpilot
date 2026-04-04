import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './index.css';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Actions from './pages/Actions';
import Ownership from './pages/Ownership';
import Bids from './pages/Bids';
import Keywords from './pages/Keywords';
import Settings from './pages/Settings';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/actions" element={<Actions />} />
          <Route path="/ownership" element={<Ownership />} />
          <Route path="/bids" element={<Bids />} />
          <Route path="/keywords" element={<Keywords />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
