import { BrowserRouter, Routes, Route } from 'react-router-dom'
import MarketingPage from './components/MarketingPage'
import Dashboard from './components/Dashboard'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MarketingPage />} />
        <Route path="/dashboard/:projectId" element={<Dashboard />} />
      </Routes>
    </BrowserRouter>
  )
}
