import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle, FileText } from 'lucide-react';
import SocialProfileCard from './SocialProfileCard';
import MessageGenerator from './MessageGenerator';

interface SocialProfile {
  id: string;
  platform: 'linkedin' | 'twitter' | 'github' | 'reddit' | 'facebook';
  profile_url: string | null;
  username: string | null;
  display_name: string | null;
  bio: string | null;
  followers_count: number | null;
  profile_data: any;
}

interface ResearchData {
  id: string;
  status: string;
  research_summary: string | null;
  platforms_searched: string[];
  platforms_succeeded: string[];
  error_log: { platform: string; error: string }[];
  created_at: string;
  completed_at: string | null;
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

interface ResearchPanelProps {
  leadId: string;
  research: ResearchData;
  socialProfiles: SocialProfile[];
  messages: GeneratedMessage[];
  onRefresh: () => void;
}

export default function ResearchPanel({ leadId, research, socialProfiles, messages, onRefresh }: ResearchPanelProps) {
  const failedPlatforms = research.platforms_searched.filter(
    p => !research.platforms_succeeded.includes(p)
  );

  return (
    <div className="space-y-4">
      {/* Status bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant={research.status === 'completed' ? 'default' : research.status === 'partial' ? 'secondary' : 'destructive'}>
          {research.status}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {research.platforms_succeeded.length}/{research.platforms_searched.length} platforms
        </span>
        {research.completed_at && (
          <span className="text-xs text-muted-foreground">
            &middot; {new Date(research.completed_at).toLocaleString()}
          </span>
        )}
      </div>

      {/* Social Profile Cards */}
      {socialProfiles.length > 0 && (
        <div>
          <h3 className="font-medium text-sm mb-2 flex items-center gap-1">
            <CheckCircle className="h-4 w-4 text-green-500" />
            Social Profiles ({socialProfiles.length})
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {socialProfiles.map(profile => (
              <SocialProfileCard key={profile.id} profile={profile} />
            ))}
          </div>
        </div>
      )}

      {/* Failed platforms */}
      {failedPlatforms.length > 0 && (
        <div className="flex items-start gap-2 text-sm">
          <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <div>
            <span className="text-muted-foreground">Not found on: </span>
            {failedPlatforms.map(p => (
              <Badge key={p} variant="outline" className="mr-1 text-xs capitalize">{p}</Badge>
            ))}
            {research.error_log.length > 0 && (
              <div className="mt-1 space-y-0.5">
                {research.error_log.map((err, i) => (
                  <p key={i} className="text-xs text-muted-foreground">
                    {err.platform}: {err.error}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Research Summary */}
      {research.research_summary && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Podsumowanie AI
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground leading-relaxed space-y-2">
              {research.research_summary.split('\n').map((line: string, i: number) => {
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
          </CardContent>
        </Card>
      )}

      {/* Message Generator */}
      <MessageGenerator leadId={leadId} messages={messages} onMessagesChange={onRefresh} />
    </div>
  );
}
