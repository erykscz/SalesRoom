import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { TrendingUp, Calendar, AlertTriangle, AlertCircle, Clock, Building2 } from 'lucide-react';
import { API_URL } from '@/lib/api';

interface Deal {
  id: string;
  company_name: string;
  industry: string | null;
  stage: string;
  estimated_value: number | null;
  close_date: string | null;
  next_step_date: string;
  health_score: number;
  priority: string;
  owner_name: string;
  days_in_stage: number;
  stagnation_status: 'normal' | 'warning' | 'critical';
  last_stage_change: string;
}

interface KanbanData {
  stages: Record<string, Deal[]>;
  total: number;
}

const stageLabels: Record<string, string> = {
  new_signal: 'New Signal',
  qualified: 'Qualified',
  discovery: 'Discovery',
  solution_design: 'Solution Design',
  negotiation: 'Negotiation',
  closed_won: 'Closed Won',
  closed_lost: 'Closed Lost',
};

const stageColors: Record<string, string> = {
  new_signal: 'bg-blue-500',
  qualified: 'bg-purple-500',
  discovery: 'bg-yellow-500',
  solution_design: 'bg-orange-500',
  negotiation: 'bg-pink-500',
  closed_won: 'bg-green-500',
  closed_lost: 'bg-red-500',
};

export default function KanbanBoard() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [kanbanData, setKanbanData] = useState<KanbanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Handler for clicking column header to filter by stage
  const handleColumnClick = (stage: string) => {
    navigate(`/deals?stage=${stage}`);
  };

  useEffect(() => {
    fetchKanbanData();
  }, [token]);

  const fetchKanbanData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/deals/kanban`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch Kanban data');
      }

      const data = await response.json();
      setKanbanData(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number | null) => {
    if (!value) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const getHealthScoreColor = (score: number) => {
    if (score >= 70) return 'text-green-500';
    if (score >= 40) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getStagnationBorder = (status: string) => {
    switch (status) {
      case 'critical':
        return 'border-l-4 border-l-red-500';
      case 'warning':
        return 'border-l-4 border-l-yellow-500';
      default:
        return 'border-l-4 border-l-transparent';
    }
  };

  const getStagnationIcon = (status: string, days: number) => {
    if (status === 'critical') {
      return (
        <div className="flex items-center gap-1 text-red-500 text-xs">
          <AlertCircle className="w-3 h-3" />
          <span>{days}d</span>
        </div>
      );
    }
    if (status === 'warning') {
      return (
        <div className="flex items-center gap-1 text-yellow-500 text-xs">
          <AlertTriangle className="w-3 h-3" />
          <span>{days}d</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1 text-muted-foreground text-xs">
        <Clock className="w-3 h-3" />
        <span>{days}d</span>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">Loading Kanban board...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-red-500">{error}</div>
      </div>
    );
  }

  if (!kanbanData) {
    return null;
  }

  // Filter out closed stages for the main board (optional: show them at the end)
  const activeStages = ['new_signal', 'qualified', 'discovery', 'solution_design', 'negotiation'];
  const closedStages = ['closed_won', 'closed_lost'];

  return (
    <div className="space-y-6">
      {/* Stagnation Legend */}
      <div className="flex items-center gap-6 text-sm text-muted-foreground">
        <span className="font-medium">Stagnation Indicators:</span>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-l-4 border-l-yellow-500 bg-muted"></div>
          <span>&gt;10 days (Warning)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-l-4 border-l-red-500 bg-muted"></div>
          <span>&gt;20 days (Critical)</span>
        </div>
      </div>

      {/* Active Stages */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {activeStages.map((stage) => (
          <div key={stage} className="flex-shrink-0 w-72">
            <Card>
              <CardHeader
                className="py-3 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => handleColumnClick(stage)}
                title={`Click to filter by ${stageLabels[stage]}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${stageColors[stage]}`}></div>
                    <CardTitle className="text-sm font-medium">
                      {stageLabels[stage]}
                    </CardTitle>
                  </div>
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
                    {kanbanData.stages[stage]?.length || 0}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 max-h-[calc(100vh-300px)] overflow-y-auto">
                {kanbanData.stages[stage]?.length === 0 ? (
                  <div className="text-center py-4 text-muted-foreground text-sm">
                    No deals
                  </div>
                ) : (
                  kanbanData.stages[stage]?.map((deal) => (
                    <Link key={deal.id} to={`/deals/${deal.id}`}>
                      <div
                        className={`p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors cursor-pointer ${getStagnationBorder(deal.stagnation_status)}`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-sm truncate" title={deal.company_name}>
                              {deal.company_name}
                            </h4>
                            {deal.industry && (
                              <p className="text-xs text-muted-foreground truncate">
                                {deal.industry}
                              </p>
                            )}
                          </div>
                          {getStagnationIcon(deal.stagnation_status, deal.days_in_stage)}
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1">
                            <TrendingUp className={`w-3 h-3 ${getHealthScoreColor(deal.health_score)}`} />
                            <span className={getHealthScoreColor(deal.health_score)}>
                              {deal.health_score}%
                            </span>
                          </div>
                          <span className="font-medium">
                            {formatCurrency(deal.estimated_value)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                          <span>{deal.owner_name}</span>
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            <span>{new Date(deal.next_step_date).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        ))}
      </div>

      {/* Closed Deals Section */}
      <div className="mt-8">
        <h3 className="text-lg font-semibold mb-4">Closed Deals</h3>
        <div className="flex gap-4">
          {closedStages.map((stage) => (
            <div key={stage} className="flex-shrink-0 w-72">
              <Card className={stage === 'closed_won' ? 'border-green-500/30' : 'border-red-500/30'}>
                <CardHeader className="py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${stageColors[stage]}`}></div>
                      <CardTitle className="text-sm font-medium">
                        {stageLabels[stage]}
                      </CardTitle>
                    </div>
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
                      {kanbanData.stages[stage]?.length || 0}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 max-h-64 overflow-y-auto">
                  {kanbanData.stages[stage]?.length === 0 ? (
                    <div className="text-center py-4 text-muted-foreground text-sm">
                      No deals
                    </div>
                  ) : (
                    kanbanData.stages[stage]?.slice(0, 5).map((deal) => (
                      <Link key={deal.id} to={`/deals/${deal.id}`}>
                        <div className="p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors cursor-pointer">
                          <h4 className="font-medium text-sm truncate" title={deal.company_name}>
                            {deal.company_name}
                          </h4>
                          <div className="flex items-center justify-between text-xs mt-1">
                            <span className="text-muted-foreground">{deal.owner_name}</span>
                            <span className="font-medium">
                              {formatCurrency(deal.estimated_value)}
                            </span>
                          </div>
                        </div>
                      </Link>
                    ))
                  )}
                  {(kanbanData.stages[stage]?.length || 0) > 5 && (
                    <div className="text-center text-xs text-muted-foreground">
                      +{(kanbanData.stages[stage]?.length || 0) - 5} more
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
