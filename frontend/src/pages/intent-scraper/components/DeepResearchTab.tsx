import { useState, useEffect, useRef } from 'react';
import { API_URL } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Search, Loader2, Linkedin, Twitter, Github, MessageCircle, Facebook, Play, Settings, ChevronDown, ChevronUp } from 'lucide-react';
import ResearchPanel from './ResearchPanel';

interface Lead {
  id: string;
  name: string;
  company_name: string;
  industry: string | null;
  confidence_score: number;
  status: string;
}

interface DeepResearchTabProps {
  leads: Lead[];
}

const PLATFORM_CONFIG = [
  { key: 'linkedin', label: 'LinkedIn', icon: Linkedin, color: 'text-blue-600' },
  { key: 'twitter', label: 'X / Twitter', icon: Twitter, color: 'text-sky-500' },
  { key: 'github', label: 'GitHub', icon: Github, color: 'text-gray-800' },
  { key: 'reddit', label: 'Reddit', icon: MessageCircle, color: 'text-orange-500' },
  { key: 'facebook', label: 'Facebook', icon: Facebook, color: 'text-blue-500' },
];

export default function DeepResearchTab({ leads }: DeepResearchTabProps) {
  const [selectedLeadId, setSelectedLeadId] = useState<string>('');
  const [searchFilter, setSearchFilter] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [availablePlatforms, setAvailablePlatforms] = useState<string[]>([]);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [hints, setHints] = useState({ linkedin_url: '', twitter_handle: '', github_username: '' });
  const [researchStatus, setResearchStatus] = useState<string>('none');
  const [researching, setResearching] = useState(false);
  const [researchData, setResearchData] = useState<any>(null);
  const [socialProfiles, setSocialProfiles] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { toast } = useToast();

  const token = localStorage.getItem('token');
  const selectedLead = leads.find(l => l.id === selectedLeadId);

  // Fetch available platforms on mount
  useEffect(() => {
    async function fetchPlatforms() {
      try {
        const res = await fetch(`${API_URL}/research/platforms`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setAvailablePlatforms(data.platforms);
          setSelectedPlatforms(data.platforms);
        }
      } catch { /* ignore */ }
    }
    fetchPlatforms();
  }, []);

  // Fetch research results when lead changes
  useEffect(() => {
    if (selectedLeadId) {
      fetchResearchResults();
    } else {
      setResearchData(null);
      setSocialProfiles([]);
      setMessages([]);
      setResearchStatus('none');
    }
  }, [selectedLeadId]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  async function fetchResearchResults() {
    try {
      const res = await fetch(`${API_URL}/research/${selectedLeadId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setResearchData(data.research);
      setSocialProfiles(data.socialProfiles || []);
      setMessages(data.messages || []);
      setResearchStatus(data.research?.status || 'none');
    } catch { /* ignore */ }
  }

  async function startResearch() {
    setResearching(true);
    try {
      const body: any = {};
      if (selectedPlatforms.length > 0 && selectedPlatforms.length < availablePlatforms.length) {
        body.platforms = selectedPlatforms;
      }
      if (hints.linkedin_url) body.linkedin_url = hints.linkedin_url;
      if (hints.twitter_handle) body.twitter_handle = hints.twitter_handle;
      if (hints.github_username) body.github_username = hints.github_username;

      const res = await fetch(`${API_URL}/research/${selectedLeadId}/start`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to start research');
      }

      setResearchStatus('running');
      toast({ title: 'Research started', description: 'Gathering data from social media platforms...' });

      // Start polling
      pollingRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(`${API_URL}/research/${selectedLeadId}/status`, {
            headers: { 'Authorization': `Bearer ${token}` },
          });
          if (!statusRes.ok) return;
          const statusData = await statusRes.json();
          setResearchStatus(statusData.status);

          if (statusData.status === 'completed' || statusData.status === 'partial' || statusData.status === 'failed') {
            if (pollingRef.current) clearInterval(pollingRef.current);
            pollingRef.current = null;
            setResearching(false);
            fetchResearchResults();

            if (statusData.status === 'failed') {
              toast({ title: 'Research failed', description: 'Could not retrieve data from any platform.', variant: 'destructive' });
            } else {
              toast({ title: 'Research complete', description: `Data gathered from ${statusData.platforms_succeeded?.length || 0} platforms.` });
            }
          }
        } catch { /* ignore polling errors */ }
      }, 2000);

    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
      setResearching(false);
    }
  }

  function togglePlatform(platform: string) {
    setSelectedPlatforms(prev =>
      prev.includes(platform)
        ? prev.filter(p => p !== platform)
        : [...prev, platform]
    );
  }

  const filteredLeads = leads.filter(l =>
    l.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
    l.company_name?.toLowerCase().includes(searchFilter.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Lead selector */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Select Lead to Research</CardTitle>
          <CardDescription>Choose a lead from your discovery results to perform deep social media research.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchFilter}
              onChange={e => setSearchFilter(e.target.value)}
              placeholder="Filter leads..."
              className="pl-9"
            />
          </div>

          <div className="max-h-48 overflow-y-auto border rounded-md">
            {filteredLeads.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground text-center">
                {leads.length === 0 ? 'No leads found. Run a discovery search first.' : 'No leads match your filter.'}
              </p>
            ) : (
              filteredLeads.map(lead => (
                <button
                  key={lead.id}
                  onClick={() => setSelectedLeadId(lead.id)}
                  className={`w-full flex items-center justify-between p-3 text-left border-b last:border-b-0 transition-colors hover:bg-muted/50 ${
                    selectedLeadId === lead.id ? 'bg-primary/5 border-l-2 border-l-primary' : ''
                  }`}
                >
                  <div>
                    <span className="font-medium text-sm">{lead.name}</span>
                    {lead.company_name && (
                      <span className="text-xs text-muted-foreground ml-2">{lead.company_name}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {lead.confidence_score}%
                    </Badge>
                  </div>
                </button>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Research controls */}
      {selectedLead && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">{selectedLead.name}</h3>
                <p className="text-sm text-muted-foreground">
                  {selectedLead.company_name && `${selectedLead.company_name} · `}{selectedLead.industry || 'Unknown industry'} &middot; Confidence: {selectedLead.confidence_score}%
                </p>
              </div>
              <Button
                onClick={startResearch}
                disabled={researching || selectedPlatforms.length === 0}
              >
                {researching ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Researching...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Start Research
                  </>
                )}
              </Button>
            </div>

            {/* Platform selection */}
            <div className="flex flex-wrap gap-2">
              {PLATFORM_CONFIG.map(p => {
                const Icon = p.icon;
                const isAvailable = availablePlatforms.includes(p.key);
                const isSelected = selectedPlatforms.includes(p.key);
                return (
                  <button
                    key={p.key}
                    onClick={() => isAvailable && togglePlatform(p.key)}
                    disabled={!isAvailable}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition-colors ${
                      !isAvailable
                        ? 'opacity-40 cursor-not-allowed border-border'
                        : isSelected
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border hover:border-primary/50'
                    }`}
                    title={!isAvailable ? `${p.label} API key not configured` : undefined}
                  >
                    <Icon className={`h-3.5 w-3.5 ${isAvailable ? p.color : ''}`} />
                    {p.label}
                  </button>
                );
              })}
            </div>

            {/* Advanced settings toggle */}
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Settings className="h-3 w-3" />
              Advanced hints
              {showAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>

            {showAdvanced && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs">LinkedIn URL</Label>
                  <Input
                    value={hints.linkedin_url}
                    onChange={e => setHints(h => ({ ...h, linkedin_url: e.target.value }))}
                    placeholder="https://linkedin.com/company/..."
                    className="text-xs h-8"
                  />
                </div>
                <div>
                  <Label className="text-xs">Twitter Handle</Label>
                  <Input
                    value={hints.twitter_handle}
                    onChange={e => setHints(h => ({ ...h, twitter_handle: e.target.value }))}
                    placeholder="@company"
                    className="text-xs h-8"
                  />
                </div>
                <div>
                  <Label className="text-xs">GitHub Username</Label>
                  <Input
                    value={hints.github_username}
                    onChange={e => setHints(h => ({ ...h, github_username: e.target.value }))}
                    placeholder="org-name"
                    className="text-xs h-8"
                  />
                </div>
              </div>
            )}

            {/* Running status indicator */}
            {researching && (
              <div className="flex items-center gap-2 p-3 rounded-md bg-muted/50">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-sm">Researching across {selectedPlatforms.length} platforms...</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Research results */}
      {selectedLeadId && researchData && (researchStatus === 'completed' || researchStatus === 'partial' || researchStatus === 'failed') && (
        <ResearchPanel
          leadId={selectedLeadId}
          research={researchData}
          socialProfiles={socialProfiles}
          messages={messages}
          onRefresh={fetchResearchResults}
        />
      )}
    </div>
  );
}
