import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Briefcase, Search, FileText, Building2, TrendingUp, Users, Clock, AlertCircle, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || '/api';

interface DashboardStats {
  deals: {
    total: number;
    newThisWeek: number;
  };
  leads: {
    total: number;
    newThisWeek: number;
  };
  salesRooms: {
    total: number;
  };
  transcripts: {
    total: number;
    pending: number;
  };
  pipeline: {
    value: number;
    wonThisMonth: number;
  };
}

interface Activity {
  id: string;
  description: string;
  created_at: string;
  entity_type: string;
}

interface DealAttention {
  id: string;
  company_name: string;
  next_step_date: string;
  health_score: number | null;
  priority: string;
  stage: string;
  compelling_event_date: string | null;
}

export default function DashboardPage() {
  const { user, token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentActivity, setRecentActivity] = useState<Activity[]>([]);
  const [dealsNeedingAttention, setDealsNeedingAttention] = useState<DealAttention[]>([]);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const response = await fetch(`${API_URL}/dashboard/stats`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch dashboard data');
        }

        const data = await response.json();
        setStats(data.stats);
        setRecentActivity(data.recentActivity || []);
        setDealsNeedingAttention(data.dealsNeedingAttention || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [token]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffHours < 1) {
      return 'Just now';
    } else if (diffHours < 24) {
      return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    } else if (diffDays < 7) {
      return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  const getActivityIcon = (entityType: string) => {
    switch (entityType) {
      case 'deal':
        return { icon: Briefcase, color: 'bg-blue-100 dark:bg-blue-900/20 text-blue-600' };
      case 'sales_room':
        return { icon: Building2, color: 'bg-green-100 dark:bg-green-900/20 text-green-600' };
      case 'transcript':
        return { icon: FileText, color: 'bg-purple-100 dark:bg-purple-900/20 text-purple-600' };
      case 'lead':
        return { icon: Search, color: 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-600' };
      default:
        return { icon: TrendingUp, color: 'bg-gray-100 dark:bg-gray-900/20 text-gray-600' };
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'text-red-500';
      case 'medium':
        return 'text-yellow-500';
      default:
        return 'text-blue-500';
    }
  };

  const isOverdue = (dateStr: string) => {
    return new Date(dateStr) < new Date();
  };

  const isCompellingEventApproaching = (dateStr: string | null) => {
    if (!dateStr) return false;
    const eventDate = new Date(dateStr);
    const today = new Date();
    const twoWeeksFromNow = new Date();
    twoWeeksFromNow.setDate(twoWeeksFromNow.getDate() + 14);
    return eventDate >= today && eventDate <= twoWeeksFromNow;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div role="alert" className="text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <p className="text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  const statCards = [
    {
      label: 'Active Deals',
      value: stats?.deals.total.toString() || '0',
      icon: Briefcase,
      change: `+${stats?.deals.newThisWeek || 0} this week`,
      link: '/deals',
    },
    {
      label: 'New Leads',
      value: stats?.leads.total.toString() || '0',
      icon: Search,
      change: `+${stats?.leads.newThisWeek || 0} this week`,
      link: '/intent-scraper',
    },
    {
      label: 'Sales Rooms',
      value: stats?.salesRooms.total.toString() || '0',
      icon: Building2,
      change: 'Active rooms',
      link: '/sales-rooms',
    },
    {
      label: 'Transcripts',
      value: stats?.transcripts.total.toString() || '0',
      icon: FileText,
      change: `${stats?.transcripts.pending || 0} pending analysis`,
      link: '/discovery',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome header */}
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Welcome back, {user?.name?.split(' ')[0]}</h2>
        <p className="text-muted-foreground">Here's what's happening with your sales pipeline today.</p>
      </div>

      {/* Stats grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Link key={stat.label} to={stat.link}>
            <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{stat.label}</CardTitle>
                <stat.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground">{stat.change}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Pipeline Value Card */}
      {stats?.pipeline && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pipeline Value</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.pipeline.value)}</div>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(stats.pipeline.wonThisMonth)} won this month
            </p>
          </CardContent>
        </Card>
      )}

      {/* Main content grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        {/* Recent Activity */}
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Your latest actions and updates</CardDescription>
          </CardHeader>
          <CardContent>
            {recentActivity.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">No recent activity</p>
            ) : (
              <div className="space-y-4">
                {recentActivity.slice(0, 5).map((activity) => {
                  const { icon: Icon, color } = getActivityIcon(activity.entity_type);
                  return (
                    <div key={activity.id} className="flex items-center gap-4 p-3 rounded-lg bg-muted/50">
                      <div className={`h-9 w-9 rounded-full flex items-center justify-center ${color}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{activity.description}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(activity.created_at)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Deals Needing Attention */}
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Needs Attention</CardTitle>
            <CardDescription>Deals that need your focus</CardDescription>
          </CardHeader>
          <CardContent>
            {dealsNeedingAttention.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">All deals are on track!</p>
            ) : (
              <div className="space-y-4">
                {dealsNeedingAttention.map((deal) => (
                  <Link key={deal.id} to={`/deals/${deal.id}`} className="block">
                    <div className="flex items-center gap-3 hover:bg-accent/50 p-2 rounded-lg transition-colors">
                      {isCompellingEventApproaching(deal.compelling_event_date) ? (
                        <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                      ) : isOverdue(deal.next_step_date) ? (
                        <Clock className="h-4 w-4 text-orange-500 shrink-0" />
                      ) : deal.health_score !== null && deal.health_score < 40 ? (
                        <AlertCircle className="h-4 w-4 text-yellow-500 shrink-0" />
                      ) : (
                        <Users className="h-4 w-4 text-blue-500 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{deal.company_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {isCompellingEventApproaching(deal.compelling_event_date)
                            ? 'Deadline approaching'
                            : isOverdue(deal.next_step_date)
                              ? 'Next step overdue'
                              : deal.health_score !== null && deal.health_score < 40
                                ? `Health score: ${deal.health_score}%`
                                : 'Needs attention'}
                        </p>
                      </div>
                      <span className={`text-xs font-medium capitalize ${getPriorityColor(deal.priority)}`}>
                        {deal.priority}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
