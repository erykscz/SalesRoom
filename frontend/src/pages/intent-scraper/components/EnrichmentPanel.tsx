import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Sparkles, Loader2, X, CheckCircle } from 'lucide-react';
import { API_URL } from '@/lib/api';

interface EnrichmentPanelProps {
  selectedLeads: Set<string>;
  onClear: () => void;
  onComplete: () => void;
}

interface BulkJob {
  jobId: string;
  entityId: string;
  status: 'pending' | 'running' | 'completed' | 'partial' | 'failed';
}

export default function EnrichmentPanel({ selectedLeads, onClear, onComplete }: EnrichmentPanelProps) {
  const { toast } = useToast();
  const [enriching, setEnriching] = useState(false);
  const [jobs, setJobs] = useState<BulkJob[]>([]);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const completedCount = jobs.filter(j => ['completed', 'partial'].includes(j.status)).length;
  const failedCount = jobs.filter(j => j.status === 'failed').length;
  const totalJobs = jobs.length;
  const progress = totalJobs > 0 ? ((completedCount + failedCount) / totalJobs) * 100 : 0;

  async function startBulkEnrichment() {
    const token = localStorage.getItem('token');
    setEnriching(true);

    try {
      const jobsPayload = Array.from(selectedLeads).map(id => ({
        entityType: 'lead',
        entityId: id,
      }));

      const res = await fetch(`${API_URL}/enrichment/bulk`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ jobs: jobsPayload }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to start enrichment' }));
        throw new Error(err.error);
      }

      const data = await res.json();
      const newJobs: BulkJob[] = data.jobs.map((j: any) => ({
        jobId: j.jobId,
        entityId: j.entityId,
        status: 'pending',
      }));
      setJobs(newJobs);

      toast({ title: 'Bulk enrichment started', description: `Enriching ${newJobs.length} leads...` });

      // Start polling all jobs
      pollingRef.current = setInterval(async () => {
        let allDone = true;

        for (const job of newJobs) {
          if (['completed', 'partial', 'failed'].includes(job.status)) continue;

          try {
            const statusRes = await fetch(`${API_URL}/enrichment/jobs/${job.jobId}/status`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (!statusRes.ok) continue;
            const statusData = await statusRes.json();
            job.status = statusData.status;

            if (!['completed', 'partial', 'failed'].includes(statusData.status)) {
              allDone = false;
            }
          } catch {
            allDone = false;
          }
        }

        setJobs([...newJobs]);

        if (allDone) {
          if (pollingRef.current) clearInterval(pollingRef.current);
          pollingRef.current = null;
          setEnriching(false);

          const completed = newJobs.filter(j => ['completed', 'partial'].includes(j.status)).length;
          const failed = newJobs.filter(j => j.status === 'failed').length;

          toast({
            title: 'Bulk enrichment complete',
            description: `${completed} succeeded, ${failed} failed out of ${newJobs.length} leads.`,
            variant: failed === newJobs.length ? 'destructive' : 'default',
          });

          onComplete();
        }
      }, 2000);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
      setEnriching(false);
    }
  }

  function handleClear() {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setJobs([]);
    setEnriching(false);
    onClear();
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-background border-t shadow-lg z-50 px-6 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Sparkles className="h-5 w-5 text-purple-500" />
          <span className="text-sm font-medium">
            {selectedLeads.size} lead{selectedLeads.size !== 1 ? 's' : ''} selected
          </span>
          {totalJobs > 0 && (
            <span className="text-xs text-muted-foreground">
              <CheckCircle className="inline h-3 w-3 mr-1" />
              {completedCount}/{totalJobs} enriched
              {failedCount > 0 && `, ${failedCount} failed`}
            </span>
          )}
        </div>

        {/* Progress bar */}
        {totalJobs > 0 && (
          <div className="flex-1 max-w-md">
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-purple-500 transition-all duration-300 rounded-full"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleClear}
          >
            <X className="h-3 w-3 mr-1" />
            Clear
          </Button>
          <Button
            size="sm"
            onClick={startBulkEnrichment}
            disabled={enriching || selectedLeads.size === 0}
          >
            {enriching ? (
              <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Enriching...</>
            ) : (
              <><Sparkles className="h-3 w-3 mr-1" />Enrich Selected</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
