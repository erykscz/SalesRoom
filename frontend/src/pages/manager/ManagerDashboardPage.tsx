import { useState, useEffect } from 'react';
import { API_URL } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, Users, DollarSign, TrendingUp, Target, AlertTriangle, Award, BarChart3 } from 'lucide-react';

interface DashboardStats {
  totalDeals: number;
  totalPipelineValue: number;
  weightedForecast: number;
  closedWonValue: number;
  avgHealthScore: number;
  atRiskCount: number;
}

interface RepPerformance {
  id: string;
  name: string;
  email: string;
  total_deals: number;
  closed_won: number;
  closed_lost: number;
  won_value: number;
  pipeline_value: number;
  avg_health_score: number;
  winRate: number;
}

interface AtRiskDeal {
  id: string;
  company_name: string;
  health_score: number;
  stage: string;
  owner_name: string;
  estimated_value: number;
}

interface RecentActivity {
  id: string;
  activity_type: string;
  description: string;
  company_name: string;
  created_by_name: string;
  created_at: string;
}

export default function ManagerDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [dealsByStage, setDealsByStage] = useState<Record<string, number>>({});
  const [repPerformance, setRepPerformance] = useState<RepPerformance[]>([]);
  const [atRiskDeals, setAtRiskDeals] = useState<AtRiskDeal[]>([]);
  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_URL}/manager/dashboard`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
          throw new Error('Failed to fetch dashboard data');
        }

        const data = await response.json();
        setStats(data.stats);
        setDealsByStage(data.dealsByStage || {});
        setRepPerformance(data.repPerformance || []);
        setAtRiskDeals(data.atRiskDeals || []);
        setRecentActivities(data.recentActivities || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchDashboard();
  }, []);

  const formatCurrency = (value: number) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`;
    } else if (value >= 1000) {
      return `$${(value / 1000).toFixed(0)}K`;
    }
    return `$${value.toFixed(0)}`;
  };

  const stageLabels: Record<string, string> = {
    'new_signal': 'New Signal',
    'qualified': 'Qualified',
    'discovery': 'Discovery',
    'solution_design': 'Solution Design',
    'negotiation': 'Negotiation',
    'closed_won': 'Closed Won',
    'closed_lost': 'Closed Lost'
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-red-500">{error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Team Dashboard</h1>
        <p className="text-muted-foreground">Monitor team performance and pipeline health</p>
      </div>

      {/* Key Metrics */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Team Deals</p>
                <p className="text-2xl font-bold">{stats?.totalDeals || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <DollarSign className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Weighted Forecast</p>
                <p className="text-2xl font-bold">{formatCurrency(stats?.weightedForecast || 0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <TrendingUp className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pipeline Value</p>
                <p className="text-2xl font-bold">{formatCurrency(stats?.totalPipelineValue || 0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <Target className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Closed Won</p>
                <p className="text-2xl font-bold">{formatCurrency(stats?.closedWonValue || 0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pipeline by Stage & Health */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Pipeline by Stage */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Pipeline by Stage
            </CardTitle>
            <CardDescription>Deal distribution across sales stages</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Object.entries(dealsByStage).map(([stage, count]) => {
                const total = stats?.totalDeals || 1;
                const percentage = Math.round((count / total) * 100);
                return (
                  <div key={stage}>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-medium">{stageLabels[stage] || stage}</span>
                      <span className="text-sm text-muted-foreground">{count} deals ({percentage}%)</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${
                          stage === 'closed_won' ? 'bg-green-500' :
                          stage === 'closed_lost' ? 'bg-red-500' :
                          stage === 'negotiation' ? 'bg-purple-500' :
                          'bg-primary'
                        }`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              {Object.keys(dealsByStage).length === 0 && (
                <p className="text-center text-muted-foreground py-4">No deals in pipeline</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* At Risk Deals */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Deals at Risk
            </CardTitle>
            <CardDescription>
              {stats?.atRiskCount || 0} deals with health score below 40
            </CardDescription>
          </CardHeader>
          <CardContent>
            {atRiskDeals.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">No deals at risk</p>
            ) : (
              <div className="space-y-3">
                {atRiskDeals.map((deal) => (
                  <div key={deal.id} className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-100">
                    <div>
                      <p className="font-medium">{deal.company_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {deal.owner_name} • {stageLabels[deal.stage] || deal.stage}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-red-600">
                        Health: {deal.health_score}%
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {formatCurrency(deal.estimated_value || 0)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Rep Performance Rankings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="h-5 w-5 text-yellow-500" />
            Rep Performance Rankings
          </CardTitle>
          <CardDescription>Team member performance by closed won value</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-2 font-medium">Rank</th>
                  <th className="text-left py-3 px-2 font-medium">Rep</th>
                  <th className="text-center py-3 px-2 font-medium">Total Deals</th>
                  <th className="text-center py-3 px-2 font-medium">Won</th>
                  <th className="text-center py-3 px-2 font-medium">Win Rate</th>
                  <th className="text-right py-3 px-2 font-medium">Won Value</th>
                  <th className="text-right py-3 px-2 font-medium">Pipeline</th>
                  <th className="text-center py-3 px-2 font-medium">Avg Health</th>
                </tr>
              </thead>
              <tbody>
                {repPerformance.map((rep, index) => (
                  <tr key={rep.id} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="py-3 px-2">
                      <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium ${
                        index === 0 ? 'bg-yellow-100 text-yellow-700' :
                        index === 1 ? 'bg-gray-100 text-gray-700' :
                        index === 2 ? 'bg-orange-100 text-orange-700' :
                        'bg-muted text-muted-foreground'
                      }`}>
                        {index + 1}
                      </span>
                    </td>
                    <td className="py-3 px-2">
                      <div>
                        <p className="font-medium">{rep.name}</p>
                        <p className="text-xs text-muted-foreground">{rep.email}</p>
                      </div>
                    </td>
                    <td className="py-3 px-2 text-center">{rep.total_deals}</td>
                    <td className="py-3 px-2 text-center text-green-600 font-medium">{rep.closed_won}</td>
                    <td className="py-3 px-2 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        rep.winRate >= 50 ? 'bg-green-100 text-green-700' :
                        rep.winRate >= 25 ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {rep.winRate}%
                      </span>
                    </td>
                    <td className="py-3 px-2 text-right font-medium text-green-600">
                      {formatCurrency(rep.won_value || 0)}
                    </td>
                    <td className="py-3 px-2 text-right text-muted-foreground">
                      {formatCurrency(rep.pipeline_value || 0)}
                    </td>
                    <td className="py-3 px-2 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        rep.avg_health_score >= 70 ? 'bg-green-100 text-green-700' :
                        rep.avg_health_score >= 40 ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {rep.avg_health_score}%
                      </span>
                    </td>
                  </tr>
                ))}
                {repPerformance.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-muted-foreground">
                      No team members found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Recent Team Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Team Activity</CardTitle>
          <CardDescription>Latest updates across all deals</CardDescription>
        </CardHeader>
        <CardContent>
          {recentActivities.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">No recent activities</p>
          ) : (
            <div className="space-y-3">
              {recentActivities.map((activity) => (
                <div key={activity.id} className="flex items-start gap-3 p-3 border rounded-lg">
                  <div className="p-2 bg-muted rounded-full">
                    <Users className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{activity.description}</p>
                    <p className="text-sm text-muted-foreground">
                      {activity.company_name && <span>{activity.company_name} • </span>}
                      {activity.created_by_name} • {new Date(activity.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
