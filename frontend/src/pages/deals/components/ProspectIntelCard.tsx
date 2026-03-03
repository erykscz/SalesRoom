import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import {
  Sparkles,
  Loader2,
  User,
  Building2,
  Briefcase,
  MapPin,
  Globe,
  Wrench,
  GraduationCap,
  RefreshCw,
} from 'lucide-react';
import { API_URL } from '@/lib/api';

interface ProspectIntelCardProps {
  dealId: string;
  companyName?: string | null;
  personName?: string | null;
  linkedinUrl?: string | null;
  companyUrl?: string | null;
}

interface EnrichmentData {
  linkedin?: {
    full_name?: string;
    headline?: string;
    summary?: string;
    city?: string;
    skills?: string[];
    experiences?: { title?: string; company?: string; description?: string }[];
    education?: { school?: string; degree_name?: string; field_of_study?: string }[];
  };
  website?: {
    name?: string;
    description?: string;
    industry?: string;
    technologies?: string[];
    services?: string[];
    products?: string[];
  };
  enriched_at?: string;
}

export default function ProspectIntelCard({
  dealId,
  companyName,
  personName,
  linkedinUrl,
  companyUrl,
}: ProspectIntelCardProps) {
  const { token } = useAuth();
  const { toast } = useToast();
  const [enrichmentData, setEnrichmentData] = useState<EnrichmentData | null>(null);
  const [lastEnriched, setLastEnriched] = useState<string | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [configured, setConfigured] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    checkConfiguration();
    fetchEnrichmentData();
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [dealId]);

  async function checkConfiguration() {
    try {
      const res = await fetch(`${API_URL}/enrichment/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setConfigured(data.configured);
      }
    } catch { /* ignore */ }
  }

  async function fetchEnrichmentData() {
    try {
      const res = await fetch(`${API_URL}/enrichment/entity/deal/${dealId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.enrichmentData) {
        setEnrichmentData(data.enrichmentData);
        setLastEnriched(data.lastEnriched);
      }
    } catch { /* ignore */ }
  }

  async function startEnrichment() {
    setEnriching(true);
    try {
      const res = await fetch(`${API_URL}/enrichment/enrich`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ entityType: 'deal', entityId: dealId }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to start enrichment' }));
        throw new Error(err.error);
      }

      const { jobId } = await res.json();
      toast({ title: 'Enrichment started', description: 'Extracting prospect intelligence...' });

      // Start polling
      pollingRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(`${API_URL}/enrichment/jobs/${jobId}/status`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!statusRes.ok) return;
          const statusData = await statusRes.json();

          if (['completed', 'partial', 'failed'].includes(statusData.status)) {
            if (pollingRef.current) clearInterval(pollingRef.current);
            pollingRef.current = null;
            setEnriching(false);
            fetchEnrichmentData();
            toast({
              title: statusData.status === 'failed' ? 'Enrichment failed' : 'Enrichment complete',
              description: statusData.status === 'failed'
                ? 'Could not retrieve data from sources.'
                : 'Prospect intelligence updated.',
              variant: statusData.status === 'failed' ? 'destructive' : 'default',
            });
          }
        } catch { /* ignore */ }
      }, 2000);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
      setEnriching(false);
    }
  }

  if (!configured) return null;

  const li = enrichmentData?.linkedin;
  const ws = enrichmentData?.website;
  const hasData = li || ws;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-purple-500" />
            Prospect Intelligence
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={startEnrichment}
            disabled={enriching}
          >
            {enriching ? (
              <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Enriching...</>
            ) : hasData ? (
              <><RefreshCw className="h-3 w-3 mr-1" />Refresh</>
            ) : (
              <><Sparkles className="h-3 w-3 mr-1" />Enrich</>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!hasData && !enriching ? (
          <div className="text-center py-4">
            <Sparkles className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-50" />
            <p className="text-sm text-muted-foreground">
              Click "Enrich" to extract prospect intelligence from LinkedIn and company website.
            </p>
          </div>
        ) : enriching && !hasData ? (
          <div className="text-center py-4">
            <Loader2 className="h-8 w-8 text-purple-500 mx-auto mb-2 animate-spin" />
            <p className="text-sm text-muted-foreground">Extracting data...</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Person Section */}
            {li && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <User className="h-3.5 w-3.5" />
                  Person
                </div>
                {li.full_name && (
                  <p className="font-medium">{li.full_name}</p>
                )}
                {li.headline && (
                  <p className="text-sm text-muted-foreground">{li.headline}</p>
                )}
                {li.city && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3 w-3" />{li.city}
                  </p>
                )}
                {li.summary && (
                  <p className="text-xs text-muted-foreground line-clamp-3">{li.summary}</p>
                )}
                {li.skills && li.skills.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {li.skills.slice(0, 8).map((skill, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                )}
                {li.experiences && li.experiences.length > 0 && (
                  <div className="space-y-1 mt-1">
                    {li.experiences.slice(0, 2).map((exp, i) => (
                      <div key={i} className="text-xs text-muted-foreground flex items-start gap-1">
                        <Briefcase className="h-3 w-3 mt-0.5 shrink-0" />
                        <span>{exp.title}{exp.company ? ` at ${exp.company}` : ''}</span>
                      </div>
                    ))}
                  </div>
                )}
                {li.education && li.education.length > 0 && (
                  <div className="space-y-1">
                    {li.education.slice(0, 1).map((edu, i) => (
                      <div key={i} className="text-xs text-muted-foreground flex items-start gap-1">
                        <GraduationCap className="h-3 w-3 mt-0.5 shrink-0" />
                        <span>{edu.school}{edu.degree_name ? ` — ${edu.degree_name}` : ''}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Company Section */}
            {ws && (
              <div className="space-y-2">
                {li && <hr className="my-2" />}
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Building2 className="h-3.5 w-3.5" />
                  Company
                </div>
                {ws.name && (
                  <p className="font-medium text-sm">{ws.name}</p>
                )}
                {ws.industry && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Globe className="h-3 w-3" />{ws.industry}
                  </p>
                )}
                {ws.description && (
                  <p className="text-xs text-muted-foreground line-clamp-3">{ws.description}</p>
                )}
                {ws.technologies && ws.technologies.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-1">
                      <Wrench className="h-3 w-3" />Technologies
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {ws.technologies.slice(0, 8).map((tech, i) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          {tech}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {ws.services && ws.services.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Services</p>
                    <div className="flex flex-wrap gap-1">
                      {ws.services.slice(0, 6).map((svc, i) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          {svc}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Last enriched timestamp */}
            {lastEnriched && (
              <p className="text-xs text-muted-foreground pt-1 border-t">
                Last enriched: {new Date(lastEnriched).toLocaleDateString()}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
