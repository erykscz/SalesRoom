import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Linkedin, Twitter, Github, MessageCircle, Facebook, ExternalLink, Users } from 'lucide-react';

interface SocialProfileData {
  id: string;
  platform: 'linkedin' | 'twitter' | 'github' | 'reddit' | 'facebook';
  profile_url: string | null;
  username: string | null;
  display_name: string | null;
  bio: string | null;
  followers_count: number | null;
  profile_data: any;
}

const platformConfig: Record<string, { icon: any; color: string; bgColor: string; label: string }> = {
  linkedin: { icon: Linkedin, color: 'text-blue-600', bgColor: 'bg-blue-50', label: 'LinkedIn' },
  twitter: { icon: Twitter, color: 'text-sky-500', bgColor: 'bg-sky-50', label: 'X / Twitter' },
  github: { icon: Github, color: 'text-gray-800', bgColor: 'bg-gray-50', label: 'GitHub' },
  reddit: { icon: MessageCircle, color: 'text-orange-500', bgColor: 'bg-orange-50', label: 'Reddit' },
  facebook: { icon: Facebook, color: 'text-blue-500', bgColor: 'bg-blue-50', label: 'Facebook' },
};

function formatFollowers(count: number | null): string {
  if (count === null || count === undefined) return '-';
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return count.toString();
}

export default function SocialProfileCard({ profile }: { profile: SocialProfileData }) {
  const config = platformConfig[profile.platform] || platformConfig.github;
  const Icon = config.icon;

  return (
    <Card className={`${config.bgColor} border-0`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <Icon className={`h-5 w-5 ${config.color}`} />
            <span className="font-medium text-sm">{config.label}</span>
          </div>
          {profile.profile_url && (
            <a
              href={profile.profile_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </div>

        <div className="space-y-1">
          <p className="font-semibold text-sm truncate">
            {profile.display_name || profile.username || 'Unknown'}
          </p>
          {profile.username && profile.display_name && profile.username !== profile.display_name && (
            <p className="text-xs text-muted-foreground">@{profile.username}</p>
          )}
          {profile.bio && (
            <p className="text-xs text-muted-foreground line-clamp-2">{profile.bio}</p>
          )}
        </div>

        {profile.followers_count !== null && (
          <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
            <Users className="h-3 w-3" />
            <span>{formatFollowers(profile.followers_count)} followers</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
