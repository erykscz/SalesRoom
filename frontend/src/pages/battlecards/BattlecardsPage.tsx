import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { API_URL } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  Search, Plus, Trash2, Edit, X, Check, Loader2, ThumbsUp, ThumbsDown,
  DollarSign, Cpu, Shield, Users, Clock, Layers, Lightbulb, AlertTriangle, Mail, Copy, Sparkles,
  Building2, User, TrendingUp, MessageSquare, RefreshCw, ChevronDown, ChevronUp
} from 'lucide-react';

interface ARCResponse {
  acknowledge: string;
  reframe: string;
  counter: string;
}

interface Battlecard {
  id: string;
  category: 'price' | 'technology' | 'trust' | 'competition' | 'timing' | 'features';
  objection_text: string;
  arc_response: ARCResponse | null;
  case_study_links: string[];
  is_shared: number;
  created_by: string;
  created_by_name: string;
  feedback_score: number;
  created_at: string;
  updated_at: string;
}

interface MeetingPrepBriefing {
  person: {
    name: string | null;
    job_title: string | null;
    email: string | null;
    phone: string | null;
    linkedin_url: string | null;
    headline: string | null;
    summary: string | null;
    skills: string[];
  };
  company: {
    name: string | null;
    industry: string | null;
    company_size: string | null;
    headquarters: string | null;
    description: string | null;
    company_url: string | null;
  };
  deal_status: {
    stage: string;
    health_score: number;
    estimated_value: number | null;
    priority: string;
    has_decision_maker: boolean;
    has_confirmed_budget: boolean;
    next_step_date: string | null;
    next_step_description: string | null;
    close_date: string | null;
    days_in_pipeline: number | null;
    owner_name: string | null;
  };
  discovery_insights: {
    pain_points: string[];
    red_flags: string[];
    stakeholders: string[];
  };
  activity_summary: {
    total_activities: number;
    notes_count: number;
    last_activity_date: string | null;
    transcript_count: number;
    has_sales_room: boolean;
  };
  research_summary: string | null;
}

interface AIPredictedObjection {
  category: string;
  objection: string;
  reason: string;
  suggested_response: string;
}

interface MeetingPrepData {
  briefing: MeetingPrepBriefing;
  predictions: AIPredictedObjection[];
  ai_model_used: string | null;
  ai_error: string | null;
}

