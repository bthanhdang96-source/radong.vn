import { Route, Routes, useLocation } from 'react-router-dom'
import Footer from './components/Footer'
import Navbar from './components/Navbar'
import AgriWeatherPage from './pages/AgriWeatherPage'
import AssminReportPage from './pages/AssminReportPage'
import HomeDashboard from './pages/HomeDashboard'
import NewsArticlePage from './pages/NewsArticlePage'
import NewsIndexPage from './pages/NewsIndexPage'
import PriceChainPage from './pages/PriceChainPage'
import WorldPricesPage from './pages/WorldPricesPage'
import './App.css'

export default function App() {
  const location = useLocation()
  const isAssminRoute = location.pathname === '/assmin'

  if (isAssminRoute) {
    return (
      <Routes>
        <Route path="/assmin" element={<AssminReportPage />} />
      </Routes>
    )
  }

  return (
    <>
      <Navbar />
      <div className="app-body">
        <Routes>
          <Route path="/" element={<NewsIndexPage />} />
          <Route path="/tin-tuc/:slug" element={<NewsArticlePage />} />
          <Route path="/bang-gia" element={<HomeDashboard />} />
          <Route path="/chuoi-gia" element={<PriceChainPage />} />
          <Route path="/thegioi" element={<WorldPricesPage />} />
          <Route path="/thoi-tiet-nong-nghiep" element={<AgriWeatherPage />} />
        </Routes>
      </div>
      <Footer />
    </>
  )
}
