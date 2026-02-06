import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Upload, FileText, CheckCircle, AlertCircle, Trash2, Eye, Loader2, X, Cloud, Pencil, Plus, Save, Clock, TrendingUp, ChevronRight, Download, Search } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || '/api';

interface Deal {
  id: string;
  company_name: string;
  stage: string;
}

interface Transcript {
  id: string;
  deal_id: string;
  file_name: string;
  file_format: string;
  raw_content: string;
  cleaned_content?: string;
  source_platform: string;
  processed: number;
  insights?: {
    pain_points: string[];
    stakeholders: any[];
    red_flags: string[];
    next_steps: string[];
  };
  uploaded_by: string;
  uploaded_by_name?: string;
  deal_company?: string;
  created_at: string;
  processed_at?: string;
}

export default function DiscoveryPage() {
  const { toast } = useToast();
  const { token } = useAuth();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDeal, setSelectedDeal] = useState<string>('');
  const [selectedPlatform, setSelectedPlatform] = useState<string>('manual');

  // Upload state - supports multiple files
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadComplete, setUploadComplete] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadedCount, setUploadedCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // View transcript modal
  const [viewTranscript, setViewTranscript] = useState<Transcript | null>(null);

  // Edit insights state
  const [isEditing, setIsEditing] = useState(false);
  const [editingInsights, setEditingInsights] = useState<{
    pain_points: string[];
    stakeholders: { name: string; role: string; influence: string }[];
    red_flags: string[];
    next_steps: string[];
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Delete confirmation
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Drag and drop state
  const [isDragOver, setIsDragOver] = useState(false);

  // Timeline view state
  const [timelineDeal, setTimelineDeal] = useState<string | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState<string>('');

  useEffect(() => {
    fetchData();
  }, [token]);

  const fetchData = async (search?: string) => {
    try {
      setLoading(true);
      const transcriptUrl = search
        ? `${API_URL}/transcripts?search=${encodeURIComponent(search)}`
        : `${API_URL}/transcripts`;

      const [dealsRes, transcriptsRes] = await Promise.all([
        fetch(`${API_URL}/deals?archived=false`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(transcriptUrl, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);

      if (!dealsRes.ok || !transcriptsRes.ok) {
        throw new Error('Failed to fetch data');
      }

      const dealsData = await dealsRes.json();
      const transcriptsData = await transcriptsRes.json();

      setDeals(dealsData.deals || []);
      setTranscripts(transcriptsData.transcripts || []);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load data',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const simulateProgress = useCallback(() => {
    // Simulate realistic upload progress
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 15 + 5;
      if (progress >= 90) {
        progress = 90;
        clearInterval(interval);
      }
      setUploadProgress(Math.min(progress, 90));
    }, 200);
    return interval;
  }, []);

  // Auto-detect transcript source platform from content
  const detectPlatform = async (file: File): Promise<string> => {
    try {
      const content = await file.text();
      const lowerContent = content.toLowerCase();

      // Fireflies.ai detection
      if (lowerContent.includes('fireflies.ai') ||
          lowerContent.includes('fireflies transcript') ||
          content.includes('[Fireflies.ai]')) {
        return 'fireflies';
      }

      // Otter.ai detection
      if (lowerContent.includes('otter.ai') ||
          lowerContent.includes('otter transcript') ||
          content.includes('[Otter.ai]') ||
          content.includes('WEBVTT') && content.includes('otter')) {
        return 'otter';
      }

      // Zoom detection
      if (lowerContent.includes('zoom meeting') ||
          lowerContent.includes('zoom transcript') ||
          content.includes('ZOOM:') ||
          (file.name.toLowerCase().includes('zoom'))) {
        return 'zoom';
      }

      // Google Meet detection
      if (lowerContent.includes('google meet') ||
          lowerContent.includes('meet.google') ||
          content.includes('[Google Meet]') ||
          (file.name.toLowerCase().includes('meet'))) {
        return 'google_meet';
      }

      // VTT format (could be from various sources)
      if (content.startsWith('WEBVTT')) {
        // Check if it's a known source, otherwise it's manual
        return 'manual';
      }

      return 'manual';
    } catch {
      return 'manual';
    }
  };

  const handleFileSelect = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const validFiles: File[] = [];
    const validExtensions = ['.txt', '.json', '.vtt'];

    for (const file of fileArray) {
      // Validate file type
      const ext = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
      if (!validExtensions.includes(ext)) {
        toast({
          title: 'Invalid File Type',
          description: `${file.name}: Please upload .txt, .json, or .vtt files`,
          variant: 'destructive'
        });
        continue;
      }

      // Validate file size (10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: 'File Too Large',
          description: `${file.name}: File size must be under 10MB`,
          variant: 'destructive'
        });
        continue;
      }

      validFiles.push(file);
    }

    if (validFiles.length === 0) return;

    // Auto-detect platform from first file content
    const detectedPlatform = await detectPlatform(validFiles[0]);
    if (detectedPlatform !== 'manual') {
      setSelectedPlatform(detectedPlatform);
      const platformLabels: Record<string, string> = {
        fireflies: 'Fireflies.ai',
        otter: 'Otter.ai',
        zoom: 'Zoom',
        google_meet: 'Google Meet'
      };
      toast({
        title: 'Format Detected',
        description: `Auto-detected as ${platformLabels[detectedPlatform]} transcript`,
      });
    }

    setUploadFiles(validFiles);
    setUploadError(null);
    setUploadComplete(false);
    setUploadProgress(0);
    setUploadedCount(0);
  };

  const handleUpload = async () => {
    if (uploadFiles.length === 0 || !selectedDeal) {
      toast({
        title: 'Missing Information',
        description: 'Please select a deal and at least one file to upload',
        variant: 'destructive'
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setUploadError(null);
    setUploadComplete(false);
    setUploadedCount(0);

    const totalFiles = uploadFiles.length;
    let successCount = 0;
    let failedFiles: string[] = [];

    try {
      for (let i = 0; i < uploadFiles.length; i++) {
        const file = uploadFiles[i];

        // Update progress based on file index
        setUploadProgress(Math.round((i / totalFiles) * 90));
        setUploadedCount(i);

        try {
          // Read file content
          const content = await file.text();

          // Determine file format
          const ext = file.name.toLowerCase().substring(file.name.lastIndexOf('.') + 1);

          // Auto-detect platform for each file
          const detectedPlatform = await detectPlatform(file);
          const platform = detectedPlatform !== 'manual' ? detectedPlatform : selectedPlatform;

          // Upload to backend
          const response = await fetch(`${API_URL}/transcripts/upload`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              deal_id: selectedDeal,
              file_name: file.name,
              file_format: ext,
              raw_content: content,
              source_platform: platform
            })
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Upload failed');
          }

          successCount++;
        } catch (fileError: any) {
          failedFiles.push(file.name);
          console.error(`Failed to upload ${file.name}:`, fileError);
        }
      }

      // Complete
      setUploadProgress(100);
      setUploadComplete(true);
      setUploadedCount(totalFiles);

      if (failedFiles.length === 0) {
        toast({
          title: 'Upload Complete',
          description: `${successCount} file${successCount !== 1 ? 's' : ''} uploaded successfully`,
        });
      } else {
        toast({
          title: 'Partial Upload',
          description: `${successCount} uploaded, ${failedFiles.length} failed: ${failedFiles.join(', ')}`,
          variant: 'warning'
        });
      }

      // Refresh data
      await fetchData();

      // Reset after delay
      setTimeout(() => {
        setUploadFiles([]);
        setUploadProgress(0);
        setUploadComplete(false);
        setUploadedCount(0);
        setSelectedDeal('');
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }, 2000);

    } catch (error: any) {
      setUploadProgress(0);
      setUploadError(error.message || 'Upload failed');
      toast({
        title: 'Upload Failed',
        description: error.message || 'Failed to upload transcripts',
        variant: 'destructive'
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files);
    }
  };

  const handleAnalyze = async (transcriptId: string) => {
    try {
      const response = await fetch(`${API_URL}/transcripts/analyze`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ transcript_id: transcriptId })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Analysis failed');
      }

      toast({
        title: 'Analysis Complete',
        description: 'Transcript has been analyzed',
      });
      fetchData();
    } catch (error: any) {
      toast({
        title: 'Analysis Failed',
        description: error.message || 'Failed to analyze transcript',
        variant: 'destructive'
      });
    }
  };

  const handleSearch = () => {
    fetchData(searchQuery);
  };

  const clearSearch = () => {
    setSearchQuery('');
    fetchData();
  };

  const handleDelete = async () => {
    if (!deleteId) return;

    try {
      const response = await fetch(`${API_URL}/transcripts/${deleteId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Delete failed');
      }

      toast({
        title: 'Deleted',
        description: 'Transcript deleted successfully',
      });
      setDeleteId(null);
      fetchData();
    } catch (error: any) {
      toast({
        title: 'Delete Failed',
        description: error.message || 'Failed to delete transcript',
        variant: 'destructive'
      });
    }
  };

  // Start editing insights
  const startEditingInsights = () => {
    if (!viewTranscript?.insights) return;
    const insights = typeof viewTranscript.insights === 'string'
      ? JSON.parse(viewTranscript.insights)
      : viewTranscript.insights;

    // Normalize stakeholders to have proper structure
    const normalizedStakeholders = (insights.stakeholders || []).map((s: any) => ({
      name: s.name || s || '',
      role: s.role || 'Contact',
      influence: s.influence || 'medium'
    }));

    setEditingInsights({
      pain_points: insights.pain_points || [],
      stakeholders: normalizedStakeholders,
      red_flags: insights.red_flags || [],
      next_steps: insights.next_steps || []
    });
    setIsEditing(true);
  };

  // Cancel editing
  const cancelEditing = () => {
    setIsEditing(false);
    setEditingInsights(null);
  };

  // Save edited insights
  const saveInsights = async () => {
    if (!viewTranscript || !editingInsights) return;

    setIsSaving(true);
    try {
      const response = await fetch(`${API_URL}/transcripts/${viewTranscript.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ insights: editingInsights })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Save failed');
      }

      const data = await response.json();

      // Update local state
      setViewTranscript({
        ...viewTranscript,
        insights: data.transcript.insights
      });

      // Update transcripts list
      setTranscripts(prev => prev.map(t =>
        t.id === viewTranscript.id
          ? { ...t, insights: data.transcript.insights }
          : t
      ));

      toast({
        title: 'Saved',
        description: 'Insights updated successfully',
      });
      setIsEditing(false);
      setEditingInsights(null);
    } catch (error: any) {
      toast({
        title: 'Save Failed',
        description: error.message || 'Failed to save insights',
        variant: 'destructive'
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Update a pain point
  const updatePainPoint = (index: number, value: string) => {
    if (!editingInsights) return;
    const newPainPoints = [...editingInsights.pain_points];
    newPainPoints[index] = value;
    setEditingInsights({ ...editingInsights, pain_points: newPainPoints });
  };

  // Add a new pain point
  const addPainPoint = () => {
    if (!editingInsights) return;
    setEditingInsights({
      ...editingInsights,
      pain_points: [...editingInsights.pain_points, '']
    });
  };

  // Remove a pain point
  const removePainPoint = (index: number) => {
    if (!editingInsights) return;
    setEditingInsights({
      ...editingInsights,
      pain_points: editingInsights.pain_points.filter((_, i) => i !== index)
    });
  };

  // Update a stakeholder
  const updateStakeholder = (index: number, field: 'name' | 'role' | 'influence', value: string) => {
    if (!editingInsights) return;
    const newStakeholders = [...editingInsights.stakeholders];
    newStakeholders[index] = { ...newStakeholders[index], [field]: value };
    setEditingInsights({ ...editingInsights, stakeholders: newStakeholders });
  };

  // Add a new stakeholder
  const addStakeholder = () => {
    if (!editingInsights) return;
    setEditingInsights({
      ...editingInsights,
      stakeholders: [...editingInsights.stakeholders, { name: '', role: 'Contact', influence: 'medium' }]
    });
  };

  // Remove a stakeholder
  const removeStakeholder = (index: number) => {
    if (!editingInsights) return;
    setEditingInsights({
      ...editingInsights,
      stakeholders: editingInsights.stakeholders.filter((_, i) => i !== index)
    });
  };

  // Update a red flag
  const updateRedFlag = (index: number, value: string) => {
    if (!editingInsights) return;
    const newRedFlags = [...editingInsights.red_flags];
    newRedFlags[index] = value;
    setEditingInsights({ ...editingInsights, red_flags: newRedFlags });
  };

  // Add a new red flag
  const addRedFlag = () => {
    if (!editingInsights) return;
    setEditingInsights({
      ...editingInsights,
      red_flags: [...editingInsights.red_flags, '']
    });
  };

  // Remove a red flag
  const removeRedFlag = (index: number) => {
    if (!editingInsights) return;
    setEditingInsights({
      ...editingInsights,
      red_flags: editingInsights.red_flags.filter((_, i) => i !== index)
    });
  };

  // Update a next step
  const updateNextStep = (index: number, value: string) => {
    if (!editingInsights) return;
    const newNextSteps = [...editingInsights.next_steps];
    newNextSteps[index] = value;
    setEditingInsights({ ...editingInsights, next_steps: newNextSteps });
  };

  // Add a new next step
  const addNextStep = () => {
    if (!editingInsights) return;
    setEditingInsights({
      ...editingInsights,
      next_steps: [...editingInsights.next_steps, '']
    });
  };

  // Remove a next step
  const removeNextStep = (index: number) => {
    if (!editingInsights) return;
    setEditingInsights({
      ...editingInsights,
      next_steps: editingInsights.next_steps.filter((_, i) => i !== index)
    });
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getPlatformLabel = (platform: string) => {
    const labels: Record<string, string> = {
      fireflies: 'Fireflies.ai',
      otter: 'Otter.ai',
      zoom: 'Zoom',
      google_meet: 'Google Meet',
      manual: 'Manual Upload'
    };
    return labels[platform] || platform;
  };

  // Export transcript report as PDF
  const exportToPDF = (transcript: Transcript) => {
    if (!transcript.processed || !transcript.insights) {
      toast({
        title: 'Cannot Export',
        description: 'Please analyze the transcript first before exporting',
        variant: 'destructive'
      });
      return;
    }

    const insights = typeof transcript.insights === 'string'
      ? JSON.parse(transcript.insights)
      : transcript.insights;

    // Create printable HTML content
    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Discovery Report - ${transcript.file_name}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
          h1 { color: #1a1a1a; border-bottom: 2px solid #333; padding-bottom: 10px; }
          h2 { color: #333; margin-top: 30px; }
          .meta { color: #666; font-size: 14px; margin-bottom: 20px; }
          .section { margin: 20px 0; padding: 15px; background: #f9f9f9; border-radius: 8px; }
          .section-title { font-weight: bold; color: #333; margin-bottom: 10px; }
          .pain-points { border-left: 4px solid #ef4444; }
          .stakeholders { border-left: 4px solid #3b82f6; }
          .red-flags { border-left: 4px solid #f97316; }
          .next-steps { border-left: 4px solid #22c55e; }
          ul { margin: 0; padding-left: 20px; }
          li { margin: 8px 0; }
          .stakeholder { margin: 10px 0; }
          .stakeholder-name { font-weight: bold; }
          .stakeholder-role { color: #666; }
          .stakeholder-influence { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; margin-left: 8px; }
          .influence-high { background: #fee2e2; color: #991b1b; }
          .influence-medium { background: #fef3c7; color: #92400e; }
          .influence-low { background: #e0e7ff; color: #3730a3; }
          .transcript-content { margin-top: 30px; padding: 20px; background: #f5f5f5; border-radius: 8px; white-space: pre-wrap; font-family: monospace; font-size: 12px; max-height: 400px; overflow: auto; }
          .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 12px; }
          @media print { .no-print { display: none; } }
        </style>
      </head>
      <body>
        <h1>Discovery Report</h1>
        <div class="meta">
          <strong>File:</strong> ${transcript.file_name}<br>
          <strong>Deal:</strong> ${transcript.deal_company || 'Unknown'}<br>
          <strong>Platform:</strong> ${getPlatformLabel(transcript.source_platform)}<br>
          <strong>Uploaded:</strong> ${formatDate(transcript.created_at)}<br>
          <strong>Analyzed:</strong> ${transcript.processed_at ? formatDate(transcript.processed_at) : 'N/A'}
        </div>

        <h2>Insights Summary (Nessencja Framework)</h2>

        <div class="section pain-points">
          <div class="section-title">🔴 Pain Points (${insights.pain_points?.length || 0})</div>
          <ul>
            ${(insights.pain_points || []).map((p: string) => `<li>${p}</li>`).join('')}
          </ul>
        </div>

        <div class="section stakeholders">
          <div class="section-title">👥 Stakeholder Map (${insights.stakeholders?.length || 0})</div>
          ${(insights.stakeholders || []).map((s: any) => `
            <div class="stakeholder">
              <span class="stakeholder-name">${s.name || s}</span>
              ${s.role ? `<span class="stakeholder-role"> - ${s.role}</span>` : ''}
              ${s.influence ? `<span class="stakeholder-influence influence-${s.influence}">${s.influence}</span>` : ''}
            </div>
          `).join('')}
        </div>

        <div class="section red-flags">
          <div class="section-title">⚠️ Red Flags (${insights.red_flags?.length || 0})</div>
          <ul>
            ${(insights.red_flags || []).map((f: string) => `<li>${f}</li>`).join('')}
          </ul>
        </div>

        <div class="section next-steps">
          <div class="section-title">✅ Next Steps (${insights.next_steps?.length || 0})</div>
          <ul>
            ${(insights.next_steps || []).map((s: string) => `<li>${s}</li>`).join('')}
          </ul>
        </div>

        <h2>Transcript Content</h2>
        <div class="transcript-content">${transcript.cleaned_content || transcript.raw_content}</div>

        <div class="footer">
          Generated by Sales Room - Proces OS on ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </div>
      </body>
      </html>
    `;

    // Open print window
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.focus();
      // Give time for content to load then trigger print
      setTimeout(() => {
        printWindow.print();
      }, 250);
      toast({
        title: 'Export Ready',
        description: 'Use your browser\'s "Save as PDF" option in the print dialog',
      });
    } else {
      toast({
        title: 'Export Failed',
        description: 'Please allow pop-ups for this site to export PDF',
        variant: 'destructive'
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Upload Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload Transcript
          </CardTitle>
          <CardDescription>
            Upload meeting transcripts for AI-powered analysis. Supported formats: .txt, .json, .vtt (max 10MB)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Deal Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="deal-select">Link to Deal *</Label>
              <Select value={selectedDeal} onValueChange={setSelectedDeal}>
                <SelectTrigger id="deal-select">
                  <SelectValue placeholder="Select a deal" />
                </SelectTrigger>
                <SelectContent>
                  {deals.map((deal) => (
                    <SelectItem key={deal.id} value={deal.id}>
                      {deal.company_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="platform-select">Source Platform</Label>
              <Select value={selectedPlatform} onValueChange={setSelectedPlatform}>
                <SelectTrigger id="platform-select">
                  <SelectValue placeholder="Select platform" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual Upload</SelectItem>
                  <SelectItem value="fireflies">Fireflies.ai</SelectItem>
                  <SelectItem value="otter">Otter.ai</SelectItem>
                  <SelectItem value="zoom">Zoom</SelectItem>
                  <SelectItem value="google_meet">Google Meet</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Drag and Drop Zone */}
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              isDragOver
                ? 'border-primary bg-primary/5'
                : uploadFiles.length > 0
                  ? 'border-green-500 bg-green-500/5'
                  : 'border-muted-foreground/25 hover:border-muted-foreground/50'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {uploadFiles.length > 0 ? (
              <div className="space-y-3">
                {/* Show all selected files */}
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {uploadFiles.map((file, index) => (
                    <div key={index} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                      <div className="flex items-center gap-2">
                        <FileText className="h-5 w-5 text-green-500" />
                        <div className="text-left">
                          <p className="font-medium text-sm">{file.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {(file.size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => {
                          setUploadFiles(prev => prev.filter((_, i) => i !== index));
                        }}
                        disabled={isUploading}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>

                {/* Summary */}
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    {uploadFiles.length} file{uploadFiles.length !== 1 ? 's' : ''} selected
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setUploadFiles([]);
                      setUploadProgress(0);
                      setUploadComplete(false);
                      setUploadError(null);
                      setUploadedCount(0);
                      if (fileInputRef.current) {
                        fileInputRef.current.value = '';
                      }
                    }}
                    disabled={isUploading}
                  >
                    Clear all
                  </Button>
                </div>

                {/* Progress Bar */}
                {(isUploading || uploadComplete) && (
                  <div className="space-y-2">
                    <Progress value={uploadProgress} className="h-2" />
                    <div className="flex items-center justify-center gap-2 text-sm">
                      {uploadComplete ? (
                        <>
                          <CheckCircle className="h-4 w-4 text-green-500" />
                          <span className="text-green-500">Upload complete! ({uploadFiles.length} files)</span>
                        </>
                      ) : (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Uploading {uploadedCount + 1} of {uploadFiles.length}...</span>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Error Message */}
                {uploadError && (
                  <div className="flex items-center justify-center gap-2 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4" />
                    <span>{uploadError}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <Cloud className="h-12 w-12 mx-auto text-muted-foreground" />
                <div>
                  <p className="font-medium">Drag and drop your transcript files here</p>
                  <p className="text-sm text-muted-foreground">or click to browse (supports multiple files)</p>
                </div>
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.json,.vtt"
                  multiple
                  className="hidden"
                  id="file-upload"
                  onChange={(e) => {
                    const files = e.target.files;
                    if (files && files.length > 0) handleFileSelect(files);
                  }}
                />
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Browse Files
                </Button>
              </div>
            )}
          </div>

          {/* Upload Button */}
          {uploadFiles.length > 0 && !uploadComplete && (
            <Button
              onClick={handleUpload}
              disabled={isUploading || !selectedDeal}
              className="w-full"
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload {uploadFiles.length} Transcript{uploadFiles.length !== 1 ? 's' : ''}
                </>
              )}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Transcripts List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Transcripts
              </CardTitle>
              <CardDescription>
                {transcripts.length} transcript{transcripts.length !== 1 ? 's' : ''} {searchQuery ? 'found' : 'uploaded'}
              </CardDescription>
            </div>
            {/* Search Input */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search transcripts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="pl-9 w-64"
                />
                {searchQuery && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6"
                    onClick={clearSearch}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
              <Button onClick={handleSearch} variant="secondary" size="sm">
                Search
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {transcripts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No transcripts uploaded yet</p>
              <p className="text-sm">Upload your first transcript above</p>
            </div>
          ) : (
            <div className="space-y-3">
              {transcripts.map((transcript) => (
                <div
                  key={transcript.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <FileText className="h-8 w-8 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{transcript.file_name}</p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>{transcript.deal_company || 'Unknown Deal'}</span>
                        <span>-</span>
                        <span>{getPlatformLabel(transcript.source_platform)}</span>
                        <span>-</span>
                        <span>{formatDate(transcript.created_at)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={transcript.processed ? 'default' : 'secondary'}>
                      {transcript.processed ? 'Analyzed' : 'Pending'}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setViewTranscript(transcript)}
                      title="View transcript"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setTimelineDeal(transcript.deal_id)}
                      title="View deal timeline"
                    >
                      <Clock className="h-4 w-4" />
                    </Button>
                    {!transcript.processed && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleAnalyze(transcript.id)}
                      >
                        Analyze
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteId(transcript.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* View Transcript Modal */}
      <Dialog open={!!viewTranscript} onOpenChange={(open) => {
        if (!open) {
          setViewTranscript(null);
          setIsEditing(false);
          setEditingInsights(null);
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle>{viewTranscript?.file_name}</DialogTitle>
                <DialogDescription>
                  {viewTranscript?.deal_company} - {viewTranscript && getPlatformLabel(viewTranscript.source_platform)}
                </DialogDescription>
              </div>
              {viewTranscript?.processed && viewTranscript.insights && !isEditing && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => viewTranscript && exportToPDF(viewTranscript)}>
                    <Download className="h-4 w-4 mr-2" />
                    Export PDF
                  </Button>
                  <Button variant="outline" size="sm" onClick={startEditingInsights}>
                    <Pencil className="h-4 w-4 mr-2" />
                    Edit Insights
                  </Button>
                </div>
              )}
              {isEditing && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={cancelEditing} disabled={isSaving}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={saveInsights} disabled={isSaving}>
                    {isSaving ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Save Changes
                  </Button>
                </div>
              )}
            </div>
          </DialogHeader>
          <div className="space-y-4">
            {viewTranscript?.processed && viewTranscript.insights && !isEditing && (() => {
              // Parse insights if it's a string
              const insights = typeof viewTranscript.insights === 'string'
                ? JSON.parse(viewTranscript.insights)
                : viewTranscript.insights;
              return (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Pain Points - Nessencja Framework */}
                  <Card>
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm text-red-600">Pain Points</CardTitle>
                    </CardHeader>
                    <CardContent className="py-2">
                      <ul className="list-disc list-inside text-sm space-y-1">
                        {(insights.pain_points || []).map((pain: string, i: number) => (
                          <li key={i}>{pain}</li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>

                  {/* Stakeholders - Nessencja Framework (Power) */}
                  <Card>
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm text-blue-600">Stakeholder Map</CardTitle>
                    </CardHeader>
                    <CardContent className="py-2">
                      <ul className="list-disc list-inside text-sm space-y-1">
                        {(insights.stakeholders || []).map((stakeholder: any, i: number) => (
                          <li key={i}>
                            <span className="font-medium">{stakeholder.name || stakeholder}</span>
                            {stakeholder.role && <span className="text-muted-foreground"> - {stakeholder.role}</span>}
                            {stakeholder.influence && <Badge variant="outline" className="ml-2 text-xs">{stakeholder.influence}</Badge>}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>

                  {/* Red Flags - Nessencja Framework (Risk) */}
                  <Card>
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm text-orange-600">Red Flags</CardTitle>
                    </CardHeader>
                    <CardContent className="py-2">
                      <ul className="list-disc list-inside text-sm space-y-1">
                        {(insights.red_flags || []).map((flag: string, i: number) => (
                          <li key={i}>{flag}</li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>

                  {/* Next Steps - Nessencja Framework */}
                  <Card>
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm text-green-600">Next Steps</CardTitle>
                    </CardHeader>
                    <CardContent className="py-2">
                      <ul className="list-disc list-inside text-sm space-y-1">
                        {(insights.next_steps || []).map((step: string, i: number) => (
                          <li key={i}>{step}</li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                </div>
              );
            })()}

            {/* Edit Mode */}
            {isEditing && editingInsights && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Edit Pain Points */}
                <Card>
                  <CardHeader className="py-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm text-red-600">Pain Points</CardTitle>
                      <Button variant="ghost" size="sm" onClick={addPainPoint}>
                        <Plus className="h-3 w-3 mr-1" />
                        Add
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="py-2 space-y-2">
                    {editingInsights.pain_points.map((pain, i) => (
                      <div key={i} className="flex gap-2">
                        <Input
                          value={pain}
                          onChange={(e) => updatePainPoint(i, e.target.value)}
                          placeholder="Enter pain point..."
                          className="text-sm"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 shrink-0"
                          onClick={() => removePainPoint(i)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    {editingInsights.pain_points.length === 0 && (
                      <p className="text-sm text-muted-foreground">No pain points. Click Add to create one.</p>
                    )}
                  </CardContent>
                </Card>

                {/* Edit Stakeholders */}
                <Card>
                  <CardHeader className="py-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm text-blue-600">Stakeholder Map</CardTitle>
                      <Button variant="ghost" size="sm" onClick={addStakeholder}>
                        <Plus className="h-3 w-3 mr-1" />
                        Add
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="py-2 space-y-3">
                    {editingInsights.stakeholders.map((stakeholder, i) => (
                      <div key={i} className="space-y-2 p-2 border rounded">
                        <div className="flex gap-2">
                          <Input
                            value={stakeholder.name}
                            onChange={(e) => updateStakeholder(i, 'name', e.target.value)}
                            placeholder="Name"
                            className="text-sm"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 shrink-0"
                            onClick={() => removeStakeholder(i)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="flex gap-2">
                          <Input
                            value={stakeholder.role}
                            onChange={(e) => updateStakeholder(i, 'role', e.target.value)}
                            placeholder="Role"
                            className="text-sm"
                          />
                          <Select
                            value={stakeholder.influence}
                            onValueChange={(value) => updateStakeholder(i, 'influence', value)}
                          >
                            <SelectTrigger className="w-28">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="high">High</SelectItem>
                              <SelectItem value="medium">Medium</SelectItem>
                              <SelectItem value="low">Low</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    ))}
                    {editingInsights.stakeholders.length === 0 && (
                      <p className="text-sm text-muted-foreground">No stakeholders. Click Add to create one.</p>
                    )}
                  </CardContent>
                </Card>

                {/* Edit Red Flags */}
                <Card>
                  <CardHeader className="py-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm text-orange-600">Red Flags</CardTitle>
                      <Button variant="ghost" size="sm" onClick={addRedFlag}>
                        <Plus className="h-3 w-3 mr-1" />
                        Add
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="py-2 space-y-2">
                    {editingInsights.red_flags.map((flag, i) => (
                      <div key={i} className="flex gap-2">
                        <Input
                          value={flag}
                          onChange={(e) => updateRedFlag(i, e.target.value)}
                          placeholder="Enter red flag..."
                          className="text-sm"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 shrink-0"
                          onClick={() => removeRedFlag(i)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    {editingInsights.red_flags.length === 0 && (
                      <p className="text-sm text-muted-foreground">No red flags. Click Add to create one.</p>
                    )}
                  </CardContent>
                </Card>

                {/* Edit Next Steps */}
                <Card>
                  <CardHeader className="py-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm text-green-600">Next Steps</CardTitle>
                      <Button variant="ghost" size="sm" onClick={addNextStep}>
                        <Plus className="h-3 w-3 mr-1" />
                        Add
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="py-2 space-y-2">
                    {editingInsights.next_steps.map((step, i) => (
                      <div key={i} className="flex gap-2">
                        <Input
                          value={step}
                          onChange={(e) => updateNextStep(i, e.target.value)}
                          placeholder="Enter next step..."
                          className="text-sm"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 shrink-0"
                          onClick={() => removeNextStep(i)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    {editingInsights.next_steps.length === 0 && (
                      <p className="text-sm text-muted-foreground">No next steps. Click Add to create one.</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            <div>
              <Label className="text-sm font-medium">Transcript Content</Label>
              <div className="mt-2 p-4 bg-muted rounded-lg text-sm font-mono whitespace-pre-wrap max-h-64 overflow-y-auto">
                {viewTranscript?.cleaned_content || viewTranscript?.raw_content}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Timeline View Modal */}
      <Dialog open={!!timelineDeal} onOpenChange={() => setTimelineDeal(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Deal Timeline - {deals.find(d => d.id === timelineDeal)?.company_name || 'Unknown Deal'}
            </DialogTitle>
            <DialogDescription>
              Evolution of insights across meetings
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            {/* Get transcripts for this deal, sorted chronologically */}
            {(() => {
              const dealTranscripts = transcripts
                .filter(t => t.deal_id === timelineDeal)
                .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

              if (dealTranscripts.length === 0) {
                return (
                  <div className="text-center py-8 text-muted-foreground">
                    <Clock className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No transcripts found for this deal</p>
                  </div>
                );
              }

              // Collect all pain points across meetings for evolution display
              const painPointEvolution: { date: string; fileName: string; painPoints: string[] }[] = [];

              dealTranscripts.forEach(t => {
                if (t.processed && t.insights) {
                  const insights = typeof t.insights === 'string' ? JSON.parse(t.insights) : t.insights;
                  painPointEvolution.push({
                    date: t.created_at,
                    fileName: t.file_name,
                    painPoints: insights.pain_points || []
                  });
                }
              });

              return (
                <>
                  {/* Timeline Display */}
                  <div className="relative">
                    {/* Timeline line */}
                    <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-muted-foreground/20" />

                    {dealTranscripts.map((transcript, index) => {
                      const insights = transcript.processed && transcript.insights
                        ? (typeof transcript.insights === 'string' ? JSON.parse(transcript.insights) : transcript.insights)
                        : null;

                      return (
                        <div key={transcript.id} className="relative pl-10 pb-6">
                          {/* Timeline dot */}
                          <div className={`absolute left-2 top-1 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                            transcript.processed
                              ? 'bg-green-500 border-green-600'
                              : 'bg-muted border-muted-foreground/50'
                          }`}>
                            {transcript.processed && (
                              <CheckCircle className="h-3 w-3 text-white" />
                            )}
                          </div>

                          {/* Meeting card */}
                          <Card className={index === dealTranscripts.length - 1 ? 'border-primary' : ''}>
                            <CardHeader className="py-3">
                              <div className="flex items-center justify-between">
                                <div>
                                  <CardTitle className="text-sm flex items-center gap-2">
                                    <FileText className="h-4 w-4" />
                                    {transcript.file_name}
                                    {index === dealTranscripts.length - 1 && (
                                      <Badge variant="outline" className="text-xs">Latest</Badge>
                                    )}
                                  </CardTitle>
                                  <CardDescription className="text-xs mt-1">
                                    {formatDate(transcript.created_at)} • {getPlatformLabel(transcript.source_platform)}
                                  </CardDescription>
                                </div>
                                <Badge variant={transcript.processed ? 'default' : 'secondary'}>
                                  {transcript.processed ? 'Analyzed' : 'Pending'}
                                </Badge>
                              </div>
                            </CardHeader>
                            {insights && (
                              <CardContent className="py-2">
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                  <div>
                                    <p className="font-medium text-red-600 mb-1">Pain Points ({insights.pain_points?.length || 0})</p>
                                    <ul className="list-disc list-inside text-xs space-y-1 text-muted-foreground">
                                      {(insights.pain_points || []).slice(0, 3).map((p: string, i: number) => (
                                        <li key={i} className="truncate">{p}</li>
                                      ))}
                                      {(insights.pain_points?.length || 0) > 3 && (
                                        <li className="text-muted-foreground/60">+{insights.pain_points.length - 3} more</li>
                                      )}
                                    </ul>
                                  </div>
                                  <div>
                                    <p className="font-medium text-blue-600 mb-1">Stakeholders ({insights.stakeholders?.length || 0})</p>
                                    <ul className="list-disc list-inside text-xs space-y-1 text-muted-foreground">
                                      {(insights.stakeholders || []).slice(0, 3).map((s: any, i: number) => (
                                        <li key={i}>{s.name || s} {s.role ? `(${s.role})` : ''}</li>
                                      ))}
                                    </ul>
                                  </div>
                                </div>
                              </CardContent>
                            )}
                          </Card>
                        </div>
                      );
                    })}
                  </div>

                  {/* Pain Point Evolution Summary */}
                  {painPointEvolution.length > 1 && (
                    <Card className="bg-muted/50">
                      <CardHeader className="py-3">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <TrendingUp className="h-4 w-4 text-red-600" />
                          Pain Point Evolution
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="py-2">
                        <div className="space-y-3">
                          {painPointEvolution.map((meeting, index) => (
                            <div key={index} className="flex items-start gap-3">
                              <div className="text-xs text-muted-foreground whitespace-nowrap mt-0.5">
                                {new Date(meeting.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </div>
                              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                              <div className="flex-1">
                                <p className="text-xs font-medium">{meeting.fileName}</p>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {meeting.painPoints.slice(0, 3).map((p, i) => (
                                    <Badge key={i} variant="outline" className="text-xs font-normal">
                                      {p.length > 30 ? p.substring(0, 30) + '...' : p}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </>
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Transcript</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this transcript? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
