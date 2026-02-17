import { useState, useEffect, useRef } from 'react';
import { API_URL } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Plus, Search, Trash2, Edit2, ArrowRight, X, Filter, Building2, Target, Zap, RotateCcw, Settings, ChevronDown, ChevronUp, FileText, Sparkles, Loader2, Clock, CheckCircle, XCircle, History, MessageSquare, Copy, Shield } from 'lucide-react';

interface IntentSearch {
  id: string;
  mission_objective: string;
  icp_template_id: string | null;
  status: 'queued' | 'running' | 'completed' | 'failed';
  results_count: number;
  owner_name: string;
  created_at: string;
  completed_at: string | null;
}

interface CompetitorInfo {
  current_tools: { tool: string; category: string }[];
  likely_solutions: string[];
  competitive_landscape: string;
}

interface Lead {
  id: string;
  company_name: string;
  industry: string | null;
  tech_stack: string[];
  identified_pain: string | null;
  confidence_score: number;
  source_link: string | null;
  status: 'new' | 'contacted' | 'qualified' | 'nurturing' | 'not_interested';
  notes: string | null;
  deal_id: string | null;
  owner_name: string;
  created_at: string;
  hook_suggestions: string[];
  competitor_info: CompetitorInfo | null;
}

interface ICPTemplate {
  id: string;
  name: string;
  description: string | null;
  criteria: {
    industries?: string[];
    tech_stack?: string[];
    company_size?: string;
    pain_points?: string[];
  };
  is_shared: boolean;
  owner_id: string;
  owner_name?: string;
  created_at: string;
}

const statusColors: Record<string, string> = {
  new: 'bg-blue-100 text-blue-800',
  contacted: 'bg-yellow-100 text-yellow-800',
  qualified: 'bg-green-100 text-green-800',
  nurturing: 'bg-purple-100 text-purple-800',
  not_interested: 'bg-gray-100 text-gray-800'
};

const statusLabels: Record<string, string> = {
  new: 'New',
  contacted: 'Contacted',
  qualified: 'Qualified',
  nurturing: 'Nurturing',
  not_interested: 'Not Interested'
};

