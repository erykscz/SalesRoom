import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import {
  LayoutDashboard,
  Briefcase,
  Search,
  FileText,
  Building2,
  Swords,
  BookOpen,
  Users,
  Settings,
  FileSearch,
  Bell,
  User,
  LogOut,
  Sun,
  Moon,
  BarChart3,
  Menu,
  X,
  Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { API_URL } from '@/lib/api';

interface SearchResult {
  type: 'deal' | 'lead' | 'knowledge';
  id: string;
  title: string;
  subtitle?: string;
  url: string;
}

const mainNavItems = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/deals', label: 'Deals', icon: Briefcase },
  { path: '/intent-scraper', label: 'Intent Scraper', icon: Search },
  { path: '/discovery', label: 'Discovery', icon: FileText },
  { path: '/sales-rooms', label: 'Sales Rooms', icon: Building2 },
  { path: '/battlecards', label: 'Battlecards', icon: Swords },
  { path: '/knowledge', label: 'Knowledge Base', icon: BookOpen },
];

const managerNavItems = [
  { path: '/manager/dashboard', label: 'Team Dashboard', icon: BarChart3 },
  { path: '/manager/team-pipeline', label: 'Team Pipeline', icon: Briefcase },
  { path: '/manager/analytics', label: 'Analytics', icon: BarChart3 },
];

const adminNavItems = [
  { path: '/admin/users', label: 'Users', icon: Users },
  { path: '/admin/settings', label: 'Settings', icon: Settings },
  { path: '/admin/audit-log', label: 'Audit Log', icon: FileSearch },
];

