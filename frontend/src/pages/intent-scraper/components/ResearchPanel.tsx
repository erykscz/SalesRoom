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
              Research Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{research.research_summary}</p>
          </CardContent>
        </Card>
      )}

      {/* Message Generator */}
      <MessageGenerator leadId={leadId} messages={messages} onMessagesChange={onRefresh} />
    </div>
  );
}
