import { useParams, useSearchParams } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Building2, Video, Calendar, MessageCircle, Check, Users, Shield, Code, DollarSign, Lock, AlertCircle } from 'lucide-react';

interface SalesRoom {
  id: string;
  deal_id: string;
  deal_company: string;
  template_type: string;
  public_url_slug: string;
  offer_content: string | null;
  sections: {
    cfo?: { title: string; content: string };
    cto?: { title: string; content: string };
    security?: { title: string; content: string };
    engineering?: { title: string; content: string };
  } | null;
  chatbot_enabled: boolean;
  video_url: string | null;
  calendly_link: string | null;
  branding: {
    logo_url?: string;
    primary_color?: string;
    company_name?: string;
  } | null;
  mutual_action_plan: Array<{
    id: string;
    task: string;
    owner: 'client' | 'us';
    completed: boolean;
  }> | null;
  poll_enabled: boolean;
  poll_question: string | null;
  is_expired: boolean;
  password_protected: boolean;
}

export default function SalesRoomPublicPage() {
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  const role = searchParams.get('role');

  const [salesRoom, setSalesRoom] = useState<SalesRoom | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState('overview');

  const fetchSalesRoom = async (pwd?: string) => {
    try {
      setLoading(true);
      setError(null);
      setPasswordError(null);

      let url = `/api/sales-rooms/public/${slug}`;
      const params = new URLSearchParams();
      if (role) params.append('role', role);
      if (pwd) params.append('password', pwd);
      if (params.toString()) url += `?${params.toString()}`;

      const response = await fetch(url);
      const data = await response.json();

      if (response.status === 401 && data.passwordRequired) {
        setPasswordRequired(true);
        setLoading(false);
        return;
      }

      if (response.status === 401) {
        setPasswordError('Invalid password');
        setLoading(false);
        return;
      }

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load Sales Room');
      }

      setSalesRoom(data.salesRoom);
      setPasswordRequired(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSalesRoom();
  }, [slug, role]);

  // Track section view when activeSection changes
  const trackSectionView = async (section: string) => {
    if (!slug) return;
    try {
      await fetch(`/api/sales-rooms/public/${slug}/track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section, role: role || undefined, time_spent_seconds: 0 })
      });
    } catch (err) {
      console.error('Failed to track section view:', err);
    }
  };

  useEffect(() => {
    // Track section view when section changes (after initial load)
    if (salesRoom && activeSection !== 'overview') {
      trackSectionView(activeSection);
    }
  }, [activeSection, salesRoom]);

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchSalesRoom(password);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="mt-4 text-muted-foreground">Loading Sales Room...</p>
        </div>
      </div>
    );
  }

  if (passwordRequired) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <Lock className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>Password Protected</CardTitle>
            <CardDescription>This Sales Room requires a password to access.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                />
                {passwordError && (
                  <p className="text-sm text-red-500">{passwordError}</p>
                )}
              </div>
              <Button type="submit" className="w-full">
                Access Sales Room
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <AlertCircle className="h-6 w-6 text-red-500" />
            </div>
            <CardTitle>Unable to Load Sales Room</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!salesRoom) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">Sales Room not found</p>
        </div>
      </div>
    );
  }

  const branding = salesRoom.branding || {};
  const primaryColor = branding.primary_color || '#2563eb';

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <header className="bg-gradient-to-r from-slate-900 to-slate-800 text-white">
        <div className="max-w-6xl mx-auto px-4 py-8 md:py-12">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              {branding.logo_url ? (
                <img src={branding.logo_url} alt="Logo" className="h-16 w-16 object-contain rounded-lg bg-white p-2" />
              ) : (
                <div className="h-16 w-16 bg-blue-600 rounded-lg flex items-center justify-center">
                  <Building2 className="h-8 w-8 text-white" />
                </div>
              )}
              <div>
                <h1 className="text-2xl md:text-3xl font-bold">
                  {branding.company_name || salesRoom.deal_company}
                </h1>
                <p className="text-slate-300 capitalize">
                  {salesRoom.template_type.replace(/_/g, ' ')} Proposal
                </p>
              </div>
            </div>
            {salesRoom.video_url && (
              <Button variant="secondary" className="gap-2">
                <Video className="h-4 w-4" />
                Watch Video Message
              </Button>
            )}
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="max-w-6xl mx-auto px-4">
          <nav className="flex overflow-x-auto gap-1 pb-px">
            {['overview', 'cfo', 'cto', 'security', 'engineering'].map((section) => (
              <button
                key={section}
                onClick={() => setActiveSection(section)}
                className={`px-4 py-3 text-sm font-medium capitalize whitespace-nowrap border-b-2 transition-colors ${
                  activeSection === section
                    ? 'border-blue-500 text-white'
                    : 'border-transparent text-slate-400 hover:text-white hover:border-slate-600'
                }`}
              >
                {section === 'cfo' ? 'For CFO' :
                 section === 'cto' ? 'For CTO' :
                 section === 'security' ? 'For Security' :
                 section === 'engineering' ? 'For Engineering' :
                 'Overview'}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        {activeSection === 'overview' && (
          <div className="space-y-8">
            {/* Offer Content */}
            {salesRoom.offer_content && (
              <Card>
                <CardHeader>
                  <CardTitle>Our Proposal</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="prose dark:prose-invert max-w-none">
                    {salesRoom.offer_content.split('\n').map((paragraph, i) => (
                      <p key={i}>{paragraph}</p>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Quick Stats */}
            <div className="grid md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <DollarSign className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">For CFO</p>
                      <p className="font-semibold">ROI Analysis</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <Code className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">For CTO</p>
                      <p className="font-semibold">Technical Specs</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-100 rounded-lg">
                      <Shield className="h-5 w-5 text-purple-600" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">For Security</p>
                      <p className="font-semibold">Compliance</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-orange-100 rounded-lg">
                      <Users className="h-5 w-5 text-orange-600" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">For Engineering</p>
                      <p className="font-semibold">Dev Experience</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Mutual Action Plan */}
            {salesRoom.mutual_action_plan && salesRoom.mutual_action_plan.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Mutual Action Plan</CardTitle>
                  <CardDescription>Track progress together</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {salesRoom.mutual_action_plan.map((item) => (
                      <div key={item.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          item.completed ? 'bg-green-500 border-green-500' : 'border-muted-foreground'
                        }`}>
                          {item.completed && <Check className="h-3 w-3 text-white" />}
                        </div>
                        <span className={item.completed ? 'line-through text-muted-foreground' : ''}>
                          {item.task}
                        </span>
                        <span className={`ml-auto text-xs px-2 py-1 rounded ${
                          item.owner === 'client' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
                        }`}>
                          {item.owner === 'client' ? 'Your Task' : 'Our Task'}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Section Content */}
        {activeSection !== 'overview' && salesRoom.sections && salesRoom.sections[activeSection as keyof typeof salesRoom.sections] && (
          <Card>
            <CardHeader>
              <CardTitle>{salesRoom.sections[activeSection as keyof typeof salesRoom.sections]?.title || activeSection.toUpperCase()}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="prose dark:prose-invert max-w-none">
                {salesRoom.sections[activeSection as keyof typeof salesRoom.sections]?.content?.split('\n').map((paragraph, i) => (
                  <p key={i}>{paragraph}</p>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {activeSection !== 'overview' && (!salesRoom.sections || !salesRoom.sections[activeSection as keyof typeof salesRoom.sections]) && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <p>Content for this section is being prepared.</p>
            </CardContent>
          </Card>
        )}

        {/* Calendly Integration */}
        {salesRoom.calendly_link && (
          <Card className="mt-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Schedule a Meeting
              </CardTitle>
              <CardDescription>Book time with our team to discuss your needs</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full md:w-auto">
                <a href={salesRoom.calendly_link} target="_blank" rel="noopener noreferrer">
                  Open Calendar
                </a>
              </Button>
            </CardContent>
          </Card>
        )}
      </main>

      {/* Chatbot Widget */}
      {salesRoom.chatbot_enabled && (
        <div className="fixed bottom-4 right-4">
          <Button size="lg" className="rounded-full h-14 w-14 shadow-lg">
            <MessageCircle className="h-6 w-6" />
          </Button>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t mt-12">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <p className="text-center text-sm text-muted-foreground">
            Powered by Sales Room - Proces OS
          </p>
        </div>
      </footer>
    </div>
  );
}
