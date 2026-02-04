import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import {
  ArrowLeft,
  Edit,
  Trash2,
  Loader2,
  Building2,
  Calendar,
  DollarSign,
  AlertTriangle,
  Clock,
  Flag,
  TrendingUp,
  Send,
  MessageSquare
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || '/api';

interface Deal {
  id: string;
  company_name: string;
  industry: string | null;
  stage: string;
  estimated_value: number | null;
  close_date: string | null;
  compelling_event_date: string | null;
  next_step_date: string | null;
  next_step_description: string | null;
  priority: string;
  health_score: number | null;
  owner_id: string;
  owner_name?: string;
  created_at: string;
  updated_at: string;
}

interface Activity {
  id: string;
  type: string;
  description: string;
  created_at: string;
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

const priorityColors: Record<string, string> = {
  low: 'text-gray-500',
  medium: 'text-yellow-500',
  high: 'text-red-500',
};

export default function DealDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [deal, setDeal] = useState<Deal | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [noteContent, setNoteContent] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  // Store the referrer URL (deals list with filters) from location state
  const backUrl = (location.state as { from?: string })?.from || '/deals';

  useEffect(() => {
    const fetchDeal = async () => {
      try {
        const response = await fetch(`${API_URL}/deals/${id}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          if (response.status === 404) {
            setError('Deal not found');
          } else {
            throw new Error('Failed to fetch deal');
          }
          return;
        }

        const data = await response.json();
        setDeal(data.deal);
        setActivities(data.activities || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchDeal();
    }
  }, [id, token]);

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete the deal for "${deal?.company_name}"?`)) {
      return;
    }

    try {
      setDeleting(true);
      const response = await fetch(`${API_URL}/deals/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to delete deal');
      }

      navigate('/deals');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete deal');
      setDeleting(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteContent.trim()) return;

    try {
      setAddingNote(true);
      const response = await fetch(`${API_URL}/deals/${id}/notes`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: noteContent }),
      });

      if (!response.ok) {
        throw new Error('Failed to add note');
      }

      const data = await response.json();
      // Add the new note to the activities list
      setActivities([data.note, ...activities]);
      setNoteContent('');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to add note');
    } finally {
      setAddingNote(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatCurrency = (value: number | null) => {
    if (value === null || value === undefined) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(value);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !deal) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link to={backUrl}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Deals
            </Button>
          </Link>
        </div>
        <Card className="border-red-500/20">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertTriangle className="h-12 w-12 text-red-500 mb-4" />
            <h3 className="text-xl font-semibold mb-2">Deal Not Found</h3>
            <p className="text-muted-foreground mb-4">
              {error || 'The deal you are looking for does not exist or has been deleted.'}
            </p>
            <Link to={backUrl}>
              <Button>Return to Deals</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to={backUrl}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold">{deal.company_name}</h2>
              <span className={`px-2 py-1 rounded text-xs text-white ${stageColors[deal.stage] || 'bg-gray-500'}`}>
                {stageLabels[deal.stage] || deal.stage}
              </span>
            </div>
            {deal.industry && (
              <p className="text-muted-foreground">{deal.industry}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link to={`/deals/${id}/edit`}>
            <Button variant="outline">
              <Edit className="w-4 h-4 mr-2" />
              Edit
            </Button>
          </Link>
          <Button variant="outline" className="text-red-500 hover:text-red-600" onClick={handleDelete} disabled={deleting}>
            <Trash2 className="w-4 h-4 mr-2" />
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Deal Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div className="flex items-start gap-3">
                  <DollarSign className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">Estimated Value</p>
                    <p className="font-semibold">{formatCurrency(deal.estimated_value)}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <TrendingUp className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">Health Score</p>
                    <p className="font-semibold">{deal.health_score !== null ? `${deal.health_score}%` : '-'}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Flag className={`h-5 w-5 mt-0.5 ${priorityColors[deal.priority]}`} />
                  <div>
                    <p className="text-sm text-muted-foreground">Priority</p>
                    <p className="font-semibold capitalize">{deal.priority}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">Close Date</p>
                    <p className="font-semibold">{formatDate(deal.close_date)}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Next Steps</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-start gap-3">
                <Clock className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm text-muted-foreground">Due: {formatDate(deal.next_step_date)}</p>
                  <p className="mt-1">{deal.next_step_description || 'No next step defined'}</p>
                </div>
              </div>
              {deal.compelling_event_date && (
                <div className="flex items-start gap-3 mt-4 pt-4 border-t">
                  <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">Compelling Event</p>
                    <p className="font-semibold">{formatDate(deal.compelling_event_date)}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Activity Timeline */}
          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
              <CardDescription>Recent activity for this deal</CardDescription>
            </CardHeader>
            <CardContent>
              {/* Add Note Form */}
              <form onSubmit={handleAddNote} className="flex gap-2 mb-6">
                <div className="flex-1 relative">
                  <MessageSquare className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Add a note..."
                    value={noteContent}
                    onChange={(e) => setNoteContent(e.target.value)}
                    className="pl-10"
                    disabled={addingNote}
                  />
                </div>
                <Button type="submit" disabled={addingNote || !noteContent.trim()}>
                  {addingNote ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </form>

              {activities.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">No activity yet</p>
              ) : (
                <div className="space-y-4">
                  {activities.map((activity) => (
                    <div key={activity.id} className="flex items-start gap-3 pb-4 border-b last:border-0">
                      <div className="w-2 h-2 rounded-full bg-blue-500 mt-2" />
                      <div className="flex-1">
                        <p className="text-sm">{activity.description}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDate(activity.created_at)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Owner</p>
                <p className="font-medium">{deal.owner_name || 'Unknown'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Stage</p>
                <p className="font-medium">{stageLabels[deal.stage] || deal.stage}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Industry</p>
                <p className="font-medium">{deal.industry || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Created</p>
                <p className="font-medium">{formatDate(deal.created_at)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Last Updated</p>
                <p className="font-medium">{formatDate(deal.updated_at)}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
