import { Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext.jsx';
import Layout from './components/Layout.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import DeclarePage from './pages/DeclarePage.jsx';
import StoragePage from './pages/StoragePage.jsx';
import TransferPage from './pages/TransferPage.jsx';
import WeighPage from './pages/WeighPage.jsx';

export default function App() {
  return (
    <AppProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/declare" element={<DeclarePage />} />
          <Route path="/store" element={<StoragePage />} />
          <Route path="/transfer" element={<TransferPage />} />
          <Route path="/weigh" element={<WeighPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </AppProvider>
  );
}