const CATEGORIES = [
  { value: 'price', label: 'Price', icon: <DollarSign className="h-4 w-4" />, color: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' },
  { value: 'technology', label: 'Technology', icon: <Cpu className="h-4 w-4" />, color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' },
  { value: 'trust', label: 'Trust', icon: <Shield className="h-4 w-4" />, color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300' },
  { value: 'competition', label: 'Competition', icon: <Users className="h-4 w-4" />, color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300' },
  { value: 'timing', label: 'Timing', icon: <Clock className="h-4 w-4" />, color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300' },
  { value: 'features', label: 'Features', icon: <Layers className="h-4 w-4" />, color: 'bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300' },
];

const STAGE_LABELS: Record<string, string> = {
  new_signal: 'New Signal',
  qualified: 'Qualified',
  discovery: 'Discovery',
  solution_design: 'Solution Design',
  negotiation: 'Negotiation',
  closed_won: 'Closed Won',
  closed_lost: 'Closed Lost',
};

export default function BattlecardsPage() {
  const [searchParams] = useSearchParams();
  const dealId = searchParams.get('deal');

  const [battlecards, setBattlecards] = useState<Battlecard[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingItem, setEditingItem] = useState<Battlecard | null>(null);
  const [formData, setFormData] = useState({
    category: 'price',
    objection_text: '',
    acknowledge: '',
    reframe: '',
    counter: '',
    is_shared: true
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [meetingPrep, setMeetingPrep] = useState<MeetingPrepData | null>(null);
  const [loadingPrep, setLoadingPrep] = useState(false);
  const [prepError, setPrepError] = useState<string | null>(null);
  const [showFullSummary, setShowFullSummary] = useState(false);

  // Email mode state
  const [showEmailMode, setShowEmailMode] = useState(false);
  const [emailContent, setEmailContent] = useState('');
  const [emailResponse, setEmailResponse] = useState<{
    detectedCategory: string;
    acknowledgeText: string;
    reframeText: string;
    counterText: string;
    caseStudy: string;
    fullResponse: string;
  } | null>(null);
  const [generatingResponse, setGeneratingResponse] = useState(false);
  const [responseCopied, setResponseCopied] = useState(false);

  const { toast } = useToast();

  // Email response generator
  const generateEmailResponse = (email: string, cards: Battlecard[]) => {
    const emailLower = email.toLowerCase();

    // Detect category from email content
    let detectedCategory = 'price';
    let matchedCard: Battlecard | null = null;

    // Check for price objections
    if (emailLower.includes('expensive') || emailLower.includes('cost') || emailLower.includes('budget') ||
        emailLower.includes('pricing') || emailLower.includes('price') || emailLower.includes('afford')) {
      detectedCategory = 'price';
      matchedCard = cards.find(c => c.category === 'price') || null;
    }
    // Check for technology objections
    else if (emailLower.includes('technology') || emailLower.includes('technical') || emailLower.includes('integration') ||
             emailLower.includes('scalab') || emailLower.includes('stack') || emailLower.includes('legacy')) {
      detectedCategory = 'technology';
      matchedCard = cards.find(c => c.category === 'technology') || null;
    }
    // Check for trust objections
    else if (emailLower.includes('trust') || emailLower.includes('security') || emailLower.includes('reference') ||
             emailLower.includes('experience') || emailLower.includes('track record') || emailLower.includes('compliance')) {
      detectedCategory = 'trust';
      matchedCard = cards.find(c => c.category === 'trust') || null;
    }
    // Check for competition
    else if (emailLower.includes('competitor') || emailLower.includes('alternative') || emailLower.includes('other vendor') ||
             emailLower.includes('comparison')) {
      detectedCategory = 'competition';
      matchedCard = cards.find(c => c.category === 'competition') || null;
    }
    // Check for timing
    else if (emailLower.includes('timing') || emailLower.includes('delay') || emailLower.includes('postpone') ||
             emailLower.includes('not ready') || emailLower.includes('next quarter') || emailLower.includes('later')) {
      detectedCategory = 'timing';
      matchedCard = cards.find(c => c.category === 'timing') || null;
    }
    // Check for features
    else if (emailLower.includes('feature') || emailLower.includes('functionality') || emailLower.includes('capability') ||
             emailLower.includes('missing') || emailLower.includes('does it')) {
      detectedCategory = 'features';
      matchedCard = cards.find(c => c.category === 'features') || null;
    }

    // Generate response using ARC framework
    let acknowledgeText: string;
    let reframeText: string;
    let counterText: string;

    if (matchedCard && matchedCard.arc_response) {
      acknowledgeText = matchedCard.arc_response.acknowledge;
      reframeText = matchedCard.arc_response.reframe;
      counterText = matchedCard.arc_response.counter;
    } else {
      // Generate default responses based on category
      const defaultResponses: Record<string, { a: string; r: string; c: string }> = {
        price: {
          a: "Thank you for raising the budget consideration. I completely understand that pricing is a critical factor in your decision-making process.",
          r: "Rather than looking at this as just a cost, let's consider the total value proposition and return on investment.",
          c: "Our clients typically see a 3-4x return on their investment within the first year through efficiency gains and reduced operational overhead. I'd be happy to walk you through a detailed ROI analysis specific to your situation."
        },
        technology: {
          a: "I appreciate your diligence in evaluating the technical aspects. You're asking exactly the right questions.",
          r: "Let me address your technical concerns by focusing on how our architecture specifically supports your use case.",
          c: "Our platform is built on modern, scalable technology that integrates seamlessly with existing systems. We offer comprehensive API documentation and dedicated technical support during implementation."
        },
        trust: {
          a: "Building trust is fundamental to any partnership, and I appreciate your careful evaluation process.",
          r: "Let me share how we've earned the trust of similar organizations in your industry.",
          c: "We have helped over 200 companies similar to yours achieve their goals. I'd be happy to connect you with references who can speak to their experience working with us."
        },
        competition: {
          a: "I respect that you're doing your due diligence by evaluating multiple options.",
          r: "While I can't speak to what others offer, I can share what makes our approach unique.",
          c: "Our differentiation lies in our deep industry expertise and white-glove implementation support. We'd welcome a head-to-head comparison on the criteria that matter most to you."
        },
        timing: {
          a: "I understand that timing is crucial and you want to make sure this aligns with your strategic priorities.",
          r: "Let's discuss how we can structure an approach that works with your timeline.",
          c: "We can offer a phased implementation approach that lets you start realizing value quickly while spreading the effort over time. This also allows for learning and adjustment along the way."
        },
        features: {
          a: "Thank you for being specific about your requirements. Understanding your needs helps us serve you better.",
          r: "Let me show you how our current capabilities can address your use case, and discuss our product roadmap.",
          c: "We have a robust feature set that covers your core requirements. For the specific capability you mentioned, we have that planned for our next release, or we can discuss a custom solution."
        }
      };

      const response = defaultResponses[detectedCategory] || defaultResponses.price;
      acknowledgeText = response.a;
      reframeText = response.r;
      counterText = response.c;
    }

    // Generate case study reference
    const caseStudies: Record<string, string> = {
      price: "Case Study: How Acme Corp reduced their operational costs by 40% within 6 months of implementation, achieving full ROI in under a year.",
      technology: "Case Study: TechStart Inc. successfully integrated our platform with their legacy systems in just 3 weeks with zero downtime.",
      trust: "Case Study: FinanceSecure Ltd., a Fortune 500 company in your industry, has been a satisfied customer for over 3 years.",
      competition: "Case Study: GlobalCorp chose us over 5 competitors after a rigorous evaluation process, citing our superior customer success program.",
      timing: "Case Study: QuickLaunch Inc. went from contract signing to full deployment in 30 days with our accelerated onboarding program.",
      features: "Case Study: CustomSolutions Corp worked with our product team to build a feature that is now used by 100+ customers."
    };

    const caseStudy = caseStudies[detectedCategory] || caseStudies.price;

    // Compose full email response
    const fullResponse = `Hi,

Thank you for your email and for sharing your thoughts openly.

${acknowledgeText}

${reframeText}

${counterText}

${caseStudy}

Would you be available for a brief call this week to discuss this further? I'm confident we can find an approach that works for your organization.

Best regards`;

    return {
      detectedCategory,
      acknowledgeText,
      reframeText,
      counterText,
      caseStudy,
      fullResponse
    };
  };

  const handleGenerateResponse = () => {
    if (!emailContent.trim()) {
      toast({ title: 'Error', description: 'Please paste an email to analyze', variant: 'destructive' });
      return;
    }

    setGeneratingResponse(true);
    // Simulate processing time for better UX
    setTimeout(() => {
      const response = generateEmailResponse(emailContent, battlecards);
      setEmailResponse(response);
      setGeneratingResponse(false);
    }, 800);
  };

  const copyResponse = () => {
    if (emailResponse) {
      navigator.clipboard.writeText(emailResponse.fullResponse);
      setResponseCopied(true);
      toast({ title: 'Copied!', description: 'Response copied to clipboard' });
      setTimeout(() => setResponseCopied(false), 2000);
    }
  };

  // Generate meeting prep briefing + AI predictions
  const generateMeetingPrep = async () => {
    if (!dealId) return;

    try {
      setLoadingPrep(true);
      setPrepError(null);
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/battlecards/meeting-prep/${dealId}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) throw new Error('Failed to generate meeting prep');

      const data: MeetingPrepData = await response.json();
      setMeetingPrep(data);
    } catch (error: any) {
      console.error('Error generating meeting prep:', error);
      setPrepError(error.message || 'Failed to generate meeting prep');
    } finally {
      setLoadingPrep(false);
    }
  };

  useEffect(() => {
    if (dealId) generateMeetingPrep();
  }, [dealId]);

  const fetchBattlecards = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      if (searchQuery) params.append('search', searchQuery);
      if (selectedCategory) params.append('category', selectedCategory);

      const response = await fetch(`${API_URL}/battlecards?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) throw new Error('Failed to fetch battlecards');

      const data = await response.json();
      setBattlecards(data.battlecards || []);
    } catch (error) {
      console.error('Error fetching battlecards:', error);
      toast({
        title: 'Error',
        description: 'Failed to load battlecards',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBattlecards();
  }, [selectedCategory]);

  const handleSearch = () => {
    fetchBattlecards();
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.objection_text.trim()) {
      toast({ title: 'Error', description: 'Objection text is required', variant: 'destructive' });
      return;
    }

    if (!formData.acknowledge.trim() || !formData.reframe.trim() || !formData.counter.trim()) {
      toast({ title: 'Error', description: 'All ARC response fields are required', variant: 'destructive' });
      return;
    }

    try {
      setSaving(true);
      const token = localStorage.getItem('token');

      const response = await fetch(`${API_URL}/battlecards`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          category: formData.category,
          objection_text: formData.objection_text,
          arc_response: {
            acknowledge: formData.acknowledge,
            reframe: formData.reframe,
            counter: formData.counter
          },
          is_shared: formData.is_shared
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create battlecard');
      }

      toast({ title: 'Success', description: 'Battlecard created successfully' });
      setShowCreateForm(false);
      resetForm();
      fetchBattlecards();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to create battlecard', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;

    try {
      setSaving(true);
      const token = localStorage.getItem('token');

      const response = await fetch(`${API_URL}/battlecards/${editingItem.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          objection_text: formData.objection_text,
          arc_response: {
            acknowledge: formData.acknowledge,
            reframe: formData.reframe,
            counter: formData.counter
          },
          is_shared: formData.is_shared
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update battlecard');
      }

      toast({ title: 'Success', description: 'Battlecard updated successfully' });
      setEditingItem(null);
      resetForm();
      fetchBattlecards();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to update battlecard', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this battlecard?')) return;

    try {
      setDeleting(id);
      const token = localStorage.getItem('token');

      const response = await fetch(`${API_URL}/battlecards/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete battlecard');
      }

      toast({ title: 'Success', description: 'Battlecard deleted successfully' });
      fetchBattlecards();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to delete battlecard', variant: 'destructive' });
    } finally {
      setDeleting(null);
    }
  };

  const handleFeedback = async (id: string, vote: 'up' | 'down') => {
    try {
      const token = localStorage.getItem('token');

      const response = await fetch(`${API_URL}/battlecards/${id}/feedback`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ vote })
      });

      if (!response.ok) throw new Error('Failed to submit feedback');

      const data = await response.json();
      setBattlecards(prev => prev.map(bc =>
        bc.id === id ? { ...bc, feedback_score: data.feedback_score } : bc
      ));
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to submit feedback', variant: 'destructive' });
    }
  };

  const startEditing = (item: Battlecard) => {
    setEditingItem(item);
    setFormData({
      category: item.category,
      objection_text: item.objection_text,
      acknowledge: item.arc_response?.acknowledge || '',
      reframe: item.arc_response?.reframe || '',
      counter: item.arc_response?.counter || '',
      is_shared: item.is_shared === 1
    });
    setShowCreateForm(false);
  };

  const resetForm = () => {
    setFormData({
      category: 'price',
      objection_text: '',
      acknowledge: '',
      reframe: '',
      counter: '',
      is_shared: true
    });
  };

  const cancelForm = () => {
    setShowCreateForm(false);
    setEditingItem(null);
    resetForm();
  };

  const getCategoryInfo = (category: string) => {
    return CATEGORIES.find(c => c.value === category) || CATEGORIES[0];
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">Battlecards</h1>
          <p className="text-muted-foreground">Handle objections with the ARC framework</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={showEmailMode ? "default" : "outline"}
            onClick={() => { setShowEmailMode(!showEmailMode); setEmailResponse(null); setEmailContent(''); }}
          >
            <Mail className="h-4 w-4 mr-2" />
            Email Mode
          </Button>
          <Button onClick={() => { setShowCreateForm(true); setEditingItem(null); resetForm(); }}>
            <Plus className="h-4 w-4 mr-2" />
            Create Battlecard
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 flex gap-2">
              <Input
                placeholder="Search objections..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                className="flex-1"
              />
              <Button onClick={handleSearch} variant="secondary">
                <Search className="h-4 w-4" />
              </Button>
            </div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-2 rounded-md border bg-background"
            >
              <option value="">All Categories</option>
              {CATEGORIES.map(cat => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Email Mode */}
      {showEmailMode && (
        <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-800 dark:text-blue-200">
              <Mail className="h-5 w-5" />
              Email Response Generator
            </CardTitle>
            <CardDescription>
              Paste a client objection email and get a diplomatic response using the ARC framework
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Client Email / Objection</label>
              <Textarea
                value={emailContent}
                onChange={(e) => setEmailContent(e.target.value)}
                placeholder="Paste the client's email or objection here...

Example: 'Hi, we've reviewed your proposal but we're concerned about the pricing. It seems expensive compared to other solutions we've looked at. Can you help us understand the value better?'"
                rows={5}
              />
            </div>
            <Button
              onClick={handleGenerateResponse}
              disabled={generatingResponse || !emailContent.trim()}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {generatingResponse ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate Response
                </>
              )}
            </Button>

            {emailResponse && (
              <div className="space-y-4 pt-4 border-t border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getCategoryInfo(emailResponse.detectedCategory).color}`}>
                    {getCategoryInfo(emailResponse.detectedCategory).icon}
                    Detected: {getCategoryInfo(emailResponse.detectedCategory).label} Objection
                  </span>
                </div>

                <div className="space-y-3">
                  <div className="p-3 bg-background rounded-lg border-l-4 border-blue-500">
                    <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-1">ACKNOWLEDGE</p>
                    <p className="text-sm">{emailResponse.acknowledgeText}</p>
                  </div>
                  <div className="p-3 bg-background rounded-lg border-l-4 border-green-500">
                    <p className="text-xs font-semibold text-green-600 dark:text-green-400 mb-1">REFRAME</p>
                    <p className="text-sm">{emailResponse.reframeText}</p>
                  </div>
                  <div className="p-3 bg-background rounded-lg border-l-4 border-purple-500">
                    <p className="text-xs font-semibold text-purple-600 dark:text-purple-400 mb-1">COUNTER</p>
                    <p className="text-sm">{emailResponse.counterText}</p>
                  </div>
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
                    <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 mb-1">CASE STUDY</p>
                    <p className="text-sm text-amber-800 dark:text-amber-200">{emailResponse.caseStudy}</p>
                  </div>
                </div>

                <div className="pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium">Full Email Response</label>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={copyResponse}
                      className="gap-2"
                    >
                      {responseCopied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                      {responseCopied ? 'Copied!' : 'Copy'}
                    </Button>
                  </div>
                  <div className="p-4 bg-background rounded-lg border text-sm whitespace-pre-wrap font-mono">
                    {emailResponse.fullResponse}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Pre-Meeting Prep - Full Briefing + AI Predictions */}
      {dealId && (
        <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/30">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
                  <Lightbulb className="h-5 w-5" />
                  Pre-Meeting Prep
                  {meetingPrep && (
                    <span className="text-base font-normal">
                      {meetingPrep.briefing.person.name && `: ${meetingPrep.briefing.person.name}`}
                      {meetingPrep.briefing.person.job_title && ` — ${meetingPrep.briefing.person.job_title}`}
                      {meetingPrep.briefing.company.name && ` @ ${meetingPrep.briefing.company.name}`}
                    </span>
                  )}
                </CardTitle>
                <CardDescription>
                  {loadingPrep ? 'Generating briefing...' : prepError ? 'Failed to load briefing' : 'Deal briefing and AI-predicted objections'}
                </CardDescription>
              </div>
              {meetingPrep && !loadingPrep && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={generateMeetingPrep}
                  className="border-amber-300 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/50"
                >
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Regenerate
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {loadingPrep ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
                <span className="ml-3 text-sm text-amber-700 dark:text-amber-300">Analyzing deal data and generating predictions...</span>
              </div>
            ) : prepError ? (
              <div className="text-center py-4">
                <p className="text-sm text-red-600 dark:text-red-400 mb-2">{prepError}</p>
                <Button variant="outline" size="sm" onClick={generateMeetingPrep}>Retry</Button>
              </div>
            ) : meetingPrep ? (
              <div className="space-y-5">
                {/* 3-column info grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Person Info */}
                  <div className="p-3 bg-background rounded-lg border border-amber-100 dark:border-amber-800/50">
                    <h4 className="text-xs font-semibold text-amber-700 dark:text-amber-300 mb-2 flex items-center gap-1">
                      <User className="h-3.5 w-3.5" /> Person
                    </h4>
                    <div className="space-y-1 text-sm">
                      <p className="font-medium">{meetingPrep.briefing.person.name || 'N/A'}</p>
                      {meetingPrep.briefing.person.headline && (
                        <p className="text-muted-foreground text-xs">{meetingPrep.briefing.person.headline}</p>
                      )}
                      {meetingPrep.briefing.person.email && (
                        <p className="text-xs text-muted-foreground">{meetingPrep.briefing.person.email}</p>
                      )}
                      {meetingPrep.briefing.person.phone && (
                        <p className="text-xs text-muted-foreground">{meetingPrep.briefing.person.phone}</p>
                      )}
                      {meetingPrep.briefing.person.skills.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-1">
                          {meetingPrep.briefing.person.skills.slice(0, 5).map((skill, i) => (
                            <span key={i} className="px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 rounded text-[10px]">{skill}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Company Info */}
                  <div className="p-3 bg-background rounded-lg border border-amber-100 dark:border-amber-800/50">
                    <h4 className="text-xs font-semibold text-amber-700 dark:text-amber-300 mb-2 flex items-center gap-1">
                      <Building2 className="h-3.5 w-3.5" /> Company
                    </h4>
                    <div className="space-y-1 text-sm">
                      <p className="font-medium">{meetingPrep.briefing.company.name || 'N/A'}</p>
                      {meetingPrep.briefing.company.industry && (
                        <p className="text-xs text-muted-foreground">Industry: {meetingPrep.briefing.company.industry}</p>
                      )}
                      {meetingPrep.briefing.company.company_size && (
                        <p className="text-xs text-muted-foreground">Size: {meetingPrep.briefing.company.company_size}</p>
                      )}
                      {meetingPrep.briefing.company.headquarters && (
                        <p className="text-xs text-muted-foreground">HQ: {meetingPrep.briefing.company.headquarters}</p>
                      )}
                      {meetingPrep.briefing.company.description && (
                        <p className="text-xs text-muted-foreground line-clamp-3">{meetingPrep.briefing.company.description}</p>
                      )}
                    </div>
                  </div>

                  {/* Deal Status */}
                  <div className="p-3 bg-background rounded-lg border border-amber-100 dark:border-amber-800/50">
                    <h4 className="text-xs font-semibold text-amber-700 dark:text-amber-300 mb-2 flex items-center gap-1">
                      <TrendingUp className="h-3.5 w-3.5" /> Deal Status
                    </h4>
                    <div className="space-y-1 text-sm">
                      <p className="font-medium">{STAGE_LABELS[meetingPrep.briefing.deal_status.stage] || meetingPrep.briefing.deal_status.stage}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>Health: {meetingPrep.briefing.deal_status.health_score}/100</span>
                        <span className={`inline-block w-2 h-2 rounded-full ${meetingPrep.briefing.deal_status.health_score >= 70 ? 'bg-green-500' : meetingPrep.briefing.deal_status.health_score >= 40 ? 'bg-yellow-500' : 'bg-red-500'}`} />
                      </div>
                      {meetingPrep.briefing.deal_status.estimated_value && (
                        <p className="text-xs text-muted-foreground">Value: {meetingPrep.briefing.deal_status.estimated_value.toLocaleString()} PLN</p>
                      )}
                      <p className="text-xs text-muted-foreground">Priority: {meetingPrep.briefing.deal_status.priority}</p>
                      <div className="flex gap-2 text-xs pt-1">
                        <span className={`px-1.5 py-0.5 rounded ${meetingPrep.briefing.deal_status.has_decision_maker ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'}`}>
                          {meetingPrep.briefing.deal_status.has_decision_maker ? 'Decision Maker' : 'No DM'}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded ${meetingPrep.briefing.deal_status.has_confirmed_budget ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'}`}>
                          {meetingPrep.briefing.deal_status.has_confirmed_budget ? 'Budget OK' : 'No Budget'}
                        </span>
                      </div>
                      {meetingPrep.briefing.deal_status.days_in_pipeline != null && (
                        <p className="text-xs text-muted-foreground">{meetingPrep.briefing.deal_status.days_in_pipeline} days in pipeline</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Discovery Insights */}
                {(meetingPrep.briefing.discovery_insights.pain_points.length > 0 ||
                  meetingPrep.briefing.discovery_insights.red_flags.length > 0 ||
                  meetingPrep.briefing.discovery_insights.stakeholders.length > 0) && (
                  <div className="p-3 bg-background rounded-lg border border-amber-100 dark:border-amber-800/50">
                    <h4 className="text-xs font-semibold text-amber-700 dark:text-amber-300 mb-2 flex items-center gap-1">
                      <MessageSquare className="h-3.5 w-3.5" /> Discovery Insights (from transcripts)
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {meetingPrep.briefing.discovery_insights.pain_points.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">Pain Points</p>
                          <ul className="space-y-0.5">
                            {meetingPrep.briefing.discovery_insights.pain_points.map((pp, i) => (
                              <li key={i} className="text-xs text-muted-foreground flex items-start gap-1">
                                <span className="text-red-400 mt-0.5">-</span> {pp}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {meetingPrep.briefing.discovery_insights.red_flags.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-orange-600 dark:text-orange-400 mb-1">Red Flags</p>
                          <ul className="space-y-0.5">
                            {meetingPrep.briefing.discovery_insights.red_flags.map((rf, i) => (
                              <li key={i} className="text-xs text-muted-foreground flex items-start gap-1">
                                <span className="text-orange-400 mt-0.5">-</span> {rf}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {meetingPrep.briefing.discovery_insights.stakeholders.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-1">Stakeholders</p>
                          <ul className="space-y-0.5">
                            {meetingPrep.briefing.discovery_insights.stakeholders.map((sh, i) => (
                              <li key={i} className="text-xs text-muted-foreground flex items-start gap-1">
                                <span className="text-blue-400 mt-0.5">-</span> {sh}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Activity Summary */}
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span className="px-2 py-1 bg-background rounded border border-amber-100 dark:border-amber-800/50">
                    {meetingPrep.briefing.activity_summary.total_activities} activities
                  </span>
                  <span className="px-2 py-1 bg-background rounded border border-amber-100 dark:border-amber-800/50">
                    {meetingPrep.briefing.activity_summary.transcript_count} transcripts
                  </span>
                  <span className="px-2 py-1 bg-background rounded border border-amber-100 dark:border-amber-800/50">
                    {meetingPrep.briefing.activity_summary.notes_count} notes
                  </span>
                  {meetingPrep.briefing.activity_summary.last_activity_date && (
                    <span className="px-2 py-1 bg-background rounded border border-amber-100 dark:border-amber-800/50">
                      Last activity: {new Date(meetingPrep.briefing.activity_summary.last_activity_date).toLocaleDateString()}
                    </span>
                  )}
                  {meetingPrep.briefing.activity_summary.has_sales_room && (
                    <span className="px-2 py-1 bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 rounded border border-green-200 dark:border-green-800">
                      Sales Room active
                    </span>
                  )}
                </div>

                {/* Research Summary (collapsible) */}
                {meetingPrep.briefing.research_summary && (
                  <div className="p-3 bg-background rounded-lg border border-amber-100 dark:border-amber-800/50">
                    <button
                      onClick={() => setShowFullSummary(!showFullSummary)}
                      className="w-full flex items-center justify-between text-xs font-semibold text-amber-700 dark:text-amber-300 mb-1"
                    >
                      <span className="flex items-center gap-1">
                        <Search className="h-3.5 w-3.5" /> Research Summary
                      </span>
                      {showFullSummary ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </button>
                    <div className={`text-xs text-muted-foreground whitespace-pre-wrap ${showFullSummary ? '' : 'line-clamp-3'}`}>
                      {meetingPrep.briefing.research_summary}
                    </div>
                  </div>
                )}

                {/* AI Predicted Objections */}
                <div className="border-t border-amber-200 dark:border-amber-800 pt-4">
                  <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-3 flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    AI Predicted Objections
                    {meetingPrep.ai_model_used && (
                      <span className="text-[10px] font-normal text-muted-foreground">({meetingPrep.ai_model_used})</span>
                    )}
                  </h4>

                  {meetingPrep.ai_error && meetingPrep.predictions.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">{meetingPrep.ai_error}</p>
                  ) : meetingPrep.predictions.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No predictions generated.</p>
                  ) : (
                    <div className="space-y-3">
                      {meetingPrep.predictions.map((prediction, index) => {
                        const catInfo = getCategoryInfo(prediction.category);
                        const relevantCard = battlecards.find(bc => bc.category === prediction.category);
                        return (
                          <div key={index} className="p-3 bg-background rounded-lg border border-amber-100 dark:border-amber-800/50">
                            <div className="flex items-start gap-3">
                              <div className="flex-shrink-0 mt-0.5">
                                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${catInfo.color}`}>
                                    {catInfo.icon}
                                    {catInfo.label}
                                  </span>
                                </div>
                                <p className="font-medium text-sm">{prediction.objection}</p>
                                <p className="text-xs text-muted-foreground mt-1 italic">{prediction.reason}</p>
                                {prediction.suggested_response && (
                                  <div className="mt-2 p-2 bg-green-50 dark:bg-green-950/30 rounded border border-green-100 dark:border-green-800/50">
                                    <p className="text-xs font-medium text-green-700 dark:text-green-300 mb-0.5">Suggested Response (ARC):</p>
                                    <p className="text-xs text-green-600 dark:text-green-400">{prediction.suggested_response}</p>
                                  </div>
                                )}
                                {relevantCard && (
                                  <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-950/30 rounded border border-blue-100 dark:border-blue-800/50 text-xs">
                                    <p className="font-medium text-blue-700 dark:text-blue-300">You have a battlecard for this!</p>
                                    <p className="text-blue-600 dark:text-blue-400 mt-0.5">
                                      <span className="font-medium">A:</span> {relevantCard.arc_response?.acknowledge?.substring(0, 100)}...
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      {/* Create/Edit Form */}
      {(showCreateForm || editingItem) && (
        <Card>
          <CardHeader>
            <CardTitle>{editingItem ? 'Edit Battlecard' : 'Create New Battlecard'}</CardTitle>
            <CardDescription>Use the ARC framework: Acknowledge → Reframe → Counter</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={editingItem ? handleUpdate : handleCreate} className="space-y-4">
              {!editingItem && (
                <div>
                  <label className="block text-sm font-medium mb-1">Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 rounded-md border bg-background"
                    required
                  >
                    {CATEGORIES.map(cat => (
                      <option key={cat.value} value={cat.value}>{cat.label}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium mb-1">Objection Text</label>
                <Textarea
                  value={formData.objection_text}
                  onChange={(e) => setFormData({ ...formData, objection_text: e.target.value })}
                  placeholder="What objection does this address?"
                  rows={2}
                  required
                />
              </div>
              <div className="border-l-4 border-blue-500 pl-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-blue-600">Acknowledge</label>
                  <Textarea
                    value={formData.acknowledge}
                    onChange={(e) => setFormData({ ...formData, acknowledge: e.target.value })}
                    placeholder="Validate their concern..."
                    rows={2}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-green-600">Reframe</label>
                  <Textarea
                    value={formData.reframe}
                    onChange={(e) => setFormData({ ...formData, reframe: e.target.value })}
                    placeholder="Shift the perspective..."
                    rows={2}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-purple-600">Counter</label>
                  <Textarea
                    value={formData.counter}
                    onChange={(e) => setFormData({ ...formData, counter: e.target.value })}
                    placeholder="Provide the solution..."
                    rows={2}
                    required
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_shared"
                  checked={formData.is_shared}
                  onChange={(e) => setFormData({ ...formData, is_shared: e.target.checked })}
                  className="rounded"
                />
                <label htmlFor="is_shared" className="text-sm">Share with team</label>
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
                  {editingItem ? 'Save Changes' : 'Create'}
                </Button>
                <Button type="button" variant="outline" onClick={cancelForm}>
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Battlecards List */}
      <Card>
        <CardHeader>
          <CardTitle>{searchQuery || selectedCategory ? 'Results' : 'All Battlecards'}</CardTitle>
          <CardDescription>
            {loading ? 'Loading...' : `${battlecards.length} battlecard${battlecards.length !== 1 ? 's' : ''} found`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : battlecards.length === 0 ? (
            <div className="text-center py-8">
              <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                {searchQuery ? 'No battlecards match your search' : 'No battlecards yet'}
              </p>
              {!searchQuery && (
                <Button className="mt-4" onClick={() => setShowCreateForm(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Your First Battlecard
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {battlecards.map((bc) => {
                const catInfo = getCategoryInfo(bc.category);
                return (
                  <div key={bc.id} className="border rounded-lg p-4 hover:bg-accent/50 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${catInfo.color}`}>
                            {catInfo.icon}
                            {catInfo.label}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Score: {bc.feedback_score}
                          </span>
                        </div>
                        <h3 className="font-semibold mb-2">{bc.objection_text}</h3>
                        {bc.arc_response && (
                          <div className="space-y-2 text-sm">
                            <p><span className="font-medium text-blue-600">A:</span> {bc.arc_response.acknowledge}</p>
                            <p><span className="font-medium text-green-600">R:</span> {bc.arc_response.reframe}</p>
                            <p><span className="font-medium text-purple-600">C:</span> {bc.arc_response.counter}</p>
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground mt-2">
                          Created by {bc.created_by_name} on {new Date(bc.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex flex-col gap-2">
                        <div className="flex gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleFeedback(bc.id, 'up')}
                            title="This worked!"
                          >
                            <ThumbsUp className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleFeedback(bc.id, 'down')}
                            title="Needs improvement"
                          >
                            <ThumbsDown className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => startEditing(bc)}
                            aria-label={`Edit ${bc.objection_text.substring(0, 20)}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDelete(bc.id)}
                            disabled={deleting === bc.id}
                            className="text-red-500 hover:text-red-600"
                            aria-label={`Delete battlecard`}
                          >
                            {deleting === bc.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
