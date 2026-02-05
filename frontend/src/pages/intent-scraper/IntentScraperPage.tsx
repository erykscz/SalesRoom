import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Plus, Search, Trash2, Edit2, ArrowRight, X, Filter, Building2, Target, Zap } from 'lucide-react';

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

  const fetchLeads = async () => {
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      if (searchQuery) params.set('search', searchQuery);
      if (statusFilter) params.set('status', statusFilter);

      const res = await fetch(`/api/leads?${params.toString()}`, {
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
  }, [searchQuery, statusFilter]);

  const resetForm = () => {
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

      const res = await fetch('/api/leads', {
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

      const res = await fetch(`/api/leads/${editingLead.id}`, {
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
      const res = await fetch(`/api/leads/${id}`, {
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
      const res = await fetch(`/api/leads/${id}/convert-to-deal`, {
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Intent Scraper</h2>
          <p className="text-muted-foreground">
            Manage and track your sales leads
          </p>
        </div>
        <Button onClick={() => { resetForm(); setShowCreateForm(true); }}>
          <Plus className="mr-2 h-4 w-4" />
          Add Lead Manually
        </Button>
      </div>

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
