import { Route, Routes } from 'react-router-dom'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import HomeDashboard from './pages/HomeDashboard'
import WorldPricesPage from './pages/WorldPricesPage'
import './App.css'

export default function App() {
  return (
    <>
      <Navbar />
      <div className="app-body">
        <Routes>
          <Route path="/" element={<HomeDashboard />} />
          <Route path="/thegioi" element={<WorldPricesPage />} />
        </Routes>
      </div>
      <Footer />
    </>
  )
}
