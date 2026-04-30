import { Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import HomeDashboard from './pages/HomeDashboard';
import MarketplacePage from './pages/MarketplacePage';
import WorldPricesPage from './pages/WorldPricesPage';
import './App.css';

/**
 * Root layout:
 *  ┌─ <Navbar />        ← fixed, z-index 100
 *  ├─ <Routes>
 *  │   ├─ <HomeDashboard />
 *  │   ├─ <WorldPricesPage />
 *  │   └─ <MarketplacePage />
 *  └─ <Footer />
 */
export default function App() {
  return (
    <>
      <Navbar />
      <div className="app-body">
        <Routes>
          <Route path="/" element={<HomeDashboard />} />
          <Route path="/thegioi" element={<WorldPricesPage />} />
          <Route path="/marketplace" element={<MarketplacePage />} />
        </Routes>
      </div>
      <Footer />
    </>
  );
}
