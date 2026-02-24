import { useState, useEffect } from 'react';
import { useNavigate, Link, useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { ArrowLeft, Save, Loader2, User, Mail, Phone, Linkedin } from 'lucide-react';
import { API_URL } from '@/lib/api';

interface Deal {
  id: string;
  first_name: string;
  last_name: string;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  company_name: string | null;
  industry: string | null;
  stage: string;
  estimated_value: number | null;
  close_date: string | null;
  compelling_event_date: string | null;
  next_step_date: string | null;
  next_step_description: string | null;
  priority: string;
  health_score: number | null;
  has_decision_maker: number | null;
  has_confirmed_budget: number | null;
  lost_reason: string | null;
}

interface DealForm {
  first_name: string;
  last_name: string;
  job_title: string;
  email: string;
  phone: string;
  linkedin_url: string;
  company_name: string;
  industry: string;
  stage: string;
  estimated_value: string;
  close_date: string;
  compelling_event_date: string;
  next_step_date: string;
  next_step_description: string;
  priority: string;
  has_decision_maker: boolean;
  has_confirmed_budget: boolean;
  lost_reason: string;
}

const stages = [
  { value: 'new_signal', label: 'New Signal' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'discovery', label: 'Discovery' },
  { value: 'solution_design', label: 'Solution Design' },
  { value: 'negotiation', label: 'Negotiation' },
  { value: 'closed_won', label: 'Closed Won' },
  { value: 'closed_lost', label: 'Closed Lost' },
];

const priorities = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

export default function DealEditPage() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<DealForm>({
    first_name: '',
    last_name: '',
    job_title: '',
    email: '',
    phone: '',
    linkedin_url: '',
    company_name: '',
    industry: '',
    stage: 'new_signal',
    estimated_value: '',
    close_date: '',
    compelling_event_date: '',
    next_step_date: '',
    next_step_description: '',
    priority: 'medium',
    has_decision_maker: false,
    has_confirmed_budget: false,
    lost_reason: '',
  });

  useEffect(() => {
    const fetchDeal = async () => {
      try {
        const response = await fetch(`${API_URL}/deals/${id}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch deal');
        }

        const data = await response.json();
        const deal: Deal = data.deal;

        setForm({
          first_name: deal.first_name || '',
          last_name: deal.last_name || '',
          job_title: deal.job_title || '',
          email: deal.email || '',
          phone: deal.phone || '',
          linkedin_url: deal.linkedin_url || '',
          company_name: deal.company_name || '',
          industry: deal.industry || '',
          stage: deal.stage || 'new_signal',
          estimated_value: deal.estimated_value?.toString() || '',
          close_date: deal.close_date ? deal.close_date.split('T')[0] : '',
          compelling_event_date: deal.compelling_event_date ? deal.compelling_event_date.split('T')[0] : '',
          next_step_date: deal.next_step_date ? deal.next_step_date.split('T')[0] : '',
          next_step_description: deal.next_step_description || '',
          priority: deal.priority || 'medium',
          has_decision_maker: deal.has_decision_maker === 1,
          has_confirmed_budget: deal.has_confirmed_budget === 1,
          lost_reason: deal.lost_reason || '',
        });
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setForm((prev) => ({ ...prev, [name]: checked }));
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.first_name.trim()) {
      setError('First name is required');
      return;
    }

    if (!form.last_name.trim()) {
      setError('Last name is required');
      return;
    }

    if (!form.next_step_date) {
      setError('Next step date is required');
      return;
    }

    try {
      setSaving(true);

      const payload = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        job_title: form.job_title.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        linkedin_url: form.linkedin_url.trim() || null,
        company_name: form.company_name.trim() || null,
        industry: form.industry.trim() || null,
        stage: form.stage,
        estimated_value: form.estimated_value ? parseFloat(form.estimated_value) : null,
        close_date: form.close_date || null,
        compelling_event_date: form.compelling_event_date || null,
        next_step_date: form.next_step_date,
        next_step_description: form.next_step_description.trim() || null,
        priority: form.priority,
        has_decision_maker: form.has_decision_maker,
        has_confirmed_budget: form.has_confirmed_budget,
        lost_reason: form.stage === 'closed_lost' ? form.lost_reason.trim() || null : null,
      };

      const response = await fetch(`${API_URL}/deals/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update deal');
      }

      navigate(`/deals/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to={`/deals/${id}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </Link>
        <div>
          <h2 className="text-2xl font-bold">Edit Deal</h2>
          <p className="text-muted-foreground">Update deal information</p>
        </div>
      </div>

      {/* Form */}
      <Card>
        <CardHeader>
          <CardTitle>Deal Information</CardTitle>
          <CardDescription>Modify the deal details below</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div role="alert" className="bg-red-500/10 border border-red-500/20 text-red-500 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            {/* Contact Person Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <User className="h-4 w-4" />
                Contact Person
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="first_name">First Name *</Label>
                  <Input
                    id="first_name"
                    name="first_name"
                    value={form.first_name}
                    onChange={handleChange}
                    placeholder="John"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="last_name">Last Name *</Label>
                  <Input
                    id="last_name"
                    name="last_name"
                    value={form.last_name}
                    onChange={handleChange}
                    placeholder="Smith"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="job_title">Job Title</Label>
                  <Input
                    id="job_title"
                    name="job_title"
                    value={form.job_title}
                    onChange={handleChange}
                    placeholder="CTO"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    value={form.email}
                    onChange={handleChange}
                    placeholder="john@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    name="phone"
                    type="tel"
                    value={form.phone}
                    onChange={handleChange}
                    placeholder="+1 555 000 0000"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="linkedin_url">LinkedIn URL</Label>
                  <Input
                    id="linkedin_url"
                    name="linkedin_url"
                    type="url"
                    value={form.linkedin_url}
                    onChange={handleChange}
                    placeholder="https://linkedin.com/in/..."
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Company Name */}
              <div className="space-y-2">
                <Label htmlFor="company_name">Company Name</Label>
                <Input
                  id="company_name"
                  name="company_name"
                  value={form.company_name}
                  onChange={handleChange}
                  placeholder="Acme Corp"
                />
              </div>

              {/* Industry */}
              <div className="space-y-2">
                <Label htmlFor="industry">Industry</Label>
                <Input
                  id="industry"
                  name="industry"
                  value={form.industry}
                  onChange={handleChange}
                  placeholder="Technology"
                />
              </div>

              {/* Stage */}
              <div className="space-y-2">
                <Label htmlFor="stage">Stage</Label>
                <select
                  id="stage"
                  name="stage"
                  value={form.stage}
                  onChange={handleChange}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {stages.map((stage) => (
                    <option key={stage.value} value={stage.value}>
                      {stage.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Lost Reason - only show when stage is closed_lost */}
              {form.stage === 'closed_lost' && (
                <div className="space-y-2">
                  <Label htmlFor="lost_reason">Lost Reason</Label>
                  <select
                    id="lost_reason"
                    name="lost_reason"
                    value={form.lost_reason}
                    onChange={handleChange}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option value="">Select reason...</option>
                    <option value="Timing">Timing - Not ready this quarter</option>
                    <option value="Budget">Budget - No budget available</option>
                    <option value="Competitor">Competitor - Chose another vendor</option>
                    <option value="No Response">No Response - Went silent</option>
                    <option value="Features">Features - Missing required features</option>
                    <option value="Price">Price - Too expensive</option>
                    <option value="Other">Other</option>
                  </select>
                  <p className="text-xs text-muted-foreground">
                    Selecting "Timing" will create a re-engagement task in 3 months
                  </p>
                </div>
              )}

              {/* Priority */}
              <div className="space-y-2">
                <Label htmlFor="priority">Priority</Label>
                <select
                  id="priority"
                  name="priority"
                  value={form.priority}
                  onChange={handleChange}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {priorities.map((priority) => (
                    <option key={priority.value} value={priority.value}>
                      {priority.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Estimated Value */}
              <div className="space-y-2">
                <Label htmlFor="estimated_value">Estimated Value ($)</Label>
                <Input
                  id="estimated_value"
                  name="estimated_value"
                  type="number"
                  min="0"
                  step="1000"
                  value={form.estimated_value}
                  onChange={handleChange}
                  placeholder="50000"
                />
              </div>

              {/* Close Date */}
              <div className="space-y-2">
                <Label htmlFor="close_date">Expected Close Date</Label>
                <Input
                  id="close_date"
                  name="close_date"
                  type="date"
                  value={form.close_date}
                  onChange={handleChange}
                />
              </div>

              {/* Compelling Event Date */}
              <div className="space-y-2">
                <Label htmlFor="compelling_event_date">Compelling Event Date</Label>
                <Input
                  id="compelling_event_date"
                  name="compelling_event_date"
                  type="date"
                  value={form.compelling_event_date}
                  onChange={handleChange}
                />
              </div>

              {/* Next Step Date */}
              <div className="space-y-2">
                <Label htmlFor="next_step_date">Next Step Date *</Label>
                <Input
                  id="next_step_date"
                  name="next_step_date"
                  type="date"
                  value={form.next_step_date}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>

            {/* Next Step Description */}
            <div className="space-y-2">
              <Label htmlFor="next_step_description">Next Step Description</Label>
              <textarea
                id="next_step_description"
                name="next_step_description"
                value={form.next_step_description}
                onChange={handleChange}
                placeholder="Schedule discovery call with CTO"
                rows={3}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>

            {/* Health Score Factors */}
            <div className="space-y-4 border rounded-lg p-4 bg-muted/30">
              <div>
                <h4 className="font-medium mb-2">Health Score Factors</h4>
                <p className="text-sm text-muted-foreground mb-4">
                  These factors affect the deal's health score calculation
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    name="has_decision_maker"
                    checked={form.has_decision_maker}
                    onChange={handleChange}
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <div>
                    <span className="font-medium">Decision Maker Identified</span>
                    <p className="text-sm text-muted-foreground">+10 to health score</p>
                  </div>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    name="has_confirmed_budget"
                    checked={form.has_confirmed_budget}
                    onChange={handleChange}
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <div>
                    <span className="font-medium">Confirmed Budget</span>
                    <p className="text-sm text-muted-foreground">+20 to health score</p>
                  </div>
                </label>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-4">
              <Link to={`/deals/${id}`}>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Link>
              <Button type="submit" disabled={saving}>
                <Save className="w-4 h-4 mr-2" />
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
