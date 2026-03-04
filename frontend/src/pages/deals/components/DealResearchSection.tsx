import { useState, useEffect, useRef } from 'react';
import { API_URL } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  Microscope, Play, Loader2, Linkedin, Twitter, Github, MessageCircle, Facebook,
  ChevronDown, ChevronUp, ExternalLink, Users, FileText, Sparkles, Copy, Star,
  Trash2, Mail, Check, RefreshCw, Globe
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface DealResearchSectionProps {
  dealId: string;
  companyName: string;
  companyUrl?: string;
  personName?: string;
  linkedinUrl?: string;
  onResearchComplete?: () => void;
}

interface SocialProfile {
  id: string;
  platform: string;
  profile_url: string | null;
  username: string | null;
  display_name: string | null;
  bio: string | null;
  followers_count: number | null;
  profile_data: Record<string, unknown> | null;
}

interface GeneratedMessage {
  id: string;
  channel: string;
  tone: string;
  subject_line: string | null;
  message_body: string;
  message_length: number;
  is_favorite: number;
  created_at: string;
}

const PLATFORM_CONFIG = [
  { key: 'linkedin', label: 'LinkedIn', icon: Linkedin, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950' },
  { key: 'github', label: 'GitHub', icon: Github, color: 'text-gray-800 dark:text-gray-200', bg: 'bg-gray-50 dark:bg-gray-900' },
  { key: 'website', label: 'Website', icon: Globe, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-950' },
  { key: 'twitter', label: 'X (Twitter)', icon: Twitter, color: 'text-sky-500', bg: 'bg-sky-50 dark:bg-sky-950' },
  { key: 'reddit', label: 'Reddit', icon: MessageCircle, color: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-950' },
  { key: 'facebook', label: 'Facebook', icon: Facebook, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-950' },
];

const CHANNELS = [
  { value: 'cold_email', label: 'Email', icon: Mail },
  { value: 'linkedin_inmail', label: 'InMail', icon: Linkedin },
  { value: 'linkedin_connection', label: 'Connection Request', icon: Linkedin },
  { value: 'twitter_dm', label: 'X DM', icon: Twitter },
  { value: 'generic', label: 'Generic', icon: MessageCircle },
];

const TONES = [
  { value: 'formal', label: 'Formal' },
  { value: 'casual', label: 'Casual' },
  { value: 'provocative', label: 'Bold' },
  { value: 'consultative', label: 'Advisory' },
];

function formatFollowers(count: number | null): string {
  if (count === null || count === undefined) return '-';
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return count.toString();
}

export default function DealResearchSection({ dealId, companyName, companyUrl, personName, linkedinUrl, onResearchComplete }: DealResearchSectionProps) {
  const [availablePlatforms, setAvailablePlatforms] = useState<string[]>([]);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [researchStatus, setResearchStatus] = useState<string>('none');
  const [researching, setResearching] = useState(false);
  const [researchData, setResearchData] = useState<any>(null);
  const [socialProfiles, setSocialProfiles] = useState<SocialProfile[]>([]);
  const [messages, setMessages] = useState<GeneratedMessage[]>([]);
  const [hints, setHints] = useState({ linkedin_url: '', twitter_handle: '', github_username: '', company_url: '' });
  const [showMessageGen, setShowMessageGen] = useState(false);
  const [showMessages, setShowMessages] = useState(true);
  const [showHints, setShowHints] = useState(false);
  const [channel, setChannel] = useState('cold_email');
  const [tone, setTone] = useState('consultative');
  const [context, setContext] = useState('');
  const [generating, setGenerating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { toast } = useToast();

  const token = localStorage.getItem('token');

  useEffect(() => {
    if (companyUrl) {
      setHints(h => ({ ...h, company_url: companyUrl }));
    }
  }, [companyUrl]);

  useEffect(() => {
    if (linkedinUrl) {
      setHints(h => ({ ...h, linkedin_url: linkedinUrl }));
    }
  }, [linkedinUrl]);

  useEffect(() => {
    fetchPlatforms();
    fetchResearchResults();
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [dealId]);

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

  async function fetchResearchResults() {
    try {
      const res = await fetch(`${API_URL}/research/deal/${dealId}`, {
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
      if (hints.company_url) body.company_url = hints.company_url;

      const res = await fetch(`${API_URL}/research/deal/${dealId}/start`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to start research');
      }

      setResearchStatus('running');
      toast({ title: 'Research started', description: `Researching ${personName || companyName}...` });

      pollingRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(`${API_URL}/research/deal/${dealId}/status`, {
            headers: { 'Authorization': `Bearer ${token}` },
          });
          if (!statusRes.ok) return;
          const statusData = await statusRes.json();
          setResearchStatus(statusData.status);

          if (['completed', 'partial', 'failed'].includes(statusData.status)) {
            if (pollingRef.current) clearInterval(pollingRef.current);
            pollingRef.current = null;
            setResearching(false);
            fetchResearchResults();
            onResearchComplete?.();
            toast({
              title: statusData.status === 'failed' ? 'Research failed' : 'Research complete',
              description: statusData.status === 'failed'
                ? 'Could not retrieve data from any platform.'
                : `Data from ${statusData.platforms_succeeded?.length || 0} platforms.`,
              variant: statusData.status === 'failed' ? 'destructive' : 'default',
            });
          }
        } catch { /* ignore */ }
      }, 2000);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
      setResearching(false);
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await fetch(`${API_URL}/research/deal/${dealId}/generate-message`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, tone, additional_context: context || undefined }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error); }
      toast({ title: 'Message generated' });
      fetchResearchResults();
      setShowMessages(true);
    } catch (err: any) {
      toast({ title: 'Generation failed', description: err.message, variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  }

  async function handleCopy(msg: GeneratedMessage) {
    const text = msg.subject_line ? `Subject: ${msg.subject_line}\n\n${msg.message_body}` : msg.message_body;
    await navigator.clipboard.writeText(text);
    setCopiedId(msg.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function handleFavorite(id: string) {
    await fetch(`${API_URL}/research/messages/${id}/favorite`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } });
    fetchResearchResults();
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`${API_URL}/research/messages/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
      if (!res.ok) throw new Error('Failed to delete message');
      toast({ title: 'Message deleted' });
      fetchResearchResults();
    } catch {
      toast({ title: 'Failed to delete message', variant: 'destructive' });
    }
  }

  async function handleDeleteProfile(id: string) {
    await fetch(`${API_URL}/research/profiles/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
    setSocialProfiles(prev => prev.filter(p => p.id !== id));
  }

  function togglePlatform(p: string) {
    setSelectedPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  }

  const hasResults = researchStatus === 'completed' || researchStatus === 'partial';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Microscope className="h-5 w-5" />
              Deep Research
            </CardTitle>
            <CardDescription>
              {hasResults
                ? `${socialProfiles.length} profiles found`
                : `Research ${personName || companyName} across social platforms`}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={startResearch} disabled={researching || selectedPlatforms.length === 0}>
              {researching ? (
                <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Researching...</>
              ) : (
                <><Play className="h-4 w-4 mr-1" />RESEARCH</>
              )}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Platform selector + hints (before first research or for re-run) */}
        {!hasResults && !researching && (
          <div className="space-y-4">
            {/* Platforms */}
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">Platforms</Label>
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
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-colors ${
                        !isAvailable ? 'opacity-40 cursor-not-allowed' : isSelected ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/50'
                      }`}
                    >
                      <Icon className={`h-4 w-4 ${isAvailable ? p.color : ''}`} />
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Profile hints - always visible */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1">
                  <Linkedin className="h-3 w-3 text-blue-600" />
                  LinkedIn Profile URL
                </Label>
                <Input
                  value={hints.linkedin_url}
                  onChange={e => setHints(h => ({...h, linkedin_url: e.target.value}))}
                  placeholder="https://linkedin.com/in/..."
                  className="text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1">
                  <Globe className="h-3 w-3 text-green-600" />
                  Company Website
                </Label>
                <Input
                  value={hints.company_url}
                  onChange={e => setHints(h => ({...h, company_url: e.target.value}))}
                  placeholder="https://acme.com"
                  className="text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1">
                  <Twitter className="h-3 w-3 text-sky-500" />
                  X (Twitter) Handle
                </Label>
                <Input
                  value={hints.twitter_handle}
                  onChange={e => setHints(h => ({...h, twitter_handle: e.target.value}))}
                  placeholder="@handle"
                  className="text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1">
                  <Github className="h-3 w-3" />
                  GitHub Organization
                </Label>
                <Input
                  value={hints.github_username}
                  onChange={e => setHints(h => ({...h, github_username: e.target.value}))}
                  placeholder="org-name"
                  className="text-sm"
                />
              </div>
            </div>
          </div>
        )}

        {/* Running indicator */}
        {researching && (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-primary/5 border border-primary/20">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <div>
              <p className="font-medium text-sm">Researching {personName || companyName}...</p>
              <p className="text-xs text-muted-foreground">Checking {selectedPlatforms.length} platforms. This usually takes 10-30 seconds.</p>
            </div>
          </div>
        )}

        {/* Results */}
        {hasResults && (
          <>
            {/* Editable hints + platform selector for re-run */}
            <div>
              <button
                onClick={() => setShowHints(!showHints)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2"
              >
                {showHints ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                Research Sources & Hints
              </button>
              {showHints && (
                <div className="space-y-4 p-3 border rounded-lg bg-muted/30">
                  {/* Platform selector */}
                  <div>
                    <Label className="text-xs text-muted-foreground mb-2 block">Platforms</Label>
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
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-colors ${
                              !isAvailable ? 'opacity-40 cursor-not-allowed' : isSelected ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/50'
                            }`}
                          >
                            <Icon className={`h-4 w-4 ${isAvailable ? p.color : ''}`} />
                            {p.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Hint fields */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs flex items-center gap-1">
                        <Linkedin className="h-3 w-3 text-blue-600" />
                        LinkedIn Profile URL
                      </Label>
                      <Input
                        value={hints.linkedin_url}
                        onChange={e => setHints(h => ({...h, linkedin_url: e.target.value}))}
                        placeholder="https://linkedin.com/in/..."
                        className="text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs flex items-center gap-1">
                        <Globe className="h-3 w-3 text-green-600" />
                        Company Website
                      </Label>
                      <Input
                        value={hints.company_url}
                        onChange={e => setHints(h => ({...h, company_url: e.target.value}))}
                        placeholder="https://acme.com"
                        className="text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs flex items-center gap-1">
                        <Twitter className="h-3 w-3 text-sky-500" />
                        X (Twitter) Handle
                      </Label>
                      <Input
                        value={hints.twitter_handle}
                        onChange={e => setHints(h => ({...h, twitter_handle: e.target.value}))}
                        placeholder="@handle"
                        className="text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs flex items-center gap-1">
                        <Github className="h-3 w-3" />
                        GitHub Organization
                      </Label>
                      <Input
                        value={hints.github_username}
                        onChange={e => setHints(h => ({...h, github_username: e.target.value}))}
                        placeholder="org-name"
                        className="text-sm"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button size="sm" variant="outline" onClick={startResearch} disabled={researching || selectedPlatforms.length === 0}>
                      <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${researching ? 'animate-spin' : ''}`} />
                      Re-run with updated hints
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Social profiles */}
            {socialProfiles.length > 0 && (
              <div>
                <Label className="text-xs text-muted-foreground mb-2 block">Found Profiles</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {socialProfiles.map(sp => {
                    const conf = PLATFORM_CONFIG.find(p => p.key === sp.platform);
                    const Icon = conf?.icon || MessageCircle;
                    return (
                      <div key={sp.id} className={`flex items-start gap-3 p-3 rounded-lg border ${conf?.bg || 'bg-muted'} group`}>
                        <Icon className={`h-5 w-5 mt-0.5 flex-shrink-0 ${conf?.color || ''}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">{sp.display_name || sp.username}</span>
                            {sp.profile_data && (sp.profile_data as Record<string, unknown>)?._source === 'lix_import' && (
                              <Badge variant="outline" className="text-xs flex-shrink-0 text-green-600 border-green-300">
                                Lix IT
                              </Badge>
                            )}
                            {sp.followers_count !== null && (
                              <Badge variant="secondary" className="text-xs flex-shrink-0">
                                <Users className="h-3 w-3 mr-1" />{formatFollowers(sp.followers_count)}
                              </Badge>
                            )}
                          </div>
                          {sp.bio && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{sp.bio}</p>}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {sp.profile_url && (
                            <a href={sp.profile_url} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors" />
                            </a>
                          )}
                          <button
                            onClick={() => handleDeleteProfile(sp.id)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
                            title="Remove profile"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive transition-colors" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Research summary */}
            {researchData?.research_summary && (
              <div className="p-4 rounded-lg bg-muted/50 border">
                <p className="text-sm font-medium mb-2 flex items-center gap-1.5">
                  <FileText className="h-4 w-4" />
                  Podsumowanie AI
                </p>
                <div className="text-sm text-muted-foreground leading-relaxed space-y-2">
                  {researchData.research_summary.split('\n').map((line: string, i: number) => {
                    const trimmed = line.trim();
                    if (!trimmed) return null;
                    const boldMatch = trimmed.match(/^\*\*(.+?)\*\*(.*)$/);
                    const renderWithBadges = (text: string) => {
                      const parts = text.split(/(\[(?:LinkedIn|Twitter|GitHub|Reddit|Facebook|Website)\])/g);
                      const badgeColors: Record<string, string> = {
                        '[LinkedIn]': 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
                        '[Twitter]': 'bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300',
                        '[GitHub]': 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
                        '[Reddit]': 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
                        '[Facebook]': 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300',
                        '[Website]': 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
                      };
                      return parts.map((part, j) =>
                        badgeColors[part]
                          ? <span key={j} className={`${badgeColors[part]} text-xs font-medium px-1.5 py-0.5 rounded-full mx-0.5 inline-block`}>{part.slice(1, -1)}</span>
                          : <span key={j}>{part}</span>
                      );
                    };
                    if (boldMatch) {
                      return (
                        <div key={i}>
                          <p className="font-semibold text-foreground mt-2 mb-0.5">{boldMatch[1]}</p>
                          {boldMatch[2] && <p>{renderWithBadges(boldMatch[2])}</p>}
                        </div>
                      );
                    }
                    return <p key={i}>{renderWithBadges(trimmed)}</p>;
                  })}
                </div>
              </div>
            )}

            {/* Message Generation */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4" />
                  Generate Outreach Message
                </p>
                <Button size="sm" variant="ghost" onClick={() => setShowMessageGen(!showMessageGen)}>
                  {showMessageGen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </div>

              {showMessageGen && (
                <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1.5 block">Channel</Label>
                    <div className="flex flex-wrap gap-2">
                      {CHANNELS.map(ch => (
                        <button key={ch.value} onClick={() => setChannel(ch.value)}
                          className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${channel === ch.value ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/50'}`}>
                          {ch.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1.5 block">Tone</Label>
                    <div className="flex flex-wrap gap-2">
                      {TONES.map(t => (
                        <button key={t.value} onClick={() => setTone(t.value)}
                          className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${tone === t.value ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/50'}`}>
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Additional Context</Label>
                    <Textarea
                      value={context}
                      onChange={e => setContext(e.target.value)}
                      placeholder="Any specific talking points, offer details, or context..."
                      rows={2}
                      className="text-sm"
                    />
                  </div>
                  <Button onClick={handleGenerate} disabled={generating} className="w-full">
                    {generating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating...</> : <><Sparkles className="h-4 w-4 mr-2" />Generate Message</>}
                  </Button>
                </div>
              )}
            </div>

            {/* Generated messages */}
            {messages.length > 0 && (
              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium">
                    Generated Messages ({messages.length})
                  </p>
                  <Button size="sm" variant="ghost" onClick={() => setShowMessages(!showMessages)}>
                    {showMessages ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                </div>
                {showMessages && (
                  <div className="space-y-3">
                    {messages.map(msg => (
                      <div key={msg.id} className={`p-4 border rounded-lg ${msg.is_favorite ? 'border-yellow-300 bg-yellow-50/30 dark:bg-yellow-950/20' : 'bg-background'}`}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs capitalize">{msg.channel.replace(/_/g, ' ')}</Badge>
                            <Badge variant="secondary" className="text-xs capitalize">{msg.tone}</Badge>
                          </div>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleCopy(msg)}>
                              {copiedId === msg.id ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleFavorite(msg.id)}>
                              <Star className={`h-3.5 w-3.5 ${msg.is_favorite ? 'fill-yellow-400 text-yellow-400' : ''}`} />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => handleDelete(msg.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                        {msg.subject_line && (
                          <p className="text-sm font-medium mb-1">Subject: {msg.subject_line}</p>
                        )}
                        <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.message_body}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
