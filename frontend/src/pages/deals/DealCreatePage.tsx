import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Save, User, Mail, Phone, Linkedin } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { API_URL } from '@/lib/api';

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

export default function DealCreatePage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
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
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const formDirtyRef = useRef(false);

  // Check if form has any data entered (dirty state)
  const isFormDirty = useCallback(() => {
    return (
      form.first_name.trim() !== '' ||
      form.last_name.trim() !== '' ||
      form.job_title.trim() !== '' ||
      form.email.trim() !== '' ||
      form.phone.trim() !== '' ||
      form.linkedin_url.trim() !== '' ||
      form.company_name.trim() !== '' ||
      form.industry.trim() !== '' ||
      form.estimated_value !== '' ||
      form.close_date !== '' ||
      form.compelling_event_date !== '' ||
      form.next_step_date !== '' ||
      form.next_step_description.trim() !== '' ||
      form.stage !== 'new_signal' ||
      form.priority !== 'medium'
    );
  }, [form]);

  // Keep ref in sync with dirty state for click handler
  useEffect(() => {
    formDirtyRef.current = isFormDirty();
  }, [isFormDirty]);

  // Handle browser refresh/close with beforeunload warning
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isFormDirty() && !isSubmitting) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isFormDirty, isSubmitting]);

  // Handle in-app navigation (sidebar links, etc.)
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest('a');

      if (link && link.href && formDirtyRef.current && !isSubmitting) {
        const url = new URL(link.href);
        // Only intercept internal navigation
        if (url.origin === window.location.origin && url.pathname !== window.location.pathname) {
          e.preventDefault();
          e.stopPropagation();
          setPendingNavigation(url.pathname);
          setShowUnsavedDialog(true);
        }
      }
    };

    document.addEventListener('click', handleClick, true);
    return () => {
      document.removeEventListener('click', handleClick, true);
    };
  }, [isSubmitting]);

  const handleConfirmNavigation = () => {
    if (pendingNavigation) {
      setShowUnsavedDialog(false);
      navigate(pendingNavigation);
    }
  };

  const handleCancelNavigation = () => {
    setShowUnsavedDialog(false);
    setPendingNavigation(null);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const firstName = form.first_name.trim();
    const lastName = form.last_name.trim();
    if (!firstName) {
      setError('First name is required');
      return;
    }
    if (!lastName) {
      setError('Last name is required');
      return;
    }

    // Validate industry length
    if (form.industry.trim().length > 100) {
      setError('Industry must not exceed 100 characters');
      return;
    }

    // Validate next step description length
    if (form.next_step_description.trim().length > 1000) {
      setError('Next step description must not exceed 1000 characters');
      return;
    }

    if (!form.next_step_date) {
      setError('Next step date is required');
      return;
    }

    try {
      setLoading(true);

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
      };

      const response = await fetch(`${API_URL}/deals`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create deal');
      }

      const data = await response.json();
      setIsSubmitting(true);
      toast({
        title: 'Success',
        description: 'Deal created successfully',
      });
      navigate(`/deals/${data.deal.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Unsaved Changes Dialog */}
      <AlertDialog open={showUnsavedDialog} onOpenChange={setShowUnsavedDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Are you sure you want to leave this page? Your changes will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelNavigation}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmNavigation}>
              Leave Page
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/deals">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </Link>
        <div>
          <h2 className="text-2xl font-bold">Create Deal</h2>
          <p className="text-muted-foreground">Add a new deal to your pipeline</p>
        </div>
      </div>

      {/* Form */}
      <Card>
        <CardHeader>
          <CardTitle>Deal Information</CardTitle>
          <CardDescription>Enter the details for the new deal</CardDescription>
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
                  maxLength={255}
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
                  maxLength={100}
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

            {/* Actions */}
            <div className="flex items-center justify-end gap-4">
              <Link to="/deals">
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Link>
              <Button type="submit" disabled={loading}>
                <Save className="w-4 h-4 mr-2" />
                {loading ? 'Creating...' : 'Create Deal'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
