import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { Toaster } from './components/ui/toaster'

// Layout
import MainLayout from './components/layout/MainLayout'
import PublicLayout from './components/layout/PublicLayout'

// Auth Pages
import LoginPage from './pages/auth/LoginPage'
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage'

// Protected Pages
import DashboardPage from './pages/DashboardPage'
import DealsPage from './pages/deals/DealsPage'
import DealDetailPage from './pages/deals/DealDetailPage'
import DealCreatePage from './pages/deals/DealCreatePage'
import DealEditPage from './pages/deals/DealEditPage'
import IntentScraperPage from './pages/intent-scraper/IntentScraperPage'
import DiscoveryPage from './pages/discovery/DiscoveryPage'
import SalesRoomsPage from './pages/sales-rooms/SalesRoomsPage'
import SalesRoomCreatePage from './pages/sales-rooms/SalesRoomCreatePage'
import SalesRoomDetailPage from './pages/sales-rooms/SalesRoomDetailPage'
import BattlecardsPage from './pages/battlecards/BattlecardsPage'
import KnowledgeBasePage from './pages/knowledge/KnowledgeBasePage'
import ProfilePage from './pages/ProfilePage'
import NotificationsPage from './pages/NotificationsPage'

// Manager Pages
import ManagerDashboardPage from './pages/manager/ManagerDashboardPage'
import TeamPipelinePage from './pages/manager/TeamPipelinePage'
import AnalyticsPage from './pages/manager/AnalyticsPage'

// Admin Pages
import UsersPage from './pages/admin/UsersPage'
import SettingsPage from './pages/admin/SettingsPage'
import AuditLogPage from './pages/admin/AuditLogPage'

// Public Pages
import SalesRoomPublicPage from './pages/public/SalesRoomPublicPage'
import NotFoundPage from './pages/NotFoundPage'

// Guards
import ProtectedRoute from './components/guards/ProtectedRoute'
import RoleGuard from './components/guards/RoleGuard'

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="salesroom-theme">
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public routes */}
            <Route element={<PublicLayout />}>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/room/:slug" element={<SalesRoomPublicPage />} />
            </Route>

            {/* Protected routes */}
            <Route element={<ProtectedRoute />}>
              <Route element={<MainLayout />}>
                {/* Dashboard */}
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<DashboardPage />} />

                {/* Deals */}
                <Route path="/deals" element={<DealsPage />} />
                <Route path="/deals/new" element={<DealCreatePage />} />
                <Route path="/deals/:id" element={<DealDetailPage />} />
                <Route path="/deals/:id/edit" element={<DealEditPage />} />

                {/* Intent Scraper */}
                <Route path="/intent-scraper" element={<IntentScraperPage />} />

                {/* Discovery */}
                <Route path="/discovery" element={<DiscoveryPage />} />

                {/* Sales Rooms */}
                <Route path="/sales-rooms" element={<SalesRoomsPage />} />
                <Route path="/sales-rooms/new" element={<SalesRoomCreatePage />} />
                <Route path="/sales-rooms/:id" element={<SalesRoomDetailPage />} />

                {/* Battlecards */}
                <Route path="/battlecards" element={<BattlecardsPage />} />

                {/* Knowledge Base */}
                <Route path="/knowledge" element={<KnowledgeBasePage />} />

                {/* Profile & Notifications */}
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/notifications" element={<NotificationsPage />} />

                {/* Manager routes */}
                <Route element={<RoleGuard allowedRoles={['manager', 'admin']} />}>
                  <Route path="/manager/dashboard" element={<ManagerDashboardPage />} />
                  <Route path="/manager/team-pipeline" element={<TeamPipelinePage />} />
                  <Route path="/manager/analytics" element={<AnalyticsPage />} />
                </Route>

                {/* Admin routes */}
                <Route element={<RoleGuard allowedRoles={['admin']} />}>
                  <Route path="/admin/users" element={<UsersPage />} />
                  <Route path="/admin/settings" element={<SettingsPage />} />
                  <Route path="/admin/audit-log" element={<AuditLogPage />} />
                </Route>
              </Route>
            </Route>

            {/* 404 */}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </BrowserRouter>
        <Toaster />
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App