export default function IntentScraperPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [icpTemplateFilter, setICPTemplateFilter] = useState('');
  const [confidenceFilter, setConfidenceFilter] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [formData, setFormData] = useState({
    company_name: '',
    industry: '',
    tech_stack: '',
    identified_pain: '',
    confidence_score: 50,
    source_link: '',
    status: 'new' as const,
    notes: ''
  });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  // ICP Templates state
  const [showICPTemplates, setShowICPTemplates] = useState(false);
  const [icpTemplates, setICPTemplates] = useState<ICPTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [showICPForm, setShowICPForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ICPTemplate | null>(null);
  const [icpFormData, setICPFormData] = useState({
    name: '',
    description: '',
    industries: '',
    tech_stack: '',
    company_size: '',
    pain_points: '',
    is_shared: false
  });
  const [savingTemplate, setSavingTemplate] = useState(false);

  // AI Search state
  const [missionObjective, setMissionObjective] = useState('');
  const [selectedICPForSearch, setSelectedICPForSearch] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searches, setSearches] = useState<IntentSearch[]>([]);
  const [showSearchHistory, setShowSearchHistory] = useState(false);
  const [activeSearchId, setActiveSearchId] = useState<string | null>(null);
  const pollIntervalRef = useRef<number | null>(null);
  const [expandedLeadId, setExpandedLeadId] = useState<string | null>(null);

  const fetchLeads = async () => {
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      if (searchQuery) params.set('search', searchQuery);
      if (statusFilter) params.set('status', statusFilter);
      if (confidenceFilter) params.set('min_confidence', confidenceFilter);

      const res = await fetch(`${API_URL}/leads?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) throw new Error('Failed to fetch leads');
      const data = await res.json();
      setLeads(data);
    } catch (error) {
      console.error('Error fetching leads:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch leads',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();
  }, [searchQuery, statusFilter, confidenceFilter]);

  const resetFormFields = () => {
    setFormData({
      company_name: '',
      industry: '',
      tech_stack: '',
      identified_pain: '',
      confidence_score: 50,
      source_link: '',
      status: 'new',
      notes: ''
    });
  };

  const resetForm = () => {
    resetFormFields();
    setEditingLead(null);
    setShowCreateForm(false);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const token = localStorage.getItem('token');
      const techStackArray = formData.tech_stack
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0);

      const res = await fetch(`${API_URL}/leads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          ...formData,
          tech_stack: techStackArray
        })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to create lead');
      }

      toast({
        title: 'Success',
        description: 'Lead created successfully'
      });

      resetForm();
      fetchLeads();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLead) return;
    setSaving(true);

    try {
      const token = localStorage.getItem('token');
      const techStackArray = formData.tech_stack
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0);

      const res = await fetch(`${API_URL}/leads/${editingLead.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          ...formData,
          tech_stack: techStackArray
        })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to update lead');
      }

      toast({
        title: 'Success',
        description: 'Lead updated successfully'
      });

      resetForm();
      fetchLeads();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this lead?')) return;

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/leads/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) throw new Error('Failed to delete lead');

      toast({
        title: 'Success',
        description: 'Lead deleted successfully'
      });

      fetchLeads();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete lead',
        variant: 'destructive'
      });
    }
  };

  const handleConvertToDeal = async (id: string) => {
    if (!confirm('Convert this lead to a deal? This will create a new deal in your pipeline.')) return;

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/leads/${id}/convert-to-deal`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to convert lead');
      }

      toast({
        title: 'Success',
        description: 'Lead converted to deal successfully'
      });

      fetchLeads();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
    }
  };

  const startEdit = (lead: Lead) => {
    setEditingLead(lead);
    setFormData({
      company_name: lead.company_name,
      industry: lead.industry || '',
      tech_stack: lead.tech_stack?.join(', ') || '',
      identified_pain: lead.identified_pain || '',
      confidence_score: lead.confidence_score,
      source_link: lead.source_link || '',
      status: lead.status,
      notes: lead.notes || ''
    });
    setShowCreateForm(true);
  };

  const getConfidenceColor = (score: number) => {
    if (score >= 70) return 'text-green-600';
    if (score >= 40) return 'text-yellow-600';
    return 'text-red-600';
  };

  const toggleExpandLead = (leadId: string) => {
    setExpandedLeadId(expandedLeadId === leadId ? null : leadId);
  };

  // ICP Templates functions
  const fetchICPTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/icp-templates`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch ICP templates');
      const data = await res.json();
      setICPTemplates(data.templates || []);
    } catch (error) {
      console.error('Error fetching ICP templates:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch ICP templates',
        variant: 'destructive'
      });
    } finally {
      setLoadingTemplates(false);
    }
  };

  const resetICPForm = () => {
    setICPFormData({
      name: '',
      description: '',
      industries: '',
      tech_stack: '',
      company_size: '',
      pain_points: '',
      is_shared: false
    });
    setEditingTemplate(null);
    setShowICPForm(false);
  };

  const handleCreateICPTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingTemplate(true);

    try {
      const token = localStorage.getItem('token');
      const criteria = {
        industries: icpFormData.industries.split(',').map(s => s.trim()).filter(s => s),
        tech_stack: icpFormData.tech_stack.split(',').map(s => s.trim()).filter(s => s),
        company_size: icpFormData.company_size || undefined,
        pain_points: icpFormData.pain_points.split(',').map(s => s.trim()).filter(s => s)
      };

      const res = await fetch(`${API_URL}/icp-templates`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: icpFormData.name,
          description: icpFormData.description || null,
          criteria,
          is_shared: icpFormData.is_shared
        })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to create ICP template');
      }

      toast({
        title: 'Success',
        description: 'ICP template created successfully'
      });

      resetICPForm();
      fetchICPTemplates();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleUpdateICPTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTemplate) return;
    setSavingTemplate(true);

    try {
      const token = localStorage.getItem('token');
      const criteria = {
        industries: icpFormData.industries.split(',').map(s => s.trim()).filter(s => s),
        tech_stack: icpFormData.tech_stack.split(',').map(s => s.trim()).filter(s => s),
        company_size: icpFormData.company_size || undefined,
        pain_points: icpFormData.pain_points.split(',').map(s => s.trim()).filter(s => s)
      };

      const res = await fetch(`${API_URL}/icp-templates/${editingTemplate.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: icpFormData.name,
          description: icpFormData.description || null,
          criteria,
          is_shared: icpFormData.is_shared
        })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to update ICP template');
      }

      toast({
        title: 'Success',
        description: 'ICP template updated successfully'
      });

      resetICPForm();
      fetchICPTemplates();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleDeleteICPTemplate = async (id: string) => {
    if (!confirm('Are you sure you want to delete this ICP template?')) return;

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/icp-templates/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to delete ICP template');
      }

      toast({
        title: 'Success',
        description: 'ICP template deleted successfully'
      });

      fetchICPTemplates();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
    }
  };

  const startEditICPTemplate = (template: ICPTemplate) => {
    setEditingTemplate(template);
    setICPFormData({
      name: template.name,
      description: template.description || '',
      industries: template.criteria.industries?.join(', ') || '',
      tech_stack: template.criteria.tech_stack?.join(', ') || '',
      company_size: template.criteria.company_size || '',
      pain_points: template.criteria.pain_points?.join(', ') || '',
      is_shared: template.is_shared
    });
    setShowICPForm(true);
  };

  // Fetch ICP templates on page load (for dropdown filter) and when section is opened
  useEffect(() => {
    fetchICPTemplates();
    fetchSearchHistory();
  }, []);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  // Fetch search history
  const fetchSearchHistory = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/intent-scraper/searches`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch searches');
      const data = await res.json();
      setSearches(data.searches || []);
    } catch (error) {
      console.error('Error fetching search history:', error);
    }
  };

  // Start AI search
  const startSearch = async () => {
    if (!missionObjective.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a mission objective',
        variant: 'destructive'
      });
      return;
    }

    setIsSearching(true);

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/intent-scraper/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          mission_objective: missionObjective,
          icp_template_id: selectedICPForSearch || null
        })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to start search');
      }

      const result = await res.json();
      setActiveSearchId(result.id);

      toast({
        title: 'Search Started',
        description: 'AI is analyzing your mission objective...'
      });

      // Start polling for results
      startPolling(result.id);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
      setIsSearching(false);
    }
  };

  // Poll for search results
  const startPolling = (searchId: string) => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }

    const poll = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_URL}/intent-scraper/searches/${searchId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (!res.ok) throw new Error('Failed to fetch search status');
        const data = await res.json();

        if (data.search.status === 'completed') {
          clearInterval(pollIntervalRef.current!);
          pollIntervalRef.current = null;
          setIsSearching(false);
          setActiveSearchId(null);
          setMissionObjective('');

          toast({
            title: 'Search Complete!',
            description: `Found ${data.leads?.length || 0} potential leads`
          });

          // Refresh leads and search history
          fetchLeads();
          fetchSearchHistory();
        } else if (data.search.status === 'failed') {
          clearInterval(pollIntervalRef.current!);
          pollIntervalRef.current = null;
          setIsSearching(false);
          setActiveSearchId(null);

          toast({
            title: 'Search Failed',
            description: 'An error occurred during the search',
            variant: 'destructive'
          });

          fetchSearchHistory();
        }
        // If still running, continue polling
      } catch (error) {
        console.error('Polling error:', error);
      }
    };

    // Poll every 1 second
    pollIntervalRef.current = window.setInterval(poll, 1000);
    // Also poll immediately
    poll();
  };

  const getSearchStatusIcon = (status: string) => {
    switch (status) {
      case 'queued':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'running':
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  const getSearchStatusLabel = (status: string) => {
    switch (status) {
      case 'queued':
        return 'Queued';
      case 'running':
        return 'Running...';
      case 'completed':
        return 'Completed';
      case 'failed':
        return 'Failed';
      default:
        return status;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Intent Scraper</h2>
          <p className="text-muted-foreground">
            AI-powered lead discovery and management
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowSearchHistory(!showSearchHistory)}>
            <History className="mr-2 h-4 w-4" />
            Search History
            {showSearchHistory ? <ChevronUp className="ml-2 h-4 w-4" /> : <ChevronDown className="ml-2 h-4 w-4" />}
          </Button>
          <Button variant="outline" onClick={() => setShowICPTemplates(!showICPTemplates)}>
            <Settings className="mr-2 h-4 w-4" />
            ICP Templates
            {showICPTemplates ? <ChevronUp className="ml-2 h-4 w-4" /> : <ChevronDown className="ml-2 h-4 w-4" />}
          </Button>
          <Button onClick={() => { resetForm(); setShowCreateForm(true); }}>
            <Plus className="mr-2 h-4 w-4" />
            Add Lead Manually
          </Button>
        </div>
      </div>

      {/* AI Search Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-yellow-500" />
            AI-Powered Lead Search
          </CardTitle>
          <CardDescription>
            Describe your target customer in natural language and let AI find matching companies
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="mission_objective">Mission Objective</Label>
              <Textarea
                id="mission_objective"
                placeholder="Example: Find mid-size healthcare companies using legacy ERP systems that might need modernization. Focus on companies with 100-500 employees in the US market that have recently received funding."
                value={missionObjective}
                onChange={(e) => setMissionObjective(e.target.value)}
                rows={3}
                disabled={isSearching}
              />
            </div>
            <div className="flex flex-wrap gap-4 items-end">
              <div className="flex-1 min-w-[200px]">
                <Label htmlFor="icp_for_search">Apply ICP Template (optional)</Label>
                <select
                  id="icp_for_search"
                  value={selectedICPForSearch}
                  onChange={(e) => setSelectedICPForSearch(e.target.value)}
                  disabled={isSearching}
                  className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  <option value="">No template</option>
                  {icpTemplates.map(template => (
                    <option key={template.id} value={template.id}>{template.name}</option>
                  ))}
                </select>
              </div>
              <Button
                onClick={startSearch}
                disabled={isSearching || !missionObjective.trim()}
                className="min-w-[140px]"
              >
                {isSearching ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Searching...
                  </>
                ) : (
                  <>
                    <Search className="mr-2 h-4 w-4" />
                    Start Search
                  </>
                )}
              </Button>
            </div>
            {isSearching && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground bg-blue-50 p-3 rounded-lg">
                <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                <span>AI is analyzing your mission objective and searching for matching companies...</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Search History Section */}
      {showSearchHistory && searches.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Recent Searches
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {searches.slice(0, 5).map((search) => (
                <div key={search.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      {getSearchStatusIcon(search.status)}
                      <span className="font-medium text-sm">{getSearchStatusLabel(search.status)}</span>
                      {search.status === 'completed' && (
                        <span className="text-xs text-green-600">({search.results_count} leads)</span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{search.mission_objective}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(search.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ICP Templates Section */}
      {showICPTemplates && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  ICP Templates
                </CardTitle>
                <CardDescription>
                  Manage Ideal Customer Profile templates for targeting leads
                </CardDescription>
              </div>
              <Button onClick={() => { resetICPForm(); setShowICPForm(true); }}>
                <Plus className="mr-2 h-4 w-4" />
                New Template
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* ICP Template Form */}
            {showICPForm && (
              <div className="mb-6 p-4 border rounded-lg bg-muted/50">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-semibold">{editingTemplate ? 'Edit Template' : 'Create New Template'}</h4>
                  <Button variant="ghost" size="icon" onClick={resetICPForm}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <form onSubmit={editingTemplate ? handleUpdateICPTemplate : handleCreateICPTemplate} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="icp_name">Template Name *</Label>
                      <Input
                        id="icp_name"
                        value={icpFormData.name}
                        onChange={(e) => setICPFormData({ ...icpFormData, name: e.target.value })}
                        required
                        placeholder="Enterprise SaaS"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="icp_description">Description</Label>
                      <Input
                        id="icp_description"
                        value={icpFormData.description}
                        onChange={(e) => setICPFormData({ ...icpFormData, description: e.target.value })}
                        placeholder="Targets enterprise software companies"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="icp_industries">Target Industries (comma-separated)</Label>
                      <Input
                        id="icp_industries"
                        value={icpFormData.industries}
                        onChange={(e) => setICPFormData({ ...icpFormData, industries: e.target.value })}
                        placeholder="Technology, Healthcare, Finance"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="icp_tech_stack">Tech Stack (comma-separated)</Label>
                      <Input
                        id="icp_tech_stack"
                        value={icpFormData.tech_stack}
                        onChange={(e) => setICPFormData({ ...icpFormData, tech_stack: e.target.value })}
                        placeholder="AWS, Kubernetes, React"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="icp_company_size">Company Size</Label>
                      <Input
                        id="icp_company_size"
                        value={icpFormData.company_size}
                        onChange={(e) => setICPFormData({ ...icpFormData, company_size: e.target.value })}
                        placeholder="100-500 employees"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="icp_pain_points">Pain Points (comma-separated)</Label>
                      <Input
                        id="icp_pain_points"
                        value={icpFormData.pain_points}
                        onChange={(e) => setICPFormData({ ...icpFormData, pain_points: e.target.value })}
                        placeholder="Legacy systems, Manual processes"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="icp_shared"
                      checked={icpFormData.is_shared}
                      onChange={(e) => setICPFormData({ ...icpFormData, is_shared: e.target.checked })}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <Label htmlFor="icp_shared" className="text-sm font-normal">Share with team</Label>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={resetICPForm}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={savingTemplate}>
                      {savingTemplate ? 'Saving...' : editingTemplate ? 'Update Template' : 'Create Template'}
                    </Button>
                  </div>
                </form>
              </div>
            )}

            {/* ICP Templates List */}
            {loadingTemplates ? (
              <p className="text-center text-muted-foreground py-4">Loading templates...</p>
            ) : icpTemplates.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No ICP templates yet</h3>
                <p className="text-muted-foreground mb-4">
                  Create templates to define your ideal customer profiles
                </p>
                <Button onClick={() => { resetICPForm(); setShowICPForm(true); }}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Your First Template
                </Button>
              </div>
            ) : (
              <div className="grid gap-3">
                {icpTemplates.map((template) => (
                  <div key={template.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold">{template.name}</h4>
                        {template.is_shared && (
                          <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-800 rounded">Shared</span>
                        )}
                      </div>
                      {template.description && (
                        <p className="text-sm text-muted-foreground">{template.description}</p>
                      )}
                      <div className="flex flex-wrap gap-1 mt-2">
                        {template.criteria.industries?.map((ind, i) => (
                          <span key={i} className="px-2 py-0.5 text-xs bg-gray-100 rounded">{ind}</span>
                        ))}
                        {template.criteria.tech_stack?.map((tech, i) => (
                          <span key={i} className="px-2 py-0.5 text-xs bg-purple-100 text-purple-800 rounded">{tech}</span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="icon" onClick={() => startEditICPTemplate(template)}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteICPTemplate(template.id)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search leads..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-11 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                <option value="">All Statuses</option>
                <option value="new">New</option>
                <option value="contacted">Contacted</option>
                <option value="qualified">Qualified</option>
                <option value="nurturing">Nurturing</option>
                <option value="not_interested">Not Interested</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-muted-foreground" />
              <select
                value={icpTemplateFilter}
                onChange={(e) => setICPTemplateFilter(e.target.value)}
                className="h-11 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                aria-label="ICP Template"
              >
                <option value="">All ICP Templates</option>
                {icpTemplates.map(template => (
                  <option key={template.id} value={template.id}>{template.name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-muted-foreground" />
              <select
                value={confidenceFilter}
                onChange={(e) => setConfidenceFilter(e.target.value)}
                className="h-11 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                aria-label="Confidence Filter"
              >
                <option value="">All Confidence</option>
                <option value="70">High (70%+)</option>
                <option value="50">Medium (50%+)</option>
                <option value="30">Low (30%+)</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Create/Edit Form */}
      {showCreateForm && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{editingLead ? 'Edit Lead' : 'Add New Lead'}</CardTitle>
                <CardDescription>
                  {editingLead ? 'Update lead information' : 'Manually add a new lead to track'}
                </CardDescription>
              </div>
              <Button variant="ghost" size="icon" onClick={resetForm}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={editingLead ? handleUpdate : handleCreate} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="company_name">Company Name *</Label>
                  <Input
                    id="company_name"
                    value={formData.company_name}
                    onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                    required
                    placeholder="Acme Corp"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="industry">Industry</Label>
                  <Input
                    id="industry"
                    value={formData.industry}
                    onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                    placeholder="Technology"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tech_stack">Tech Stack (comma-separated)</Label>
                  <Input
                    id="tech_stack"
                    value={formData.tech_stack}
                    onChange={(e) => setFormData({ ...formData, tech_stack: e.target.value })}
                    placeholder="React, Node.js, AWS"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confidence_score">Confidence Score: {formData.confidence_score}%</Label>
                  <input
                    type="range"
                    id="confidence_score"
                    min="0"
                    max="100"
                    value={formData.confidence_score}
                    onChange={(e) => setFormData({ ...formData, confidence_score: parseInt(e.target.value) })}
                    className="w-full"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="source_link">Source Link</Label>
                  <Input
                    id="source_link"
                    type="url"
                    value={formData.source_link}
                    onChange={(e) => setFormData({ ...formData, source_link: e.target.value })}
                    placeholder="https://example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <select
                    id="status"
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                    className="h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  >
                    <option value="new">New</option>
                    <option value="contacted">Contacted</option>
                    <option value="qualified">Qualified</option>
                    <option value="nurturing">Nurturing</option>
                    <option value="not_interested">Not Interested</option>
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="identified_pain">Identified Pain Points</Label>
                <Textarea
                  id="identified_pain"
                  value={formData.identified_pain}
                  onChange={(e) => setFormData({ ...formData, identified_pain: e.target.value })}
                  placeholder="Describe the pain points you've identified for this lead..."
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Additional notes about this lead..."
                  rows={2}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
                <Button type="button" variant="ghost" onClick={resetFormFields}>
                  <RotateCcw className="h-4 w-4 mr-1" />
                  Reset
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? 'Saving...' : editingLead ? 'Update Lead' : 'Create Lead'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Leads List */}
      <div className="space-y-4">
        {loading ? (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-muted-foreground">Loading leads...</p>
            </CardContent>
          </Card>
        ) : leads.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Target className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No leads yet</h3>
              <p className="text-muted-foreground mb-4">
                Start adding leads to track potential customers
              </p>
              <Button onClick={() => { resetForm(); setShowCreateForm(true); }}>
                <Plus className="mr-2 h-4 w-4" />
                Add Your First Lead
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {leads.map((lead) => (
              <Card key={lead.id} className="hover:shadow-md transition-shadow">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-3">
                        <Building2 className="h-5 w-5 text-muted-foreground" />
                        <h3 className="font-semibold text-lg">{lead.company_name}</h3>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[lead.status]}`}>
                          {statusLabels[lead.status]}
                        </span>
                        {lead.deal_id && (
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Converted to Deal
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                        {lead.industry && (
                          <span>Industry: {lead.industry}</span>
                        )}
                        <span className={getConfidenceColor(lead.confidence_score)}>
                          Confidence: {lead.confidence_score}%
                        </span>
                      </div>

                      {lead.tech_stack && lead.tech_stack.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {lead.tech_stack.map((tech, i) => (
                            <span key={i} className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-xs">
                              {tech}
                            </span>
                          ))}
                        </div>
                      )}

                      {lead.identified_pain && (
                        <p className="text-sm text-muted-foreground mt-2">
                          <Zap className="inline h-4 w-4 mr-1" />
                          {lead.identified_pain}
                        </p>
                      )}

                      {/* Expand/Collapse Button */}
                      {lead.hook_suggestions && lead.hook_suggestions.length > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleExpandLead(lead.id)}
                          className="mt-2 text-blue-600 hover:text-blue-700"
                        >
                          <MessageSquare className="h-4 w-4 mr-1" />
                          {expandedLeadId === lead.id ? 'Hide' : 'Show'} Hook Suggestions ({lead.hook_suggestions.length})
                          {expandedLeadId === lead.id ? (
                            <ChevronUp className="h-4 w-4 ml-1" />
                          ) : (
                            <ChevronDown className="h-4 w-4 ml-1" />
                          )}
                        </Button>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {!lead.deal_id && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleConvertToDeal(lead.id)}
                          title="Convert to Deal"
                        >
                          <ArrowRight className="h-4 w-4 mr-1" />
                          Convert
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => startEdit(lead)}
                        aria-label={`Edit ${lead.company_name}`}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(lead.id)}
                        className="text-red-500 hover:text-red-600"
                        aria-label={`Delete ${lead.company_name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Expanded Hook Suggestions Section */}
                  {expandedLeadId === lead.id && lead.hook_suggestions && lead.hook_suggestions.length > 0 && (
                    <div className="mt-4 pt-4 border-t">
                      <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-yellow-500" />
                        AI-Generated Icebreaker Hooks
                      </h4>
                      <div className="space-y-3">
                        {lead.hook_suggestions.map((hook, index) => (
                          <div key={index} className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <span className="inline-block px-2 py-0.5 bg-blue-200 text-blue-800 rounded text-xs font-medium mb-2">
                                  Hook #{index + 1}
                                </span>
                                <p className="text-sm text-gray-700">{hook}</p>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="shrink-0"
                                onClick={() => {
                                  navigator.clipboard.writeText(hook);
                                  toast({
                                    title: 'Copied!',
                                    description: 'Hook copied to clipboard'
                                  });
                                }}
                                title="Copy to clipboard"
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Competitor Analysis Section */}
                      {lead.competitor_info && (
                        <div className="mt-6">
                          <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                            <Shield className="h-4 w-4 text-purple-500" />
                            Competitor & Tool Analysis
                          </h4>
                          <div className="space-y-4">
                            {/* Current Tools */}
                            {lead.competitor_info.current_tools && lead.competitor_info.current_tools.length > 0 && (
                              <div className="p-3 bg-purple-50 rounded-lg border border-purple-100">
                                <h5 className="text-xs font-medium text-purple-800 mb-2">Current Tools Detected</h5>
                                <div className="flex flex-wrap gap-2">
                                  {lead.competitor_info.current_tools.map((tool, idx) => (
                                    <span key={idx} className="px-2 py-1 bg-purple-200 text-purple-800 rounded text-xs">
                                      {tool.tool} <span className="text-purple-600">({tool.category})</span>
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Likely Solutions / Competitors */}
                            {lead.competitor_info.likely_solutions && lead.competitor_info.likely_solutions.length > 0 && (
                              <div className="p-3 bg-orange-50 rounded-lg border border-orange-100">
                                <h5 className="text-xs font-medium text-orange-800 mb-2">Likely Competitors / Solutions</h5>
                                <div className="flex flex-wrap gap-2">
                                  {lead.competitor_info.likely_solutions.map((solution, idx) => (
                                    <span key={idx} className="px-2 py-1 bg-orange-200 text-orange-800 rounded text-xs">
                                      {solution}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Competitive Landscape */}
                            {lead.competitor_info.competitive_landscape && (
                              <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                                <h5 className="text-xs font-medium text-gray-700 mb-2">Competitive Landscape</h5>
                                <p className="text-sm text-gray-600">{lead.competitor_info.competitive_landscape}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Stats Summary */}
      {leads.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap gap-6 text-sm">
              <div>
                <span className="text-muted-foreground">Total Leads:</span>
                <span className="ml-2 font-semibold">{leads.length}</span>
              </div>
              <div>
                <span className="text-muted-foreground">New:</span>
                <span className="ml-2 font-semibold">{leads.filter(l => l.status === 'new').length}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Qualified:</span>
                <span className="ml-2 font-semibold">{leads.filter(l => l.status === 'qualified').length}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Converted:</span>
                <span className="ml-2 font-semibold">{leads.filter(l => l.deal_id).length}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
