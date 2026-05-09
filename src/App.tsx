import { Route, Routes } from 'react-router-dom'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import HomeDashboard from './pages/HomeDashboard'
import NewsArticlePage from './pages/NewsArticlePage'
import NewsIndexPage from './pages/NewsIndexPage'
import PriceChainPage from './pages/PriceChainPage'
import WorldPricesPage from './pages/WorldPricesPage'
import './App.css'

export default function App() {
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
        </Routes>
      </div>
      <Footer />
    </>
  )
}
