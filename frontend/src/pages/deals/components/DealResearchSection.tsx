import { useState, useEffect, useRef } from 'react';
import { API_URL } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  Microscope, Play, Loader2, Linkedin, Twitter, Github, MessageCircle, Facebook,
  Settings, ChevronDown, ChevronUp, ExternalLink, Users, CheckCircle, AlertCircle,
  FileText, Sparkles, Copy, Star, Trash2, Mail, Check
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface DealResearchSectionProps {
  dealId: string;
  companyName: string;
}

interface SocialProfile {
  id: string;
  platform: string;
  profile_url: string | null;
  username: string | null;
  display_name: string | null;
  bio: string | null;
  followers_count: number | null;
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
  { key: 'linkedin', label: 'LinkedIn', icon: Linkedin, color: 'text-blue-600', bg: 'bg-blue-50' },
  { key: 'twitter', label: 'X', icon: Twitter, color: 'text-sky-500', bg: 'bg-sky-50' },
  { key: 'github', label: 'GitHub', icon: Github, color: 'text-gray-800', bg: 'bg-gray-50' },
  { key: 'reddit', label: 'Reddit', icon: MessageCircle, color: 'text-orange-500', bg: 'bg-orange-50' },
  { key: 'facebook', label: 'Facebook', icon: Facebook, color: 'text-blue-500', bg: 'bg-blue-50' },
];

