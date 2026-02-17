import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { API_URL } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, AlertTriangle, Clock, ExternalLink, TrendingDown } from 'lucide-react';

interface StagnantDeal {
  id: string;
  company_name: string;
  stage: string;
  estimated_value: number | null;
  health_score: number;
  owner_name: string;
  days_in_stage: number;
  last_stage_change: string;
}

export default function AnalyticsPage() {
  const [stagnantDeals, setStagnantDeals] = useState<StagnantDeal[]>([]);
  const [byStage, setByStage] = useState<Record<string, StagnantDeal[]>>({});
  const [totalStagnant, setTotalStagnant] = useState(0);
  const [minDays, setMinDays] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStagnation = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_URL}/manager/stagnation?min_days=${minDays}`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
          throw new Error('Failed to fetch stagnation report');
        }

        const data = await response.json();
        setStagnantDeals(data.stagnantDeals || []);
        setByStage(data.byStage || {});
        setTotalStagnant(data.totalStagnant || 0);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchStagnation();
  }, [minDays]);

  const formatCurrency = (value: number | null) => {
    if (!value) return '-';
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
    'negotiation': 'Negotiation'
  };

  const stageColors: Record<string, string> = {
    'new_signal': 'bg-gray-100 text-gray-700 border-gray-200',
    'qualified': 'bg-blue-100 text-blue-700 border-blue-200',
    'discovery': 'bg-purple-100 text-purple-700 border-purple-200',
    'solution_design': 'bg-indigo-100 text-indigo-700 border-indigo-200',
    'negotiation': 'bg-orange-100 text-orange-700 border-orange-200'
  };

  const getDaysColor = (days: number) => {
    if (days >= 30) return 'text-red-600 bg-red-100';
    if (days >= 20) return 'text-orange-600 bg-orange-100';
    return 'text-yellow-600 bg-yellow-100';
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-muted-foreground">Pipeline health and stagnation analysis</p>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Stagnant Deals</p>
                <p className="text-2xl font-bold">{totalStagnant}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <Clock className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Threshold</p>
                <p className="text-2xl font-bold">{minDays}+ days</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <TrendingDown className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">At Risk Value</p>
                <p className="text-2xl font-bold">
                  {formatCurrency(stagnantDeals.reduce((sum, d) => sum + (d.estimated_value || 0), 0))}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium">Show deals stuck for at least:</label>
            <select
              value={minDays}
              onChange={(e) => setMinDays(parseInt(e.target.value))}
              className="border rounded-md px-3 py-2 text-sm bg-background"
            >
              <option value="5">5 days</option>
              <option value="10">10 days</option>
              <option value="14">14 days</option>
              <option value="21">21 days</option>
              <option value="30">30 days</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Stagnation Report */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            Stagnation Report
          </CardTitle>
          <CardDescription>
            Deals stuck in the same stage for {minDays}+ days need attention
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stagnantDeals.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No stagnant deals found. Great job keeping deals moving!</p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(byStage).map(([stage, deals]) => (
                <div key={stage} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className={`px-3 py-1 rounded-full text-sm font-medium border ${stageColors[stage] || 'bg-gray-100'}`}>
                      {stageLabels[stage] || stage}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {deals.length} deal{deals.length !== 1 ? 's' : ''} stuck
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 px-2 font-medium">Company</th>
                          <th className="text-center py-2 px-2 font-medium">Days Stuck</th>
                          <th className="text-right py-2 px-2 font-medium">Value</th>
                          <th className="text-center py-2 px-2 font-medium">Health</th>
                          <th className="text-left py-2 px-2 font-medium">Owner</th>
                          <th className="text-right py-2 px-2 font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {deals.map((deal) => (
                          <tr key={deal.id} className="border-b last:border-0 hover:bg-muted/50">
                            <td className="py-2 px-2">
                              <p className="font-medium">{deal.company_name}</p>
                            </td>
                            <td className="py-2 px-2 text-center">
                              <span className={`px-2 py-1 rounded-full text-xs font-bold ${getDaysColor(deal.days_in_stage)}`}>
                                {deal.days_in_stage} days
                              </span>
                            </td>
                            <td className="py-2 px-2 text-right font-medium">
                              {formatCurrency(deal.estimated_value)}
                            </td>
                            <td className="py-2 px-2 text-center">
                              <span className={`font-medium ${
                                deal.health_score >= 70 ? 'text-green-600' :
                                deal.health_score >= 40 ? 'text-yellow-600' :
                                'text-red-600'
                              }`}>
                                {deal.health_score}%
                              </span>
                            </td>
                            <td className="py-2 px-2 text-sm text-muted-foreground">
                              {deal.owner_name}
                            </td>
                            <td className="py-2 px-2 text-right">
                              <Link to={`/deals/${deal.id}`}>
                                <Button variant="ghost" size="sm">
                                  <ExternalLink className="h-4 w-4" />
                                </Button>
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
