import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, ExternalLink, Eye, Clock, Users, BarChart3, Copy, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface SalesRoom {
  id: string;
  deal_id: string;
  deal_company: string;
  template_type: string;
  public_url_slug: string;
  offer_content: string | null;
  chatbot_enabled: boolean;
  video_url: string | null;
  calendly_link: string | null;
  is_expired: boolean;
  password_protected: boolean;
  created_at: string;
  created_by_name: string;
}

interface AnalyticsEntry {
  id: string;
  visitor_role: string | null;
  section_viewed: string;
  time_spent_seconds: number;
  visited_at: string;
}

interface AnalyticsStats {
  totalViews: number;
  uniqueRoles: string[];
  sectionViews: Record<string, number>;
  totalTimeSpent: number;
}

export default function SalesRoomDetailPage() {
  const { id } = useParams();
  const { toast } = useToast();
  const [salesRoom, setSalesRoom] = useState<SalesRoom | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsEntry[]>([]);
  const [stats, setStats] = useState<AnalyticsStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchSalesRoom = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem('token');

        // Fetch sales room details
        const response = await fetch(`/api/sales-rooms/${id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
          throw new Error('Failed to fetch Sales Room');
        }

        const data = await response.json();
        setSalesRoom(data.salesRoom);
        setAnalytics(data.analytics || []);

        // Fetch analytics stats
        const analyticsResponse = await fetch(`/api/sales-rooms/${id}/analytics`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (analyticsResponse.ok) {
          const analyticsData = await analyticsResponse.json();
          setStats(analyticsData.stats);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchSalesRoom();
  }, [id]);

  const copyPublicUrl = () => {
    if (salesRoom) {
      const publicUrl = `${window.location.origin}/room/${salesRoom.public_url_slug}`;
      navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      toast({ title: 'Link copied!', description: 'Public URL copied to clipboard' });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !salesRoom) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-red-500">{error || 'Sales Room not found'}</p>
          <Link to="/sales-rooms">
            <Button variant="outline" className="mt-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Sales Rooms
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  const publicUrl = `/room/${salesRoom.public_url_slug}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/sales-rooms">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{salesRoom.deal_company}</h1>
            <p className="text-muted-foreground capitalize">
              {salesRoom.template_type.replace(/_/g, ' ')} • Created by {salesRoom.created_by_name}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={copyPublicUrl}>
            {copied ? <CheckCircle2 className="h-4 w-4 mr-2 text-green-500" /> : <Copy className="h-4 w-4 mr-2" />}
            {copied ? 'Copied!' : 'Copy Link'}
          </Button>
          <a href={publicUrl} target="_blank" rel="noopener noreferrer">
            <Button>
              <ExternalLink className="h-4 w-4 mr-2" />
              Open Public Room
            </Button>
          </a>
        </div>
      </div>

      {/* Analytics Overview */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Eye className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Views</p>
                <p className="text-2xl font-bold">{stats?.totalViews || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Users className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Unique Roles</p>
                <p className="text-2xl font-bold">{stats?.uniqueRoles?.length || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <BarChart3 className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Sections Viewed</p>
                <p className="text-2xl font-bold">{Object.keys(stats?.sectionViews || {}).length}</p>
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
                <p className="text-sm text-muted-foreground">Time Spent</p>
                <p className="text-2xl font-bold">{Math.round((stats?.totalTimeSpent || 0) / 60)}m</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Section Views Breakdown */}
      {stats && Object.keys(stats.sectionViews).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Section Views</CardTitle>
            <CardDescription>Which sections your clients viewed</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(stats.sectionViews).map(([section, count]) => (
                <div key={section} className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="flex justify-between mb-1">
                      <span className="capitalize font-medium">
                        {section === 'cfo' ? 'For CFO' :
                         section === 'cto' ? 'For CTO' :
                         section === 'security' ? 'For Security' :
                         section === 'engineering' ? 'For Engineering' :
                         section}
                      </span>
                      <span className="text-muted-foreground">{count} views</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div
                        className="bg-primary rounded-full h-2"
                        style={{ width: `${(count / stats.totalViews) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Views */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Latest visits to your Sales Room</CardDescription>
        </CardHeader>
        <CardContent>
          {analytics.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No views yet. Share the public link to start tracking.
            </p>
          ) : (
            <div className="space-y-3">
              {analytics.slice(0, 20).map((entry) => (
                <div key={entry.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-muted rounded-full">
                      <Eye className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-medium capitalize">
                        {entry.section_viewed === 'cfo' ? 'CFO Section' :
                         entry.section_viewed === 'cto' ? 'CTO Section' :
                         entry.section_viewed === 'security' ? 'Security Section' :
                         entry.section_viewed === 'engineering' ? 'Engineering Section' :
                         entry.section_viewed}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {entry.visitor_role ? `Role: ${entry.visitor_role}` : 'Unknown visitor'}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {new Date(entry.visited_at).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
