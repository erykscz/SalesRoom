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
  MessageSquare,
  UserPlus,
  Target,
  AlertCircle,
  CheckCircle2,
  Users,
  FileText,
  Presentation
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
  has_decision_maker?: number;
  has_confirmed_budget?: number;
}

interface Activity {
  id: string;
  type: string;
  description: string;
  created_at: string;
}

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface AutopsyFinding {
  category: string;
  issue: string;
  detail: string;
}

interface AutopsyResult {
  deal: {
    company_name: string;
    industry: string | null;
    estimated_value: number | null;
    lost_reason: string | null;
    stage_duration: string;
  };
  analysis: {
    summary: string;
    risk_level: string;
    findings: AutopsyFinding[];
    suggestions: string[];
    reengagement_potential: {
      score: string;
      recommendation: string;
      suggested_date: string | null;
    };
  };
  generated_at: string;
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
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [deal, setDeal] = useState<Deal | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [noteContent, setNoteContent] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [transferring, setTransferring] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [runningAutopsy, setRunningAutopsy] = useState(false);
  const [autopsyResult, setAutopsyResult] = useState<AutopsyResult | null>(null);
  const [showAutopsyModal, setShowAutopsyModal] = useState(false);

  // Store the referrer URL (deals list with filters) from location state
  const backUrl = (location.state as { from?: string })?.from || '/deals';

  // Check if current user can edit this deal
  // Admin can edit all, owner can edit their own, manager cannot edit other's deals (coaching mode)
  const canEdit = user && deal && (
    user.role === 'admin' ||
    deal.owner_id === user.id
  );

  // Manager can view but not edit/delete other reps' deals (coaching read-only mode)
  const isCoachingMode = user && deal &&
    user.role === 'manager' &&
    deal.owner_id !== user.id;

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

