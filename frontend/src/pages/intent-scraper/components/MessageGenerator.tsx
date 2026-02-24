import { useState } from 'react';
import { API_URL } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Sparkles, Loader2, Copy, Star, Trash2, Mail, Linkedin, Twitter, MessageSquare, Check } from 'lucide-react';

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

interface MessageGeneratorProps {
  leadId: string;
  messages: GeneratedMessage[];
  onMessagesChange: () => void;
}

const CHANNELS = [
  { value: 'cold_email', label: 'Cold Email', icon: Mail, maxLen: '~2000 chars' },
  { value: 'linkedin_inmail', label: 'LinkedIn InMail', icon: Linkedin, maxLen: '~1900 chars' },
  { value: 'linkedin_connection', label: 'LinkedIn Connection', icon: Linkedin, maxLen: '300 chars' },
  { value: 'twitter_dm', label: 'X / Twitter DM', icon: Twitter, maxLen: '~500 chars' },
  { value: 'generic', label: 'Generic', icon: MessageSquare, maxLen: '~1500 chars' },
];

const TONES = [
  { value: 'formal', label: 'Formal', desc: 'Professional, polished' },
  { value: 'casual', label: 'Casual', desc: 'Friendly, conversational' },
  { value: 'provocative', label: 'Provocative', desc: 'Bold, challenging' },
  { value: 'consultative', label: 'Consultative', desc: 'Insight-driven, advisory' },
];

export default function MessageGenerator({ leadId, messages, onMessagesChange }: MessageGeneratorProps) {
  const [channel, setChannel] = useState('cold_email');
  const [tone, setTone] = useState('consultative');
  const [context, setContext] = useState('');
  const [generating, setGenerating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const { toast } = useToast();

  const token = localStorage.getItem('token');

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await fetch(`${API_URL}/research/${leadId}/generate-message`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channel,
          tone,
          additional_context: context || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to generate message');
      }

      toast({ title: 'Message generated', description: 'AI has crafted a personalized message.' });
      onMessagesChange();
    } catch (err: any) {
      toast({ title: 'Generation failed', description: err.message, variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  }

  async function handleCopy(message: GeneratedMessage) {
    const text = message.subject_line
      ? `Subject: ${message.subject_line}\n\n${message.message_body}`
      : message.message_body;
    await navigator.clipboard.writeText(text);
    setCopiedId(message.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function handleFavorite(messageId: string) {
    try {
      await fetch(`${API_URL}/research/messages/${messageId}/favorite`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      onMessagesChange();
    } catch { /* ignore */ }
  }

  async function handleDelete(messageId: string) {
    try {
      await fetch(`${API_URL}/research/messages/${messageId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      onMessagesChange();
    } catch { /* ignore */ }
  }

  const channelIcon = (ch: string) => {
    const found = CHANNELS.find(c => c.value === ch);
    if (!found) return null;
    const Icon = found.icon;
    return <Icon className="h-3 w-3" />;
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Generate Outreach Message
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Channel selection */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Channel</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {CHANNELS.map(ch => {
                const Icon = ch.icon;
                return (
                  <button
                    key={ch.value}
                    onClick={() => setChannel(ch.value)}
                    className={`flex items-center gap-2 p-2 rounded-md border text-sm transition-colors ${
                      channel === ch.value
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate">{ch.label}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Max: {CHANNELS.find(c => c.value === channel)?.maxLen}
            </p>
          </div>

          {/* Tone selection */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Tone</Label>
            <div className="grid grid-cols-2 gap-2">
              {TONES.map(t => (
                <button
                  key={t.value}
                  onClick={() => setTone(t.value)}
                  className={`p-2 rounded-md border text-left transition-colors ${
                    tone === t.value
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <span className="text-sm font-medium">{t.label}</span>
                  <span className="block text-xs text-muted-foreground">{t.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Additional context */}
          <div>
            <Label className="text-sm font-medium mb-1 block">Additional Context (optional)</Label>
            <Textarea
              value={context}
              onChange={e => setContext(e.target.value)}
              placeholder="Any specific talking points, mutual connections, or context..."
              rows={2}
              className="text-sm"
            />
          </div>

          <Button onClick={handleGenerate} disabled={generating} className="w-full">
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Generate Message
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Generated messages list */}
      {messages.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-medium text-sm text-muted-foreground">
            Generated Messages ({messages.length})
          </h3>
          {messages.map(msg => (
            <Card key={msg.id} className={msg.is_favorite ? 'border-yellow-300' : ''}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {channelIcon(msg.channel)}
                    <span className="text-xs font-medium capitalize">
                      {msg.channel.replace(/_/g, ' ')}
                    </span>
                    <span className="text-xs text-muted-foreground capitalize">{msg.tone}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => handleCopy(msg)}
                    >
                      {copiedId === msg.id ? (
                        <Check className="h-3 w-3 text-green-500" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => handleFavorite(msg.id)}
                    >
                      <Star className={`h-3 w-3 ${msg.is_favorite ? 'fill-yellow-400 text-yellow-400' : ''}`} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-destructive"
                      onClick={() => handleDelete(msg.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                {msg.subject_line && (
                  <p className="text-sm font-medium mb-1">Subject: {msg.subject_line}</p>
                )}
                <p className="text-sm whitespace-pre-wrap">{msg.message_body}</p>
                <p className="text-xs text-muted-foreground mt-2">
                  {msg.message_length} chars &middot; {new Date(msg.created_at).toLocaleString()}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