export default function MainLayout() {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Global search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Fetch unread notification count
  useEffect(() => {
    const fetchUnreadCount = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;

        const response = await fetch(`${API_URL}/notifications?limit=1`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (response.ok) {
          const data = await response.json();
          setUnreadCount(data.unreadCount || 0);
        }
      } catch (err) {
        console.error('Failed to fetch notification count:', err);
      }
    };

    fetchUnreadCount();
    // Poll for updates every 30 seconds
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, []);

  // Global search functionality
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setSearchFocused(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const performSearch = async () => {
      if (searchQuery.trim().length < 2) {
        setSearchResults([]);
        return;
      }

      setSearchLoading(true);
      try {
        const token = localStorage.getItem('token');
        const results: SearchResult[] = [];

        // Search deals
        const dealsResponse = await fetch(`${API_URL}/deals?search=${encodeURIComponent(searchQuery)}&limit=5`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (dealsResponse.ok) {
          const dealsData = await dealsResponse.json();
          (dealsData.deals || []).forEach((deal: any) => {
            results.push({
              type: 'deal',
              id: deal.id,
              title: deal.company_name,
              subtitle: deal.industry || deal.stage,
              url: `/deals/${deal.id}`
            });
          });
        }

        // Search leads
        const leadsResponse = await fetch(`${API_URL}/leads?search=${encodeURIComponent(searchQuery)}&limit=3`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (leadsResponse.ok) {
          const leadsData = await leadsResponse.json();
          (leadsData.leads || []).forEach((lead: any) => {
            results.push({
              type: 'lead',
              id: lead.id,
              title: lead.company_name,
              subtitle: lead.industry || 'Lead',
              url: `/intent-scraper`
            });
          });
        }

        // Search knowledge base
        const kbResponse = await fetch(`${API_URL}/knowledge?search=${encodeURIComponent(searchQuery)}&limit=3`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (kbResponse.ok) {
          const kbData = await kbResponse.json();
          (kbData.items || []).forEach((item: any) => {
            results.push({
              type: 'knowledge',
              id: item.id,
              title: item.title,
              subtitle: item.type?.replace(/_/g, ' '),
              url: `/knowledge`
            });
          });
        }

        setSearchResults(results);
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setSearchLoading(false);
      }
    };

    const debounce = setTimeout(performSearch, 300);
    return () => clearTimeout(debounce);
  }, [searchQuery]);

  const handleSearchResultClick = (result: SearchResult) => {
    navigate(result.url);
    setSearchQuery('');
    setSearchResults([]);
    setSearchFocused(false);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && searchResults.length > 0) {
      handleSearchResultClick(searchResults[0]);
    }
    if (e.key === 'Escape') {
      setSearchFocused(false);
      searchInputRef.current?.blur();
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const isManager = user?.role === 'manager' || user?.role === 'admin';
  const isAdmin = user?.role === 'admin';

  const NavLink = ({ item }: { item: typeof mainNavItems[0] }) => {
    const isActive = location.pathname === item.path ||
      (item.path !== '/dashboard' && location.pathname.startsWith(item.path));

    return (
      <Link
        to={item.path}
        className={cn(
          "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
          isActive
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        )}
        onClick={() => setSidebarOpen(false)}
      >
        <item.icon className="h-5 w-5" />
        {item.label}
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 text-white transform transition-transform duration-200 ease-in-out lg:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between h-16 px-4 border-b border-slate-700">
            <Link to="/dashboard" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <Building2 className="h-5 w-5 text-white" />
              </div>
              <span className="font-bold text-lg">Sales Room</span>
            </Link>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden text-white hover:bg-slate-800"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto p-4 space-y-1">
            {mainNavItems.map((item) => (
              <NavLink key={item.path} item={item} />
            ))}

            {isManager && (
              <>
                <div className="pt-4 pb-2">
                  <span className="px-3 text-xs font-semibold uppercase text-slate-400">
                    Manager
                  </span>
                </div>
                {managerNavItems.map((item) => (
                  <NavLink key={item.path} item={item} />
                ))}
              </>
            )}

            {isAdmin && (
              <>
                <div className="pt-4 pb-2">
                  <span className="px-3 text-xs font-semibold uppercase text-slate-400">
                    Admin
                  </span>
                </div>
                {adminNavItems.map((item) => (
                  <NavLink key={item.path} item={item} />
                ))}
              </>
            )}
          </nav>

          {/* User section */}
          <div className="p-4 border-t border-slate-700">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center">
                {user?.avatarUrl ? (
                  <img src={user.avatarUrl} alt={user.name} className="w-full h-full rounded-full object-cover" />
                ) : (
                  <User className="h-5 w-5 text-slate-300" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user?.name}</p>
                <p className="text-xs text-slate-400 capitalize">{user?.role}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="flex-1 text-slate-300 hover:bg-slate-800 hover:text-white"
                onClick={() => navigate('/profile')}
              >
                <User className="h-4 w-4 mr-2" />
                Profile
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-slate-300 hover:bg-slate-800 hover:text-white"
                onClick={handleLogout}
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Header */}
        <header className="sticky top-0 z-30 h-16 bg-background border-b flex items-center justify-between px-4 lg:px-6">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <Breadcrumbs />
          </div>

          {/* Global Search */}
          <div ref={searchRef} className="relative hidden md:block flex-1 max-w-md mx-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search deals, leads, knowledge..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onKeyDown={handleSearchKeyDown}
                className="w-full h-10 pl-10 pr-4 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                aria-label="Global search"
              />
              {searchLoading && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>

            {/* Search Results Dropdown */}
            {searchFocused && (searchResults.length > 0 || searchQuery.length >= 2) && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-background border rounded-md shadow-lg max-h-80 overflow-y-auto z-50">
                {searchResults.length === 0 && searchQuery.length >= 2 && !searchLoading ? (
                  <div className="p-4 text-center text-muted-foreground text-sm">
                    No results found for "{searchQuery}"
                  </div>
                ) : (
                  <div className="py-1">
                    {searchResults.map((result) => (
                      <button
                        key={`${result.type}-${result.id}`}
                        onClick={() => handleSearchResultClick(result)}
                        className="w-full px-4 py-2 text-left hover:bg-accent flex items-center gap-3"
                      >
                        <div className={cn(
                          "w-8 h-8 rounded flex items-center justify-center text-xs font-medium",
                          result.type === 'deal' ? "bg-blue-100 text-blue-600" :
                          result.type === 'lead' ? "bg-green-100 text-green-600" :
                          "bg-purple-100 text-purple-600"
                        )}>
                          {result.type === 'deal' ? <Briefcase className="h-4 w-4" /> :
                           result.type === 'lead' ? <Search className="h-4 w-4" /> :
                           <BookOpen className="h-4 w-4" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{result.title}</p>
                          <p className="text-xs text-muted-foreground truncate capitalize">
                            {result.type} • {result.subtitle}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/notifications')}
              className="relative"
              aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-medium">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Button>
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
