import { useParams, useSearchParams } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { API_URL } from '@/lib/api';
import { type StakeholderSection } from '@/lib/sales-room-defaults';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Building2, Video, Calendar, MessageCircle, Check, Users, DollarSign, Lock, AlertCircle, ThumbsUp, ThumbsDown, Minus, BarChart3, X, Send, Download, FileText, Mail, Phone, User } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';

// Format currency
function formatCurrency(amount: number): string {
  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(1)}M`;
  }
  if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(0)}K`;
  }
  return `$${amount.toLocaleString()}`;
}

// ROI Calculator Component
function ROICalculator({ roiData }: { roiData: ROIData }) {
  return (
    <Card className="border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-white dark:from-blue-900/20 dark:to-slate-900">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-blue-700 dark:text-blue-400">
          <DollarSign className="h-6 w-6" />
          ROI Calculator - Based on Your Discovery Sessions
        </CardTitle>
        <CardDescription>
          Financial impact analysis extracted from your meeting transcripts
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Current Costs Section */}
        <div className="space-y-3">
          <h4 className="font-semibold text-lg flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-500" />
            Current Pain Points Identified
          </h4>
          <div className="space-y-2">
            {roiData.pains.map((pain, idx) => (
              <div key={idx} className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                <div className="flex justify-between items-start">
                  <p className="text-sm text-gray-700 dark:text-gray-300 flex-1 pr-4">
                    {pain.rawText.substring(0, 150)}...
                  </p>
                  <div className="text-right">
                    <p className="text-lg font-bold text-red-600 dark:text-red-400">
                      {formatCurrency(pain.yearlyValue)}/yr
                    </p>
                    <p className="text-sm text-gray-500">
                      ({formatCurrency(pain.monthlyValue)}/mo)
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Total Loss Summary */}
        <div className="grid md:grid-cols-2 gap-4">
          <div className="p-4 bg-red-100 dark:bg-red-900/30 rounded-lg text-center">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Identified Loss</p>
            <p className="text-3xl font-bold text-red-600 dark:text-red-400">
              {formatCurrency(roiData.totalYearlyLoss)}/year
            </p>
            <p className="text-sm text-gray-500">
              ({formatCurrency(roiData.totalMonthlyLoss)}/month)
            </p>
          </div>
          <div className="p-4 bg-green-100 dark:bg-green-900/30 rounded-lg text-center">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Estimated Savings Potential</p>
            <p className="text-3xl font-bold text-green-600 dark:text-green-400">
              {formatCurrency(roiData.estimatedYearlySavings)}/year
            </p>
            <p className="text-sm text-gray-500">
              (50% recovery assumption)
            </p>
          </div>
        </div>

        {/* 3-Year Projection */}
        <div className="p-4 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
          <h4 className="font-semibold mb-3 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-blue-600" />
            3-Year ROI Projection
          </h4>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span>Year 1 (Investment + 20% gains)</span>
              <span className="font-semibold text-green-600">
                {formatCurrency(roiData.estimatedYearlySavings * 0.2)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span>Year 2 (Break-even + 50% gains)</span>
              <span className="font-semibold text-green-600">
                {formatCurrency(roiData.estimatedYearlySavings * 0.5)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span>Year 3 (Full optimization)</span>
              <span className="font-semibold text-green-600">
                {formatCurrency(roiData.estimatedYearlySavings)}
              </span>
            </div>
            <hr className="my-2" />
            <div className="flex justify-between items-center text-lg font-bold">
              <span>Total 3-Year Savings</span>
              <span className="text-green-600">
                {formatCurrency(roiData.threeYearSavings)}
              </span>
            </div>
          </div>
        </div>

        {/* ROI Badge */}
        {roiData.roiPercentage > 0 && (
          <div className="text-center p-4 bg-gradient-to-r from-green-500 to-blue-500 rounded-lg text-white">
            <p className="text-sm opacity-90 mb-1">Estimated Return on Investment</p>
            <p className="text-4xl font-bold">{roiData.roiPercentage}%</p>
            <p className="text-sm opacity-90">within 3 years</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Dynamic Stakeholder Section Component
function DynamicSection({
  section,
  roiData
}: {
  section: StakeholderSection;
  roiData?: ROIData | null;
}) {
  // Render markdown-like content with basic formatting
  const renderContent = (text: string) => {
    return text.split('\n').map((line, i) => {
      if (line.startsWith('**') && line.endsWith('**')) {
        return <h4 key={i} className="font-semibold text-lg mt-4 mb-2">{line.slice(2, -2)}</h4>;
      }
      if (line.startsWith('• ') || line.startsWith('- ')) {
        const bulletText = line.slice(2);
        const parts = bulletText.split(/(\*\*[^*]+\*\*)/g);
        return (
          <li key={i} className="ml-4 mb-1">
            {parts.map((part, j) =>
              part.startsWith('**') && part.endsWith('**')
                ? <strong key={j}>{part.slice(2, -2)}</strong>
                : part
            )}
          </li>
        );
      }
      if (line.trim() === '') {
        return <div key={i} className="h-2" />;
      }
      const parts = line.split(/(\*\*[^*]+\*\*)/g);
      return (
        <p key={i} className="mb-2">
          {parts.map((part, j) =>
            part.startsWith('**') && part.endsWith('**')
              ? <strong key={j}>{part.slice(2, -2)}</strong>
              : part
          )}
        </p>
      );
    });
  };

  const isCfoLike = section.key === 'cfo' || section.key.includes('finance') || section.key.includes('cfo');

  return (
    <div className="space-y-6">
      {/* Show ROI Calculator for CFO-like section if financial data exists */}
      {isCfoLike && roiData && roiData.hasFinancialData && (
        <ROICalculator roiData={roiData} />
      )}

      <Card>
        <CardHeader>
          <CardTitle>{section.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="prose dark:prose-invert max-w-none">
            {renderContent(section.content)}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface FinancialPain {
  rawText: string;
  amount: number;
  period: string;
  monthlyValue: number;
  yearlyValue: number;
}

interface ROIData {
  pains: FinancialPain[];
  totalMonthlyLoss: number;
  totalYearlyLoss: number;
  estimatedMonthlySavings: number;
  estimatedYearlySavings: number;
  threeYearSavings: number;
  roiPercentage: number;
  hasFinancialData: boolean;
}

interface SalesRoom {
  id: string;
  deal_id: string;
  deal_company: string;
  template_type: string;
  public_url_slug: string;
  offer_content: string | null;
  sections: StakeholderSection[] | null;
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
  roiData: ROIData | null;
  // Creator contact
  creator_name: string | null;
  creator_email: string | null;
  creator_phone: string | null;
  creator_job_title: string | null;
  creator_avatar_url: string | null;
  // Attachment
  attachment_filename: string | null;
  attachment_url: string | null;
  attachment_mimetype: string | null;
  attachment_size: number | null;
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
  const [pollResponse, setPollResponse] = useState<string | null>(null);
  const [pollFeedback, setPollFeedback] = useState('');
  const [pollSubmitted, setPollSubmitted] = useState(false);
  const [pollSubmitting, setPollSubmitting] = useState(false);
  const [pollResults, setPollResults] = useState<{
    question: string;
    total: number;
    results: {
      yes: { count: number; percentage: number };
      partially: { count: number; percentage: number };
      no: { count: number; percentage: number };
    };
  } | null>(null);

  // Chatbot state
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages]);

  const sendChatMessage = async () => {
    if (!chatInput.trim() || chatLoading || !slug) return;

    const userMessage = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setChatLoading(true);

    try {
      const response = await fetch(`${API_URL}/sales-rooms/public/${slug}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage }),
      });

      const data = await response.json();
      if (response.ok) {
        setChatMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
      } else {
        setChatMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' }]);
      }
    } catch {
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I could not connect to the server. Please try again.' }]);
    } finally {
      setChatLoading(false);
    }
  };

  const fetchSalesRoom = async (pwd?: string) => {
    try {
      setLoading(true);
      setError(null);
      setPasswordError(null);

      let url = `${API_URL}/sales-rooms/public/${slug}`;
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
      await fetch(`${API_URL}/sales-rooms/public/${slug}/track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section, role: role || undefined, time_spent_seconds: 0 })
      });
    } catch (err) {
      console.error('Failed to track section view:', err);
    }
  };

  useEffect(() => {
    if (salesRoom && activeSection !== 'overview') {
      trackSectionView(activeSection);
    }
  }, [activeSection, salesRoom]);

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchSalesRoom(password);
  };

  const fetchPollResults = async () => {
    if (!slug) return;
    try {
      const response = await fetch(`${API_URL}/sales-rooms/public/${slug}/poll/results`);
      if (response.ok) {
        const data = await response.json();
        setPollResults(data);
      }
    } catch (err) {
      console.error('Failed to fetch poll results:', err);
    }
  };

  const handlePollSubmit = async () => {
    if (!slug || !pollResponse) return;

    setPollSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/sales-rooms/public/${slug}/poll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          response: pollResponse,
          feedback: pollFeedback || undefined,
          role: role || undefined
        })
      });

      if (response.ok) {
        setPollSubmitted(true);
        await fetchPollResults();
        trackSectionView('poll');
      }
    } catch (err) {
      console.error('Failed to submit poll response:', err);
    } finally {
      setPollSubmitting(false);
    }
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
  const sections = salesRoom.sections || [];

  // Build dynamic tab list: Overview + dynamic stakeholder sections
  const tabs = [
    { key: 'overview', label: 'Overview' },
    ...sections.map(s => ({ key: s.key, label: `For ${s.label}` })),
  ];

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
              <a href={salesRoom.video_url} target="_blank" rel="noopener noreferrer">
                <Button variant="secondary" className="gap-2">
                  <Video className="h-4 w-4" />
                  Watch Video Message
                </Button>
              </a>
            )}
          </div>
        </div>

        {/* Navigation Tabs - Dynamic */}
        <div className="max-w-6xl mx-auto px-4">
          <nav className="flex overflow-x-auto gap-1 pb-px">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveSection(tab.key)}
                className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  activeSection === tab.key
                    ? 'border-blue-500 text-white'
                    : 'border-transparent text-slate-400 hover:text-white hover:border-slate-600'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        {activeSection === 'overview' && (
          <div className="space-y-8">
            {/* Creator Contact Card */}
            {salesRoom.creator_name && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5" />
                    Your Contact
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4">
                    {salesRoom.creator_avatar_url ? (
                      <img src={salesRoom.creator_avatar_url} alt={salesRoom.creator_name} className="h-14 w-14 rounded-full object-cover" />
                    ) : (
                      <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xl">
                        {salesRoom.creator_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1">
                      <p className="font-semibold text-lg">{salesRoom.creator_name}</p>
                      {salesRoom.creator_job_title && (
                        <p className="text-sm text-muted-foreground">{salesRoom.creator_job_title}</p>
                      )}
                      <div className="flex flex-wrap gap-3 mt-2">
                        {salesRoom.creator_email && (
                          <a href={`mailto:${salesRoom.creator_email}`} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                            <Mail className="h-4 w-4" />
                            {salesRoom.creator_email}
                          </a>
                        )}
                        {salesRoom.creator_phone && (
                          <a href={`tel:${salesRoom.creator_phone}`} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                            <Phone className="h-4 w-4" />
                            {salesRoom.creator_phone}
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Video Message */}
            {salesRoom.video_url && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Video className="h-5 w-5" />
                    Video Message
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {(() => {
                    const getLoomEmbedUrl = (url: string) => {
                      const loomMatch = url.match(/loom\.com\/share\/([a-zA-Z0-9]+)/);
                      if (loomMatch) {
                        return `https://www.loom.com/embed/${loomMatch[1]}`;
                      }
                      const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
                      if (ytMatch) {
                        return `https://www.youtube.com/embed/${ytMatch[1]}`;
                      }
                      return url;
                    };
                    const embedUrl = getLoomEmbedUrl(salesRoom.video_url);
                    const isEmbeddable = embedUrl.includes('embed');

                    return isEmbeddable ? (
                      <div className="aspect-video rounded-lg overflow-hidden">
                        <iframe
                          src={embedUrl}
                          frameBorder="0"
                          allowFullScreen
                          className="w-full h-full"
                          title="Video Message"
                        />
                      </div>
                    ) : (
                      <a href={salesRoom.video_url} target="_blank" rel="noopener noreferrer" className="block">
                        <div className="aspect-video bg-slate-800 rounded-lg flex items-center justify-center hover:bg-slate-700 transition-colors">
                          <div className="text-center">
                            <Video className="h-12 w-12 mx-auto mb-2 text-blue-500" />
                            <p className="text-white font-medium">Click to watch video</p>
                          </div>
                        </div>
                      </a>
                    );
                  })()}
                </CardContent>
              </Card>
            )}

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

            {/* Offer Document Download */}
            {salesRoom.attachment_filename && salesRoom.attachment_url && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Offer Document
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
                    <div className="flex items-center gap-3">
                      <FileText className="h-8 w-8 text-blue-500" />
                      <div>
                        <p className="font-medium">{salesRoom.attachment_filename}</p>
                        {salesRoom.attachment_size && (
                          <p className="text-sm text-muted-foreground">
                            {(salesRoom.attachment_size / 1024 / 1024).toFixed(1)} MB
                          </p>
                        )}
                      </div>
                    </div>
                    <a href={salesRoom.attachment_url} download={salesRoom.attachment_filename} target="_blank" rel="noopener noreferrer">
                      <Button>
                        <Download className="h-4 w-4 mr-2" />
                        Download
                      </Button>
                    </a>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Quick Stats - Dynamic stakeholder sections */}
            {sections.length > 0 && (
              <div className={`grid gap-4 ${sections.length >= 4 ? 'md:grid-cols-4' : sections.length === 3 ? 'md:grid-cols-3' : sections.length === 2 ? 'md:grid-cols-2' : 'md:grid-cols-1'}`}>
                {sections.map((section) => (
                  <Card key={section.key} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setActiveSection(section.key)}>
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                          <Users className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">For {section.label}</p>
                          <p className="font-semibold truncate">{section.title}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Mutual Action Plan */}
            {salesRoom.mutual_action_plan && salesRoom.mutual_action_plan.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Mutual Action Plan</CardTitle>
                  <CardDescription>Track progress together - click your tasks to mark them complete</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {salesRoom.mutual_action_plan.map((item) => {
                      const isClientTask = item.owner === 'client';
                      const handleToggle = async () => {
                        if (!isClientTask || !slug) return;
                        try {
                          const response = await fetch(`${API_URL}/sales-rooms/public/${slug}/map/${item.id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ completed: !item.completed })
                          });
                          if (response.ok) {
                            setSalesRoom(prev => {
                              if (!prev || !prev.mutual_action_plan) return prev;
                              return {
                                ...prev,
                                mutual_action_plan: prev.mutual_action_plan.map(mapItem =>
                                  mapItem.id === item.id ? { ...mapItem, completed: !mapItem.completed } : mapItem
                                )
                              };
                            });
                          }
                        } catch (err) {
                          console.error('Failed to update MAP item:', err);
                        }
                      };
                      return (
                        <div
                          key={item.id}
                          className={`flex items-center gap-3 p-3 rounded-lg bg-muted/50 ${isClientTask ? 'cursor-pointer hover:bg-muted/70' : ''}`}
                          onClick={isClientTask ? handleToggle : undefined}
                        >
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                            item.completed ? 'bg-green-500 border-green-500' : 'border-muted-foreground'
                          } ${isClientTask ? 'hover:border-green-400' : ''}`}>
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
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Dynamic Section Content */}
        {activeSection !== 'overview' && (() => {
          const section = sections.find(s => s.key === activeSection);
          if (!section) return null;
          return (
            <DynamicSection
              section={section}
              roiData={salesRoom.roiData}
            />
          );
        })()}

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

        {/* Consensus Poll */}
        {salesRoom.poll_enabled && salesRoom.poll_question && (
          <Card className="mt-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Stakeholder Feedback
              </CardTitle>
              <CardDescription>Help us understand if this proposal addresses your concerns</CardDescription>
            </CardHeader>
            <CardContent>
              {!pollSubmitted ? (
                <div className="space-y-6">
                  <div>
                    <p className="text-lg font-medium mb-4">{salesRoom.poll_question}</p>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <Button
                        variant={pollResponse === 'yes' ? 'default' : 'outline'}
                        className={`flex-1 gap-2 ${pollResponse === 'yes' ? 'bg-green-600 hover:bg-green-700' : ''}`}
                        onClick={() => setPollResponse('yes')}
                      >
                        <ThumbsUp className="h-4 w-4" />
                        Yes, it does
                      </Button>
                      <Button
                        variant={pollResponse === 'partially' ? 'default' : 'outline'}
                        className={`flex-1 gap-2 ${pollResponse === 'partially' ? 'bg-yellow-600 hover:bg-yellow-700' : ''}`}
                        onClick={() => setPollResponse('partially')}
                      >
                        <Minus className="h-4 w-4" />
                        Partially
                      </Button>
                      <Button
                        variant={pollResponse === 'no' ? 'default' : 'outline'}
                        className={`flex-1 gap-2 ${pollResponse === 'no' ? 'bg-red-600 hover:bg-red-700' : ''}`}
                        onClick={() => setPollResponse('no')}
                      >
                        <ThumbsDown className="h-4 w-4" />
                        No, it doesn't
                      </Button>
                    </div>
                  </div>

                  {pollResponse && (
                    <div className="space-y-3">
                      <Label htmlFor="poll-feedback">Additional feedback (optional)</Label>
                      <Textarea
                        id="poll-feedback"
                        placeholder="Share any specific concerns or suggestions..."
                        value={pollFeedback}
                        onChange={(e) => setPollFeedback(e.target.value)}
                        rows={3}
                      />
                      <Button
                        onClick={handlePollSubmit}
                        disabled={pollSubmitting}
                        className="w-full sm:w-auto"
                      >
                        {pollSubmitting ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Submitting...
                          </>
                        ) : (
                          'Submit Feedback'
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg flex items-center gap-3">
                    <div className="p-2 bg-green-100 dark:bg-green-800 rounded-full">
                      <Check className="h-5 w-5 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <p className="font-medium text-green-800 dark:text-green-200">Thank you for your feedback!</p>
                      <p className="text-sm text-green-600 dark:text-green-400">Your response has been recorded.</p>
                    </div>
                  </div>

                  {pollResults && pollResults.total > 0 && (
                    <div className="space-y-4">
                      <p className="font-medium">Current Results ({pollResults.total} {pollResults.total === 1 ? 'response' : 'responses'})</p>
                      <div className="space-y-3">
                        <div className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="flex items-center gap-2">
                              <ThumbsUp className="h-4 w-4 text-green-600" />
                              Yes, it does
                            </span>
                            <span>{pollResults.results.yes.percentage}%</span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-green-500 transition-all duration-500"
                              style={{ width: `${pollResults.results.yes.percentage}%` }}
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="flex items-center gap-2">
                              <Minus className="h-4 w-4 text-yellow-600" />
                              Partially
                            </span>
                            <span>{pollResults.results.partially.percentage}%</span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-yellow-500 transition-all duration-500"
                              style={{ width: `${pollResults.results.partially.percentage}%` }}
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="flex items-center gap-2">
                              <ThumbsDown className="h-4 w-4 text-red-600" />
                              No, it doesn't
                            </span>
                            <span>{pollResults.results.no.percentage}%</span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-red-500 transition-all duration-500"
                              style={{ width: `${pollResults.results.no.percentage}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </main>

      {/* Chatbot Widget */}
      {salesRoom.chatbot_enabled && (
        <div className="fixed bottom-4 right-4 z-50">
          {chatOpen ? (
            <Card className="w-80 sm:w-96 shadow-2xl">
              <CardHeader className="bg-primary text-primary-foreground rounded-t-lg py-3 px-4 flex flex-row items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageCircle className="h-5 w-5" />
                  <CardTitle className="text-sm font-medium">Ask about our proposal</CardTitle>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-primary-foreground/10" onClick={() => setChatOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <div className="h-72 overflow-y-auto p-4 space-y-3 bg-muted/30">
                  {chatMessages.length === 0 && (
                    <div className="text-center text-muted-foreground text-sm py-8">
                      <MessageCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>Hi! I can help answer questions about this proposal.</p>
                      <p className="mt-1">Try asking about pricing, features, or timeline.</p>
                    </div>
                  )}
                  {chatMessages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                          msg.role === 'user'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-background border shadow-sm'
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      </div>
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="flex justify-start">
                      <div className="bg-background border rounded-lg px-3 py-2 shadow-sm">
                        <Loader2 className="h-4 w-4 animate-spin" />
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
                <div className="border-t p-3 flex gap-2">
                  <Input
                    placeholder="Type your question..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendChatMessage()}
                    disabled={chatLoading}
                    className="flex-1"
                  />
                  <Button size="icon" onClick={sendChatMessage} disabled={chatLoading || !chatInput.trim()}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Button
              size="lg"
              className="rounded-full h-14 w-14 shadow-lg"
              onClick={() => setChatOpen(true)}
            >
              <MessageCircle className="h-6 w-6" />
            </Button>
          )}
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