  const fetchUsers = async () => {
    try {
      setLoadingUsers(true);
      const response = await fetch(`${API_URL}/users`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        // The API returns an array directly, not { users: [...] }
        const usersArray = Array.isArray(data) ? data : (data.users || []);
        // Filter out the current owner
        const filteredUsers = usersArray.filter((u: User) => u.id !== deal?.owner_id);
        setUsers(filteredUsers);
      }
    } catch (err) {
      console.error('Failed to fetch users:', err);
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleOpenTransferModal = () => {
    setShowTransferModal(true);
    fetchUsers();
  };

  const handleTransfer = async () => {
    if (!selectedUserId) {
      alert('Please select a user to transfer the deal to');
      return;
    }

    try {
      setTransferring(true);
      const response = await fetch(`${API_URL}/deals/${id}/transfer`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ newOwnerId: selectedUserId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to transfer deal');
      }

      const data = await response.json();
      alert(data.message || 'Deal transferred successfully');

      // Refresh the page to show updated owner
      window.location.reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to transfer deal');
    } finally {
      setTransferring(false);
      setShowTransferModal(false);
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

  const handleRunAutopsy = async () => {
    if (!deal || deal.stage !== 'closed_lost') return;

    try {
      setRunningAutopsy(true);
      const response = await fetch(`${API_URL}/deals/${id}/autopsy`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to run autopsy');
      }

      const data = await response.json();
      setAutopsyResult(data);
      setShowAutopsyModal(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to run autopsy analysis');
    } finally {
      setRunningAutopsy(false);
    }
  };

  const handleToggleHealthAttribute = async (attribute: 'has_decision_maker' | 'has_confirmed_budget', value: boolean) => {
    if (!deal) return;

    try {
      const response = await fetch(`${API_URL}/deals/${id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ [attribute]: value }),
      });

      if (!response.ok) {
        throw new Error('Failed to update deal');
      }

      const data = await response.json();
      setDeal(data.deal);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update health attribute');
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

  const getHealthScoreColor = (score: number | null) => {
    if (score === null) return 'text-gray-400';
    if (score >= 70) return 'text-green-500';
    if (score >= 40) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getHealthScoreBg = (score: number | null) => {
    if (score === null) return 'bg-gray-500/10';
    if (score >= 70) return 'bg-green-500/10';
    if (score >= 40) return 'bg-yellow-500/10';
    return 'bg-red-500/10';
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
          {/* Coaching Mode Banner */}
          {isCoachingMode && (
            <span className="text-sm text-muted-foreground bg-muted px-3 py-1 rounded-full">
              Coaching Mode (Read-only)
            </span>
          )}
          <Button variant="outline" onClick={handleOpenTransferModal}>
            <UserPlus className="w-4 h-4 mr-2" />
            Transfer Deal
          </Button>
          {canEdit ? (
            <>
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
            </>
          ) : (
            <>
              <Button variant="outline" disabled title="Only the deal owner can edit">
                <Edit className="w-4 h-4 mr-2" />
                Edit
              </Button>
              <Button variant="outline" disabled title="Only the deal owner can delete">
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </Button>
            </>
          )}
        </div>
      </div>

      {/* 3-Column Layout - The Cockpit */}
      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr_300px] gap-6">
        {/* Left Column - Deal Metadata & Quick Actions (300px) */}
        <div className="space-y-6">
          {/* Deal Metadata Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Deal Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Owner</p>
                <p className="font-medium">{deal.owner_name || 'Unknown'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Stage</p>
                <p className="font-medium">{stageLabels[deal.stage] || deal.stage}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Industry</p>
                <p className="font-medium">{deal.industry || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Estimated Value</p>
                <p className="font-medium text-lg">{formatCurrency(deal.estimated_value)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Priority</p>
                <p className={`font-medium capitalize ${priorityColors[deal.priority]}`}>{deal.priority}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Close Date</p>
                <p className="font-medium">{formatDate(deal.close_date)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Created</p>
                <p className="font-medium">{formatDate(deal.created_at)}</p>
              </div>
            </CardContent>
          </Card>

          {/* Health Score Widget */}
          <Card className={getHealthScoreBg(deal.health_score)}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Health Score
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center">
                <div className={`text-5xl font-bold ${getHealthScoreColor(deal.health_score)}`}>
                  {deal.health_score !== null ? `${deal.health_score}%` : '-'}
                </div>
              </div>
              <p className="text-center text-sm text-muted-foreground mt-2">
                {deal.health_score !== null ? (
                  deal.health_score >= 70 ? 'Healthy' :
                  deal.health_score >= 40 ? 'Needs Attention' : 'At Risk'
                ) : 'Not calculated'}
              </p>
              {/* Health Score Factors */}
              <div className="mt-4 pt-4 border-t space-y-2">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Score Factors</p>
                <div className="flex items-center justify-between">
                  <span className="text-sm flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Decision Maker
                  </span>
                  <Button
                    variant={deal.has_decision_maker ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleToggleHealthAttribute('has_decision_maker', !deal.has_decision_maker)}
                    className="text-xs"
                  >
                    {deal.has_decision_maker ? '+10 pts' : 'Not Set'}
                  </Button>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    Confirmed Budget
                  </span>
                  <Button
                    variant={deal.has_confirmed_budget ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleToggleHealthAttribute('has_confirmed_budget', !deal.has_confirmed_budget)}
                    className="text-xs"
                  >
                    {deal.has_confirmed_budget ? '+20 pts' : 'Not Set'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link to={`/discovery?deal=${id}`} className="block">
                <Button variant="outline" className="w-full justify-start">
                  <FileText className="w-4 h-4 mr-2" />
                  Upload Transcript
                </Button>
              </Link>
              <Link to={`/sales-rooms/create?deal=${id}`} className="block">
                <Button variant="outline" className="w-full justify-start">
                  <Presentation className="w-4 h-4 mr-2" />
                  Create Sales Room
                </Button>
              </Link>
              <Link to={`/battlecards?deal=${id}`} className="block">
                <Button variant="outline" className="w-full justify-start">
                  <Target className="w-4 h-4 mr-2" />
                  Prep Battlecard
                </Button>
              </Link>
              {deal.stage === 'closed_lost' && (
                <Button
                  variant="outline"
                  className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50"
                  onClick={handleRunAutopsy}
                  disabled={runningAutopsy}
                >
                  {runningAutopsy ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <AlertCircle className="w-4 h-4 mr-2" />
                  )}
                  {runningAutopsy ? 'Analyzing...' : 'Run Autopsy'}
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Center Column - Activity Feed Timeline (flexible) */}
        <div className="space-y-6">
          {/* Next Steps Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Next Steps
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-start gap-3">
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
          <Card className="flex-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Activity Feed</CardTitle>
              <CardDescription>Chronological log of all actions</CardDescription>
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
                <div className="space-y-4 max-h-[500px] overflow-y-auto">
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

        {/* Right Column - Proces Intelligence Panel (300px) */}
        <div className="space-y-6">
          {/* Pain Points */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-500" />
                Pain Points
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground italic">
                Upload a transcript to extract pain points automatically
              </p>
            </CardContent>
          </Card>

          {/* Power (Stakeholders) */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-500" />
                Stakeholders
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground italic">
                Upload a transcript to identify stakeholders
              </p>
            </CardContent>
          </Card>

          {/* Risk (Red Flags) */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
                Red Flags
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground italic">
                Upload a transcript to detect red flags
              </p>
            </CardContent>
          </Card>

          {/* Next Step Summary */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                Action Items
              </CardTitle>
            </CardHeader>
            <CardContent>
              {deal.next_step_description ? (
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 mt-2" />
                    <p className="text-sm">{deal.next_step_description}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  No action items defined
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Transfer Deal Modal */}
      {showTransferModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle>Transfer Deal</CardTitle>
              <CardDescription>
                Transfer "{deal.company_name}" to another sales rep
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {loadingUsers ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : users.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">
                  No other users available for transfer
                </p>
              ) : (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Select New Owner</label>
                  <select
                    className="w-full p-2 border rounded-md bg-background"
                    value={selectedUserId}
                    onChange={(e) => setSelectedUserId(e.target.value)}
                  >
                    <option value="">-- Select a user --</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name} ({user.email}) - {user.role}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowTransferModal(false);
                    setSelectedUserId('');
                  }}
                  disabled={transferring}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleTransfer}
                  disabled={transferring || !selectedUserId}
                >
                  {transferring ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Transferring...
                    </>
                  ) : (
                    'Transfer'
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Autopsy Results Modal */}
      {showAutopsyModal && autopsyResult && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <CardHeader className="border-b">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-red-600">
                    <AlertCircle className="h-5 w-5" />
                    Deal Autopsy Analysis
                  </CardTitle>
                  <CardDescription className="mt-1">
                    AI-generated analysis for {autopsyResult.deal.company_name}
                  </CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAutopsyModal(false)}
                >
                  ×
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              {/* Summary */}
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm">{autopsyResult.analysis.summary}</p>
              </div>

              {/* Deal Info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Value</p>
                  <p className="font-semibold">{formatCurrency(autopsyResult.deal.estimated_value)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Duration</p>
                  <p className="font-semibold">{autopsyResult.deal.stage_duration}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Lost Reason</p>
                  <p className="font-semibold">{autopsyResult.deal.lost_reason || 'Not specified'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Risk Level</p>
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                    autopsyResult.analysis.risk_level === 'high' ? 'bg-red-100 text-red-700' :
                    autopsyResult.analysis.risk_level === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-green-100 text-green-700'
                  }`}>
                    {autopsyResult.analysis.risk_level.toUpperCase()}
                  </span>
                </div>
              </div>

              {/* Findings */}
              <div>
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-500" />
                  Key Findings
                </h4>
                <div className="space-y-3">
                  {autopsyResult.analysis.findings.map((finding, index) => (
                    <div key={index} className="p-3 border rounded-lg">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium px-2 py-0.5 bg-slate-100 rounded">
                          {finding.category}
                        </span>
                        <span className="font-medium text-sm">{finding.issue}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">{finding.detail}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Suggestions */}
              <div>
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  Recommended Actions
                </h4>
                <ul className="space-y-2">
                  {autopsyResult.analysis.suggestions.map((suggestion, index) => (
                    <li key={index} className="flex items-start gap-2 text-sm">
                      <span className="text-green-500 mt-0.5">•</span>
                      <span>{suggestion}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Re-engagement Potential */}
              <div className="p-4 border rounded-lg bg-blue-50">
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-blue-600" />
                  Re-engagement Potential
                </h4>
                <div className="flex items-center gap-4 mb-2">
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                    autopsyResult.analysis.reengagement_potential.score === 'high' ? 'bg-green-100 text-green-700' :
                    autopsyResult.analysis.reengagement_potential.score === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {autopsyResult.analysis.reengagement_potential.score.toUpperCase()} POTENTIAL
                  </span>
                  {autopsyResult.analysis.reengagement_potential.suggested_date && (
                    <span className="text-sm text-muted-foreground">
                      Suggested follow-up: {formatDate(autopsyResult.analysis.reengagement_potential.suggested_date)}
                    </span>
                  )}
                </div>
                <p className="text-sm">{autopsyResult.analysis.reengagement_potential.recommendation}</p>
              </div>

              <div className="flex justify-end pt-4 border-t">
                <Button onClick={() => setShowAutopsyModal(false)}>
                  Close
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