const CHANNELS = [
  { value: 'cold_email', label: 'Email', icon: Mail },
  { value: 'linkedin_inmail', label: 'InMail', icon: Linkedin },
  { value: 'linkedin_connection', label: 'Connect', icon: Linkedin },
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

export default function DealResearchSection({ dealId, companyName }: DealResearchSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const [availablePlatforms, setAvailablePlatforms] = useState<string[]>([]);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [researchStatus, setResearchStatus] = useState<string>('none');
  const [researching, setResearching] = useState(false);
  const [researchData, setResearchData] = useState<any>(null);
  const [socialProfiles, setSocialProfiles] = useState<SocialProfile[]>([]);
  const [messages, setMessages] = useState<GeneratedMessage[]>([]);
  const [showHints, setShowHints] = useState(false);
  const [hints, setHints] = useState({ linkedin_url: '', twitter_handle: '', github_username: '' });
  const [showMessageGen, setShowMessageGen] = useState(false);
  const [channel, setChannel] = useState('cold_email');
  const [tone, setTone] = useState('consultative');
  const [context, setContext] = useState('');
  const [generating, setGenerating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { toast } = useToast();

  const token = localStorage.getItem('token');

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
      if (data.research && (data.research.status === 'completed' || data.research.status === 'partial')) {
        setExpanded(true);
      }
    } catch { /* ignore */ }
  }

  async function startResearch() {
    setResearching(true);
    setExpanded(true);
    try {
      const body: any = {};
      if (selectedPlatforms.length > 0 && selectedPlatforms.length < availablePlatforms.length) {
        body.platforms = selectedPlatforms;
      }
      if (hints.linkedin_url) body.linkedin_url = hints.linkedin_url;
      if (hints.twitter_handle) body.twitter_handle = hints.twitter_handle;
      if (hints.github_username) body.github_username = hints.github_username;

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
      toast({ title: 'Research started', description: `Researching ${companyName}...` });

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
    await fetch(`${API_URL}/research/messages/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
    fetchResearchResults();
  }

  function togglePlatform(p: string) {
    setSelectedPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  }

  const hasResults = researchStatus === 'completed' || researchStatus === 'partial';

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Microscope className="h-4 w-4" />
            Deep Research
          </CardTitle>
          <div className="flex items-center gap-2">
            {hasResults && (
              <Badge variant="secondary" className="text-xs">
                {socialProfiles.length} profiles
              </Badge>
            )}
            <Button
              size="sm"
              onClick={hasResults ? () => setExpanded(!expanded) : startResearch}
              disabled={researching || selectedPlatforms.length === 0}
            >
              {researching ? (
                <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Researching...</>
              ) : hasResults ? (
                <>{expanded ? <ChevronUp className="h-3 w-3 mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}{expanded ? 'Collapse' : 'Show Results'}</>
              ) : (
                <><Play className="h-3 w-3 mr-1" />Research {companyName}</>
              )}
            </Button>
          </div>
        </div>
      </CardHeader>

      {/* Platform selector (always visible before first research) */}
      {!hasResults && !researching && (
        <CardContent className="pt-0 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {PLATFORM_CONFIG.map(p => {
              const Icon = p.icon;
              const isAvailable = availablePlatforms.includes(p.key);
              const isSelected = selectedPlatforms.includes(p.key);
              return (
                <button
                  key={p.key}
                  onClick={() => isAvailable && togglePlatform(p.key)}
                  disabled={!isAvailable}
                  className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs border transition-colors ${
                    !isAvailable ? 'opacity-40 cursor-not-allowed' : isSelected ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/50'
                  }`}
                >
                  <Icon className={`h-3 w-3 ${isAvailable ? p.color : ''}`} />
                  {p.label}
                </button>
              );
            })}
          </div>
          <button onClick={() => setShowHints(!showHints)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <Settings className="h-3 w-3" />Hints {showHints ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {showHints && (
            <div className="space-y-1.5">
              <Input value={hints.linkedin_url} onChange={e => setHints(h => ({...h, linkedin_url: e.target.value}))} placeholder="LinkedIn URL" className="text-xs h-7" />
              <Input value={hints.twitter_handle} onChange={e => setHints(h => ({...h, twitter_handle: e.target.value}))} placeholder="@twitter" className="text-xs h-7" />
              <Input value={hints.github_username} onChange={e => setHints(h => ({...h, github_username: e.target.value}))} placeholder="GitHub org" className="text-xs h-7" />
            </div>
          )}
        </CardContent>
      )}

      {/* Running indicator */}
      {researching && (
        <CardContent className="pt-0">
          <div className="flex items-center gap-2 p-2 rounded bg-muted/50 text-sm">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            Researching {companyName} across {selectedPlatforms.length} platforms...
          </div>
        </CardContent>
      )}

      {/* Results */}
      {expanded && hasResults && (
        <CardContent className="pt-0 space-y-4">
          {/* Social profiles grid */}
          {socialProfiles.length > 0 && (
            <div className="grid grid-cols-1 gap-2">
              {socialProfiles.map(sp => {
                const conf = PLATFORM_CONFIG.find(p => p.key === sp.platform);
                const Icon = conf?.icon || MessageCircle;
                return (
                  <div key={sp.id} className={`flex items-center gap-2 p-2 rounded ${conf?.bg || 'bg-muted'}`}>
                    <Icon className={`h-4 w-4 flex-shrink-0 ${conf?.color || ''}`} />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium truncate block">{sp.display_name || sp.username}</span>
                      {sp.bio && <span className="text-xs text-muted-foreground truncate block">{sp.bio}</span>}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {sp.followers_count !== null && (
                        <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                          <Users className="h-3 w-3" />{formatFollowers(sp.followers_count)}
                        </span>
                      )}
                      {sp.profile_url && (
                        <a href={sp.profile_url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3 w-3 text-muted-foreground hover:text-foreground" /></a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Research summary */}
          {researchData?.research_summary && (
            <div className="p-2 rounded bg-muted/50">
              <p className="text-xs font-medium mb-1 flex items-center gap-1"><FileText className="h-3 w-3" />Summary</p>
              <p className="text-xs text-muted-foreground">{researchData.research_summary}</p>
            </div>
          )}

          {/* Re-run + generate buttons */}
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={startResearch} disabled={researching}>
              <Play className="h-3 w-3 mr-1" />Re-run
            </Button>
            <Button size="sm" onClick={() => setShowMessageGen(!showMessageGen)}>
              <Sparkles className="h-3 w-3 mr-1" />{showMessageGen ? 'Hide' : 'Generate Message'}
            </Button>
          </div>

          {/* Message generator */}
          {showMessageGen && (
            <div className="space-y-2 p-3 border rounded-lg">
              <div className="flex flex-wrap gap-1">
                {CHANNELS.map(ch => (
                  <button key={ch.value} onClick={() => setChannel(ch.value)}
                    className={`px-2 py-1 rounded text-xs border ${channel === ch.value ? 'border-primary bg-primary/10' : 'border-border'}`}>
                    {ch.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1">
                {TONES.map(t => (
                  <button key={t.value} onClick={() => setTone(t.value)}
                    className={`px-2 py-1 rounded text-xs border ${tone === t.value ? 'border-primary bg-primary/10' : 'border-border'}`}>
                    {t.label}
                  </button>
                ))}
              </div>
              <Textarea value={context} onChange={e => setContext(e.target.value)} placeholder="Additional context..." rows={2} className="text-xs" />
              <Button size="sm" onClick={handleGenerate} disabled={generating} className="w-full">
                {generating ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Generating...</> : <><Sparkles className="h-3 w-3 mr-1" />Generate</>}
              </Button>
            </div>
          )}

          {/* Generated messages */}
          {messages.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Messages ({messages.length})</p>
              {messages.map(msg => (
                <div key={msg.id} className={`p-2 border rounded text-sm ${msg.is_favorite ? 'border-yellow-300' : ''}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-muted-foreground capitalize">{msg.channel.replace(/_/g, ' ')} &middot; {msg.tone}</span>
                    <div className="flex gap-0.5">
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => handleCopy(msg)}>
                        {copiedId === msg.id ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                      </Button>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => handleFavorite(msg.id)}>
                        <Star className={`h-3 w-3 ${msg.is_favorite ? 'fill-yellow-400 text-yellow-400' : ''}`} />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive" onClick={() => handleDelete(msg.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  {msg.subject_line && <p className="text-xs font-medium mb-0.5">Subject: {msg.subject_line}</p>}
                  <p className="text-xs whitespace-pre-wrap">{msg.message_body}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
