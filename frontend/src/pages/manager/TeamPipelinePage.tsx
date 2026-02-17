import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { API_URL } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Users, DollarSign, ExternalLink, Filter } from 'lucide-react';

interface Deal {
  id: string;
  company_name: string;
  industry: string | null;
  stage: string;
  estimated_value: number | null;
  health_score: number;
  owner_id: string;
  owner_name: string;
  owner_email: string;
  next_step_date: string | null;
  created_at: string;
}

interface RepPipeline {
  owner_name: string;
  owner_email: string | null;
  deals: Deal[];
}

export default function TeamPipelinePage() {
  const [pipeline, setPipeline] = useState<RepPipeline[]>([]);
  const [totalDeals, setTotalDeals] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRep, setSelectedRep] = useState<string>('all');

  useEffect(() => {
    const fetchPipeline = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_URL}/manager/team-pipeline`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
          throw new Error('Failed to fetch team pipeline');
        }

        const data = await response.json();
        setPipeline(data.pipeline || []);
        setTotalDeals(data.totalDeals || 0);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchPipeline();
  }, []);

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
    'negotiation': 'Negotiation',
    'closed_won': 'Closed Won',
    'closed_lost': 'Closed Lost'
  };

  const stageColors: Record<string, string> = {
    'new_signal': 'bg-gray-100 text-gray-700',
    'qualified': 'bg-blue-100 text-blue-700',
    'discovery': 'bg-purple-100 text-purple-700',
    'solution_design': 'bg-indigo-100 text-indigo-700',
    'negotiation': 'bg-orange-100 text-orange-700',
    'closed_won': 'bg-green-100 text-green-700',
    'closed_lost': 'bg-red-100 text-red-700'
  };

  const getHealthColor = (score: number) => {
    if (score >= 70) return 'text-green-600';
    if (score >= 40) return 'text-yellow-600';
    return 'text-red-600';
  };

  // Get unique reps for filter dropdown
  const reps = pipeline.map(p => ({
    name: p.owner_name,
    email: p.owner_email
  }));

  // Filter pipeline by selected rep
  const filteredPipeline = selectedRep === 'all'
    ? pipeline
    : pipeline.filter(p => p.owner_name === selectedRep);

  // Calculate filtered totals
  const filteredTotalDeals = filteredPipeline.reduce((sum, p) => sum + p.deals.length, 0);
  const filteredTotalValue = filteredPipeline.reduce((sum, p) =>
    sum + p.deals.reduce((dealSum, d) => dealSum + (d.estimated_value || 0), 0), 0
  );

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
          <h1 className="text-2xl font-bold">Team Pipeline</h1>
          <p className="text-muted-foreground">View all deals across your team</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <select
              value={selectedRep}
              onChange={(e) => setSelectedRep(e.target.value)}
              className="border rounded-md px-3 py-2 text-sm bg-background"
            >
              <option value="all">All Reps</option>
              {reps.map((rep) => (
                <option key={rep.email || rep.name} value={rep.name}>
                  {rep.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  {selectedRep === 'all' ? 'Total Team Deals' : `${selectedRep}'s Deals`}
                </p>
                <p className="text-2xl font-bold">{filteredTotalDeals}</p>
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
                <p className="text-sm text-muted-foreground">Pipeline Value</p>
                <p className="text-2xl font-bold">{formatCurrency(filteredTotalValue)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Users className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Team Members</p>
                <p className="text-2xl font-bold">{selectedRep === 'all' ? reps.length : 1}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pipeline by Rep */}
      {filteredPipeline.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No deals found</p>
          </CardContent>
        </Card>
      ) : (
        filteredPipeline.map((rep) => (
          <Card key={rep.owner_name}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                {rep.owner_name}
              </CardTitle>
              <CardDescription>
                {rep.owner_email} • {rep.deals.length} deals • {formatCurrency(
                  rep.deals.reduce((sum, d) => sum + (d.estimated_value || 0), 0)
                )} pipeline
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-2 font-medium">Company</th>
                      <th className="text-left py-2 px-2 font-medium">Stage</th>
                      <th className="text-right py-2 px-2 font-medium">Value</th>
                      <th className="text-center py-2 px-2 font-medium">Health</th>
                      <th className="text-left py-2 px-2 font-medium">Next Step</th>
                      <th className="text-right py-2 px-2 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rep.deals.slice(0, 10).map((deal) => (
                      <tr key={deal.id} className="border-b last:border-0 hover:bg-muted/50">
                        <td className="py-2 px-2">
                          <div>
                            <p className="font-medium">{deal.company_name}</p>
                            {deal.industry && (
                              <p className="text-xs text-muted-foreground">{deal.industry}</p>
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-2">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${stageColors[deal.stage] || 'bg-gray-100'}`}>
                            {stageLabels[deal.stage] || deal.stage}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-right font-medium">
                          {formatCurrency(deal.estimated_value)}
                        </td>
                        <td className="py-2 px-2 text-center">
                          <span className={`font-medium ${getHealthColor(deal.health_score)}`}>
                            {deal.health_score}%
                          </span>
                        </td>
                        <td className="py-2 px-2 text-sm text-muted-foreground">
                          {deal.next_step_date
                            ? new Date(deal.next_step_date).toLocaleDateString()
                            : '-'}
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
                    {rep.deals.length > 10 && (
                      <tr>
                        <td colSpan={6} className="py-2 px-2 text-center text-sm text-muted-foreground">
                          +{rep.deals.length - 10} more deals
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
