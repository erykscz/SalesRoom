import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowLeft, ArrowRight, Check, Building2, FileText, Palette, Users, Calendar, Lock, Image } from 'lucide-react';
import { Switch } from '@/components/ui/switch';

interface Deal {
  id: string;
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

  // Load deals for step 1
  useEffect(() => {
    const fetchDeals = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/deals?has_sales_room=false', {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (response.ok) {
          const data = await response.json();
          // Filter out deals that already have sales rooms
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

  const canProceedStep1 = selectedDealId !== '';
  const canProceedStep2 = templateType !== '';
  const canProceedStep3 = true; // Offer content is optional

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
      const response = await fetch('/api/sales-rooms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          deal_id: selectedDealId,
          template_type: templateType,
          offer_content: offerContent || null,
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
              <div className="grid gap-3">
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
                        <p className="font-medium">{deal.company_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {deal.industry} • {deal.stage.replace(/_/g, ' ')}
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

      {/* Step 2: Select Template */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5" />
              Select Template
            </CardTitle>
            <CardDescription>Choose a template for your Sales Room</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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

            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={handleBack}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Button onClick={handleNext} disabled={!canProceedStep2}>
                Next
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
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
              <p className="font-medium">{selectedDeal?.company_name}</p>
              <p className="text-sm text-muted-foreground capitalize">{templateType.replace(/_/g, ' ')} template</p>
            </div>

            {/* Offer Content */}
            <div className="space-y-2">
              <Label htmlFor="offerContent">Offer Content (Optional)</Label>
              <Textarea
                id="offerContent"
                placeholder="Enter your proposal content here..."
                value={offerContent}
                onChange={(e) => setOfferContent(e.target.value)}
                rows={6}
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
    </div>
  );
}
