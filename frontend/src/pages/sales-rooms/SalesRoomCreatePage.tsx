import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_URL } from '@/lib/api';
import { PREDEFINED_STAKEHOLDERS, getDefaultSectionContent, type StakeholderSection } from '@/lib/sales-room-defaults';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowLeft, ArrowRight, Check, Building2, FileText, Palette, Users, Calendar, Lock, Image, Upload, Plus, X, Pencil, Sparkles } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Deal {
  id: string;
  name: string;
  company_name: string;
  industry: string;
  stage: string;
}

const TEMPLATE_TYPES = [
  { value: 'legacy_modernization', label: 'Legacy Modernization', description: 'For replacing outdated systems' },
  { value: 'cloud_migration', label: 'Cloud Migration', description: 'For moving to cloud infrastructure' },
  { value: 'staff_augmentation', label: 'Staff Augmentation', description: 'For team extension services' },
  { value: 'custom', label: 'Custom', description: 'Create from scratch' },
];

export default function SalesRoomCreatePage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loadingDeals, setLoadingDeals] = useState(true);

  // Form data
  const [selectedDealId, setSelectedDealId] = useState('');
  const [templateType, setTemplateType] = useState('custom');
  const [offerContent, setOfferContent] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [calendlyLink, setCalendlyLink] = useState('');
  const [pollEnabled, setPollEnabled] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('Does this proposal address your concerns?');
  const [expiryEnabled, setExpiryEnabled] = useState(false);
  const [expiryDays, setExpiryDays] = useState(7);
  const [passwordProtected, setPasswordProtected] = useState(false);
  const [password, setPassword] = useState('');
  const [brandingEnabled, setBrandingEnabled] = useState(false);
  const [logoUrl, setLogoUrl] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#2563eb');
  const [companyNameOverride, setCompanyNameOverride] = useState('');

  // Stakeholder selection
  const [selectedStakeholders, setSelectedStakeholders] = useState<{ key: string; label: string }[]>([]);
  const [customRoleInput, setCustomRoleInput] = useState('');

  // File upload & sections
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [sections, setSections] = useState<StakeholderSection[]>([]);

  // Section edit dialog
  const [editingSectionIdx, setEditingSectionIdx] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContentText, setEditContentText] = useState('');

  // Load deals for step 1
  useEffect(() => {
    const fetchDeals = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_URL}/deals?has_sales_room=false&limit=1000&sort_by=created_at&sort_order=desc`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (response.ok) {
          const data = await response.json();
          setDeals(data.deals || []);
        }
      } catch (err) {
        console.error('Error fetching deals:', err);
      } finally {
        setLoadingDeals(false);
      }
    };

    fetchDeals();
  }, []);

  const selectedDeal = deals.find(d => d.id === selectedDealId);

  // When stakeholders change, initialize default sections
  useEffect(() => {
    setSections(prev => {
      // Keep existing sections that still have a matching stakeholder
      const existingMap = new Map(prev.map(s => [s.key, s]));
      return selectedStakeholders.map(sh => {
        if (existingMap.has(sh.key)) {
          return existingMap.get(sh.key)!;
        }
        const defaults = getDefaultSectionContent(sh.key, templateType);
        return { key: sh.key, label: sh.label, title: defaults.title, content: defaults.content };
      });
    });
  }, [selectedStakeholders, templateType]);

  const toggleStakeholder = (sh: { key: string; label: string }) => {
    setSelectedStakeholders(prev => {
      const exists = prev.find(s => s.key === sh.key);
      if (exists) {
        return prev.filter(s => s.key !== sh.key);
      }
      return [...prev, sh];
    });
  };

  const addCustomRole = () => {
    const label = customRoleInput.trim();
    if (!label) return;
    const key = label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    if (selectedStakeholders.find(s => s.key === key)) {
      toast({ title: 'Already added', description: `${label} is already selected`, variant: 'destructive' });
      return;
    }
    setSelectedStakeholders(prev => [...prev, { key, label }]);
    setCustomRoleInput('');
  };

  const openSectionEditor = (idx: number) => {
    setEditingSectionIdx(idx);
    setEditTitle(sections[idx].title);
    setEditContentText(sections[idx].content);
  };

  const saveSectionEdit = () => {
    if (editingSectionIdx === null) return;
    setSections(prev => prev.map((s, i) =>
      i === editingSectionIdx ? { ...s, title: editTitle, content: editContentText } : s
    ));
    setEditingSectionIdx(null);
  };

  const canProceedStep1 = selectedDealId !== '';
  const canProceedStep2 = templateType !== '' && selectedStakeholders.length > 0;

  const handleNext = () => {
    if (step < 3) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleCreate = async () => {
    if (!selectedDealId) {
      toast({ title: 'Error', description: 'Please select a deal', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/sales-rooms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          deal_id: selectedDealId,
          template_type: templateType,
          offer_content: offerContent || null,
          sections: sections.length > 0 ? sections : null,
          video_url: videoUrl || null,
          calendly_link: calendlyLink || null,
          poll_enabled: pollEnabled,
          poll_question: pollEnabled ? pollQuestion : null,
          expires_at: expiryEnabled ? new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString() : null,
          password_protected: passwordProtected,
          password: passwordProtected ? password : null,
          branding: brandingEnabled ? {
            logo_url: logoUrl || undefined,
            primary_color: primaryColor,
            company_name: companyNameOverride || undefined,
          } : null,
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create Sales Room');
      }

      // If there's an attachment file, upload it after creating
      if (attachmentFile && data.salesRoom?.id) {
        const formData = new FormData();
        formData.append('attachment', attachmentFile);
        formData.append('stakeholders', JSON.stringify(selectedStakeholders));

        await fetch(`${API_URL}/sales-rooms/${data.salesRoom.id}/attachment`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
      }

      toast({ title: 'Success!', description: 'Sales Room created successfully' });
      navigate(`/sales-rooms/${data.salesRoom.id}`);
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to create Sales Room',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/sales-rooms')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Create Sales Room</h1>
          <p className="text-muted-foreground">Step {step} of 3</p>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center justify-between px-4">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
              s < step ? 'bg-green-500 text-white' :
              s === step ? 'bg-primary text-primary-foreground' :
              'bg-muted text-muted-foreground'
            }`}>
              {s < step ? <Check className="h-5 w-5" /> : s}
            </div>
            {s < 3 && (
              <div className={`w-24 md:w-32 h-1 mx-2 ${s < step ? 'bg-green-500' : 'bg-muted'}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Select Deal */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Select Deal
            </CardTitle>
            <CardDescription>Choose the deal this Sales Room will be for</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingDeals ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : deals.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground mb-4">No deals available without a Sales Room.</p>
                <Button variant="outline" onClick={() => navigate('/deals/new')}>
                  Create a Deal First
                </Button>
              </div>
            ) : (
              <div className="grid gap-3 max-h-96 overflow-y-auto">
                {deals.map((deal) => (
                  <div
                    key={deal.id}
                    onClick={() => setSelectedDealId(deal.id)}
                    className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                      selectedDealId === deal.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{deal.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {deal.company_name && `${deal.company_name} · `}{deal.industry} • {deal.stage.replace(/_/g, ' ')}
                        </p>
                      </div>
                      {selectedDealId === deal.id && (
                        <Check className="h-5 w-5 text-primary" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end pt-4">
              <Button onClick={handleNext} disabled={!canProceedStep1}>
                Next
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Template + Stakeholders */}
      {step === 2 && (
        <div className="space-y-6">
          {/* Template Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="h-5 w-5" />
                Select Template
              </CardTitle>
              <CardDescription>Choose a template for your Sales Room</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-2">
                {TEMPLATE_TYPES.map((template) => (
                  <div
                    key={template.value}
                    onClick={() => setTemplateType(template.value)}
                    className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                      templateType === template.value
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium">{template.label}</p>
                        <p className="text-sm text-muted-foreground">{template.description}</p>
                      </div>
                      {templateType === template.value && (
                        <Check className="h-5 w-5 text-primary" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Stakeholder Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Target Stakeholders
              </CardTitle>
              <CardDescription>Select who this Sales Room is addressed to (minimum 1)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {PREDEFINED_STAKEHOLDERS.map((sh) => {
                  const isSelected = selectedStakeholders.some(s => s.key === sh.key);
                  return (
                    <button
                      key={sh.key}
                      onClick={() => toggleStakeholder(sh)}
                      className={`px-3 py-2 rounded-full text-sm font-medium border transition-colors ${
                        isSelected
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background text-foreground border-border hover:border-primary/50'
                      }`}
                    >
                      {isSelected && <Check className="h-3 w-3 inline mr-1" />}
                      {sh.label}
                    </button>
                  );
                })}
              </div>

              {/* Custom role input */}
              <div className="flex gap-2">
                <Input
                  placeholder="Add custom role..."
                  value={customRoleInput}
                  onChange={(e) => setCustomRoleInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addCustomRole()}
                  className="flex-1"
                />
                <Button variant="outline" onClick={addCustomRole} disabled={!customRoleInput.trim()}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
              </div>

              {/* Selected stakeholders preview */}
              {selectedStakeholders.length > 0 && (
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground mb-2">Selected ({selectedStakeholders.length}):</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedStakeholders.map((sh) => (
                      <span key={sh.key} className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded text-sm">
                        {sh.label}
                        <button onClick={() => toggleStakeholder(sh)} className="hover:text-destructive">
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button variant="outline" onClick={handleBack}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <Button onClick={handleNext} disabled={!canProceedStep2}>
              Next
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Content & Options */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Content & Options
            </CardTitle>
            <CardDescription>Add your offer content and integrations</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Summary */}
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground mb-1">Creating Sales Room for:</p>
              <p className="font-medium">{selectedDeal?.name}</p>
              {selectedDeal?.company_name && (
                <p className="text-sm text-muted-foreground">{selectedDeal.company_name}</p>
              )}
              <p className="text-sm text-muted-foreground capitalize">
                {templateType.replace(/_/g, ' ')} template • {selectedStakeholders.map(s => s.label).join(', ')}
              </p>
            </div>

            {/* Offer Document Upload */}
            <div className="space-y-3 p-4 border rounded-lg">
              <Label className="flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Offer Document (PDF, DOCX)
              </Label>
              <p className="text-sm text-muted-foreground">
                Upload your offer document — AI will generate personalized sections for each stakeholder
              </p>
              <div className="flex items-center gap-3">
                <Input
                  type="file"
                  accept=".pdf,.docx,.doc,.txt"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setAttachmentFile(file);
                  }}
                  className="flex-1"
                />
                {attachmentFile && (
                  <Button variant="ghost" size="icon" onClick={() => setAttachmentFile(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
              {attachmentFile && (
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <Check className="h-4 w-4" />
                  <span>{attachmentFile.name} ({(attachmentFile.size / 1024 / 1024).toFixed(1)} MB)</span>
                  <span className="text-muted-foreground">— AI will generate sections on create</span>
                </div>
              )}
            </div>

            {/* Stakeholder Sections */}
            {sections.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    Stakeholder Sections
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {attachmentFile ? 'AI will regenerate on create' : 'Using default content'}
                  </p>
                </div>
                {sections.map((section, idx) => (
                  <div key={section.key} className="p-3 border rounded-lg flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{section.label}</p>
                      <p className="text-sm text-muted-foreground truncate">{section.title}</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => openSectionEditor(idx)}>
                      <Pencil className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Offer Content */}
            <div className="space-y-2">
              <Label htmlFor="offerContent">Offer Content (Optional)</Label>
              <Textarea
                id="offerContent"
                placeholder="Enter your proposal content here..."
                value={offerContent}
                onChange={(e) => setOfferContent(e.target.value)}
                rows={4}
              />
            </div>

            {/* Video URL */}
            <div className="space-y-2">
              <Label htmlFor="videoUrl">Video URL (Loom, YouTube)</Label>
              <Input
                id="videoUrl"
                type="url"
                placeholder="https://www.loom.com/share/..."
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
              />
            </div>

            {/* Calendly Link */}
            <div className="space-y-2">
              <Label htmlFor="calendlyLink">Calendly Link</Label>
              <Input
                id="calendlyLink"
                type="url"
                placeholder="https://calendly.com/..."
                value={calendlyLink}
                onChange={(e) => setCalendlyLink(e.target.value)}
              />
            </div>

            {/* Consensus Poll */}
            <div className="space-y-4 p-4 border rounded-lg">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="pollEnabled" className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Stakeholder Consensus Poll
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Add a feedback survey for stakeholders
                  </p>
                </div>
                <Switch
                  id="pollEnabled"
                  checked={pollEnabled}
                  onCheckedChange={setPollEnabled}
                />
              </div>
              {pollEnabled && (
                <div className="space-y-2 pt-2">
                  <Label htmlFor="pollQuestion">Poll Question</Label>
                  <Input
                    id="pollQuestion"
                    placeholder="Does this proposal address your concerns?"
                    value={pollQuestion}
                    onChange={(e) => setPollQuestion(e.target.value)}
                  />
                </div>
              )}
            </div>

            {/* Link Expiry */}
            <div className="space-y-4 p-4 border rounded-lg">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="expiryEnabled" className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Link Expiry
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Set when the Sales Room link expires
                  </p>
                </div>
                <Switch
                  id="expiryEnabled"
                  checked={expiryEnabled}
                  onCheckedChange={setExpiryEnabled}
                />
              </div>
              {expiryEnabled && (
                <div className="space-y-2 pt-2">
                  <Label htmlFor="expiryDays">Expires in (days)</Label>
                  <Input
                    id="expiryDays"
                    type="number"
                    min="1"
                    max="365"
                    value={expiryDays}
                    onChange={(e) => setExpiryDays(parseInt(e.target.value) || 7)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Link will expire on {new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toLocaleDateString()}
                  </p>
                </div>
              )}
            </div>

            {/* Password Protection */}
            <div className="space-y-4 p-4 border rounded-lg">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="passwordProtected" className="flex items-center gap-2">
                    <Lock className="h-4 w-4" />
                    Password Protection
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Require a password to view the Sales Room
                  </p>
                </div>
                <Switch
                  id="passwordProtected"
                  checked={passwordProtected}
                  onCheckedChange={setPasswordProtected}
                />
              </div>
              {passwordProtected && (
                <div className="space-y-2 pt-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter a secure password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              )}
            </div>

            {/* Custom Branding */}
            <div className="space-y-4 p-4 border rounded-lg">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="brandingEnabled" className="flex items-center gap-2">
                    <Image className="h-4 w-4" />
                    Custom Branding
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Add your client's logo and brand colors
                  </p>
                </div>
                <Switch
                  id="brandingEnabled"
                  checked={brandingEnabled}
                  onCheckedChange={setBrandingEnabled}
                />
              </div>
              {brandingEnabled && (
                <div className="space-y-4 pt-2">
                  <div className="space-y-2">
                    <Label htmlFor="logoUrl">Logo URL</Label>
                    <Input
                      id="logoUrl"
                      type="url"
                      placeholder="https://example.com/logo.png"
                      value={logoUrl}
                      onChange={(e) => setLogoUrl(e.target.value)}
                    />
                    {logoUrl && (
                      <div className="mt-2 p-2 bg-muted rounded-lg inline-block">
                        <img src={logoUrl} alt="Logo preview" className="h-12 w-auto object-contain" onError={(e) => e.currentTarget.style.display = 'none'} />
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="primaryColor">Brand Color</Label>
                    <div className="flex items-center gap-2">
                      <input
                        id="primaryColor"
                        type="color"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        className="w-10 h-10 rounded border cursor-pointer"
                      />
                      <Input
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        placeholder="#2563eb"
                        className="flex-1"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="companyNameOverride">Company Name Override (Optional)</Label>
                    <Input
                      id="companyNameOverride"
                      placeholder="Leave blank to use deal company name"
                      value={companyNameOverride}
                      onChange={(e) => setCompanyNameOverride(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={handleBack}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Button onClick={handleCreate} disabled={loading || (passwordProtected && !password)}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Create Sales Room
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Section Edit Dialog */}
      <Dialog open={editingSectionIdx !== null} onOpenChange={(open) => { if (!open) setEditingSectionIdx(null); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              Edit Section — {editingSectionIdx !== null ? sections[editingSectionIdx]?.label : ''}
            </DialogTitle>
            <DialogDescription>
              Customize the section content for this stakeholder. Use Markdown for formatting.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 flex-1 overflow-y-auto">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Section title"
              />
            </div>
            <div className="space-y-2">
              <Label>Content (Markdown)</Label>
              <Textarea
                value={editContentText}
                onChange={(e) => setEditContentText(e.target.value)}
                placeholder="Section content..."
                className="min-h-[250px] font-mono text-sm"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setEditingSectionIdx(null)}>
              Cancel
            </Button>
            <Button onClick={saveSectionEdit}>
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
