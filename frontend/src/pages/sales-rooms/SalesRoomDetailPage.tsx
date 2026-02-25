import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { API_URL } from '@/lib/api';
import { type StakeholderSection } from '@/lib/sales-room-defaults';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, ArrowLeft, ExternalLink, Eye, Clock, Users, BarChart3, Copy, CheckCircle2, CopyPlus, Edit3, MessageCircle, Upload, Trash2, FileText, Pencil } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from '@/hooks/use-toast';

interface SalesRoom {
  id: string;
  deal_id: string;
  deal_company: string;
  template_type: string;
  public_url_slug: string;
  offer_content: string | null;
  sections: StakeholderSection[] | null;
  chatbot_enabled: boolean;
  video_url: string | null;
  calendly_link: string | null;
  is_expired: boolean;
  password_protected: boolean;
  created_at: string;
  created_by_name: string;
  attachment_filename: string | null;
  attachment_mimetype: string | null;
  attachment_size: number | null;
}

interface AnalyticsEntry {
  id: string;
  visitor_role: string | null;
  section_viewed: string;
  time_spent_seconds: number;
  visited_at: string;
}

interface AnalyticsStats {
  totalViews: number;
  uniqueRoles: string[];
  sectionViews: Record<string, number>;
  totalTimeSpent: number;
}

interface ChatbotLog {
  id: string;
  question: string;
  answer: string;
  asked_at: string;
}

export default function SalesRoomDetailPage() {
  const { id } = useParams();
  const { toast } = useToast();
  const [salesRoom, setSalesRoom] = useState<SalesRoom | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsEntry[]>([]);
  const [stats, setStats] = useState<AnalyticsStats | null>(null);
  const [chatbotLogs, setChatbotLogs] = useState<ChatbotLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [cloneDialogOpen, setCloneDialogOpen] = useState(false);
  const [availableDeals, setAvailableDeals] = useState<{ id: string; company_name: string }[]>([]);
  const [selectedDealForClone, setSelectedDealForClone] = useState('');
  const [cloning, setCloning] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [previewTab, setPreviewTab] = useState('edit');

  // Section editing
  const [editingSectionIdx, setEditingSectionIdx] = useState<number | null>(null);
  const [editSectionTitle, setEditSectionTitle] = useState('');
  const [editSectionContent, setEditSectionContent] = useState('');
  const [savingSection, setSavingSection] = useState(false);

  // Attachment
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [deletingAttachment, setDeletingAttachment] = useState(false);

  const token = localStorage.getItem('token');

  useEffect(() => {
    const fetchSalesRoom = async () => {
      try {
        setLoading(true);

        // Fetch sales room details
        const response = await fetch(`${API_URL}/sales-rooms/${id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
          throw new Error('Failed to fetch Sales Room');
        }

        const data = await response.json();
        setSalesRoom(data.salesRoom);
        setAnalytics(data.analytics || []);

        // Fetch analytics stats
        const analyticsResponse = await fetch(`${API_URL}/sales-rooms/${id}/analytics`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (analyticsResponse.ok) {
          const analyticsData = await analyticsResponse.json();
          setStats(analyticsData.stats);
        }

        // Fetch chatbot logs
        const chatbotLogsResponse = await fetch(`${API_URL}/sales-rooms/${id}/chatbot-logs`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (chatbotLogsResponse.ok) {
          const chatbotData = await chatbotLogsResponse.json();
          setChatbotLogs(chatbotData.logs || []);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchSalesRoom();
  }, [id]);

  const copyPublicUrl = () => {
    if (salesRoom) {
      const publicUrl = `${window.location.origin}/room/${salesRoom.public_url_slug}`;
      navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      toast({ title: 'Link copied!', description: 'Public URL copied to clipboard' });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const fetchAvailableDeals = async () => {
    try {
      const response = await fetch(`${API_URL}/deals?has_sales_room=false&limit=1000&sort_by=created_at&sort_order=desc`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setAvailableDeals(data.deals || []);
      }
    } catch (err) {
      console.error('Failed to fetch deals:', err);
    }
  };

  const openEditDialog = () => {
    setEditContent(salesRoom?.offer_content || '');
    setPreviewTab('edit');
    setEditDialogOpen(true);
  };

  const handleSaveContent = async () => {
    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/sales-rooms/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ offer_content: editContent })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save content');
      }

      setSalesRoom(prev => prev ? { ...prev, offer_content: editContent } : null);
      toast({ title: 'Success!', description: 'Content saved successfully' });
      setEditDialogOpen(false);
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to save content',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  // Section edit
  const openSectionEditor = (idx: number) => {
    if (!salesRoom?.sections) return;
    const section = salesRoom.sections[idx];
    setEditingSectionIdx(idx);
    setEditSectionTitle(section.title);
    setEditSectionContent(section.content);
  };

  const handleSaveSection = async () => {
    if (editingSectionIdx === null || !salesRoom?.sections) return;
    setSavingSection(true);

    const updatedSections = salesRoom.sections.map((s, i) =>
      i === editingSectionIdx ? { ...s, title: editSectionTitle, content: editSectionContent } : s
    );

    try {
      const response = await fetch(`${API_URL}/sales-rooms/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ sections: updatedSections })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save section');
      }

      setSalesRoom(prev => prev ? { ...prev, sections: updatedSections } : null);
      toast({ title: 'Success!', description: 'Section saved' });
      setEditingSectionIdx(null);
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to save section',
        variant: 'destructive'
      });
    } finally {
      setSavingSection(false);
    }
  };

  // Attachment upload
  const handleAttachmentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingAttachment(true);
    try {
      const formData = new FormData();
      formData.append('attachment', file);
      if (salesRoom?.sections) {
        formData.append('stakeholders', JSON.stringify(
          salesRoom.sections.map(s => ({ key: s.key, label: s.label }))
        ));
      }

      const response = await fetch(`${API_URL}/sales-rooms/${id}/attachment`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to upload attachment');
      }

      // Update local state
      setSalesRoom(prev => prev ? {
        ...prev,
        attachment_filename: file.name,
        attachment_mimetype: file.type,
        attachment_size: file.size,
        sections: data.sections || prev.sections,
      } : null);

      toast({
        title: 'Success!',
        description: data.sections ? 'Attachment uploaded and sections generated by AI' : 'Attachment uploaded'
      });
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to upload attachment',
        variant: 'destructive'
      });
    } finally {
      setUploadingAttachment(false);
      // Reset input
      e.target.value = '';
    }
  };

  // Attachment delete
  const handleAttachmentDelete = async () => {
    setDeletingAttachment(true);
    try {
      const response = await fetch(`${API_URL}/sales-rooms/${id}/attachment`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete attachment');
      }

      setSalesRoom(prev => prev ? {
        ...prev,
        attachment_filename: null,
        attachment_mimetype: null,
        attachment_size: null,
      } : null);

      toast({ title: 'Attachment removed' });
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to delete',
        variant: 'destructive'
      });
    } finally {
      setDeletingAttachment(false);
    }
  };

  // Simple markdown to HTML converter for preview
  const renderMarkdown = (text: string) => {
    if (!text) return '<p class="text-muted-foreground">No content yet. Click Edit to add content.</p>';

    return text
      .replace(/^### (.*$)/gim, '<h3 class="text-lg font-semibold mt-4 mb-2">$1</h3>')
      .replace(/^## (.*$)/gim, '<h2 class="text-xl font-bold mt-6 mb-3">$1</h2>')
      .replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold mt-6 mb-4">$1</h1>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code class="bg-muted px-1 py-0.5 rounded text-sm">$1</code>')
      .replace(/\[([^\]]+)\]\(([^\)]+)\)/g, '<a href="$2" class="text-primary underline" target="_blank">$1</a>')
      .replace(/^\- (.*$)/gim, '<li class="ml-4">$1</li>')
      .replace(/\n/g, '<br />');
  };

  const handleClone = async () => {
    if (!selectedDealForClone) {
      toast({ title: 'Error', description: 'Please select a deal', variant: 'destructive' });
      return;
    }

    setCloning(true);
    try {
      const response = await fetch(`${API_URL}/sales-rooms/${id}/clone`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ deal_id: selectedDealForClone })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to clone Sales Room');
      }

      toast({ title: 'Success!', description: 'Sales Room cloned successfully' });
      setCloneDialogOpen(false);
      window.location.href = `/sales-rooms/${data.salesRoom.id}`;
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to clone Sales Room',
        variant: 'destructive'
      });
    } finally {
      setCloning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !salesRoom) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-red-500">{error || 'Sales Room not found'}</p>
          <Link to="/sales-rooms">
            <Button variant="outline" className="mt-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Sales Rooms
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  const publicUrl = `/room/${salesRoom.public_url_slug}`;
  const sections = salesRoom.sections;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <Link to="/sales-rooms">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{salesRoom.deal_company}</h1>
            <p className="text-muted-foreground capitalize">
              {salesRoom.template_type.replace(/_/g, ' ')} • Created by {salesRoom.created_by_name}
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" onClick={openEditDialog}>
                <Edit3 className="h-4 w-4 mr-2" />
                Edit Content
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
              <DialogHeader>
                <DialogTitle>Edit Sales Room Content</DialogTitle>
                <DialogDescription>
                  Use Markdown to format your content. Changes will be reflected in the public Sales Room.
                </DialogDescription>
              </DialogHeader>
              <div className="flex-1 overflow-hidden flex flex-col">
                <Tabs value={previewTab} onValueChange={setPreviewTab} className="flex-1 flex flex-col">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="edit">Edit</TabsTrigger>
                    <TabsTrigger value="preview">Preview</TabsTrigger>
                  </TabsList>
                  <TabsContent value="edit" className="flex-1 mt-4">
                    <Textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      placeholder="# Your Offer&#10;&#10;Write your offer content using Markdown..."
                      className="h-[300px] font-mono text-sm resize-none"
                    />
                  </TabsContent>
                  <TabsContent value="preview" className="flex-1 mt-4">
                    <div
                      className="h-[300px] p-4 border rounded-lg bg-background overflow-auto prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(editContent) }}
                    />
                  </TabsContent>
                </Tabs>
              </div>
              <div className="flex justify-between items-center pt-4 border-t mt-4">
                <p className="text-sm text-muted-foreground">
                  Supports: # Headers, **bold**, *italic*, `code`, [links](url), - lists
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleSaveContent} disabled={saving}>
                    {saving ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      'Save Changes'
                    )}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          <Button variant="outline" onClick={copyPublicUrl}>
            {copied ? <CheckCircle2 className="h-4 w-4 mr-2 text-green-500" /> : <Copy className="h-4 w-4 mr-2" />}
            {copied ? 'Copied!' : 'Copy Link'}
          </Button>
          <Dialog open={cloneDialogOpen} onOpenChange={(open) => {
            setCloneDialogOpen(open);
            if (open) fetchAvailableDeals();
          }}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <CopyPlus className="h-4 w-4 mr-2" />
                Clone
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Clone Sales Room</DialogTitle>
                <DialogDescription>
                  Create a copy of this Sales Room for another deal.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Select Target Deal</label>
                  {availableDeals.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No deals available without a Sales Room.</p>
                  ) : (
                    <div className="max-h-60 overflow-y-auto space-y-2">
                      {availableDeals.map((deal) => (
                        <div
                          key={deal.id}
                          onClick={() => setSelectedDealForClone(deal.id)}
                          className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                            selectedDealForClone === deal.id
                              ? 'border-primary bg-primary/5'
                              : 'border-border hover:border-primary/50'
                          }`}
                        >
                          <p className="font-medium">{deal.company_name}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setCloneDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleClone} disabled={cloning || !selectedDealForClone}>
                    {cloning ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Cloning...
                      </>
                    ) : (
                      <>
                        <CopyPlus className="h-4 w-4 mr-2" />
                        Clone Sales Room
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          <a href={publicUrl} target="_blank" rel="noopener noreferrer">
            <Button>
              <ExternalLink className="h-4 w-4 mr-2" />
              Open Public Room
            </Button>
          </a>
        </div>
      </div>

      {/* Analytics Overview */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Eye className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Views</p>
                <p className="text-2xl font-bold">{stats?.totalViews || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Users className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Unique Roles</p>
                <p className="text-2xl font-bold">{stats?.uniqueRoles?.length || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <BarChart3 className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Sections Viewed</p>
                <p className="text-2xl font-bold">{Object.keys(stats?.sectionViews || {}).length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <Clock className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Time Spent</p>
                <p className="text-2xl font-bold">{Math.round((stats?.totalTimeSpent || 0) / 60)}m</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stakeholder Sections Management */}
      {sections && sections.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Stakeholder Sections
            </CardTitle>
            <CardDescription>Edit personalized content for each stakeholder</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {sections.map((section, idx) => (
                <div key={section.key} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{section.label}</p>
                    <p className="text-sm text-muted-foreground truncate">{section.title}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => openSectionEditor(idx)}>
                    <Pencil className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Attachment Management */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Offer Document
          </CardTitle>
          <CardDescription>
            Upload a PDF or DOCX — AI will generate stakeholder sections from the content
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {salesRoom.attachment_filename ? (
            <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
              <div className="flex items-center gap-3">
                <FileText className="h-8 w-8 text-blue-500" />
                <div>
                  <p className="font-medium">{salesRoom.attachment_filename}</p>
                  <p className="text-sm text-muted-foreground">
                    {salesRoom.attachment_size ? `${(salesRoom.attachment_size / 1024 / 1024).toFixed(1)} MB` : ''}
                    {salesRoom.attachment_mimetype ? ` • ${salesRoom.attachment_mimetype.split('/').pop()?.toUpperCase()}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <label>
                  <input
                    type="file"
                    accept=".pdf,.docx,.doc,.txt"
                    className="hidden"
                    onChange={handleAttachmentUpload}
                  />
                  <Button variant="outline" size="sm" asChild disabled={uploadingAttachment}>
                    <span className="cursor-pointer">
                      {uploadingAttachment ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
                      Replace
                    </span>
                  </Button>
                </label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleAttachmentDelete}
                  disabled={deletingAttachment}
                  className="text-destructive hover:text-destructive"
                >
                  {deletingAttachment ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          ) : (
            <label>
              <input
                type="file"
                accept=".pdf,.docx,.doc,.txt"
                className="hidden"
                onChange={handleAttachmentUpload}
              />
              <div className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors">
                {uploadingAttachment ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Uploading and generating sections...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="h-8 w-8 text-muted-foreground" />
                    <p className="font-medium">Upload offer document</p>
                    <p className="text-sm text-muted-foreground">PDF, DOCX, or TXT up to 20MB</p>
                  </div>
                )}
              </div>
            </label>
          )}
        </CardContent>
      </Card>

      {/* Section Views Breakdown */}
      {stats && Object.keys(stats.sectionViews).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Section Views</CardTitle>
            <CardDescription>Which sections your clients viewed</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(stats.sectionViews).map(([section, count]) => (
                <div key={section} className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="flex justify-between mb-1">
                      <span className="capitalize font-medium">{section}</span>
                      <span className="text-muted-foreground">{count} views</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div
                        className="bg-primary rounded-full h-2"
                        style={{ width: `${(count / stats.totalViews) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Views */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Latest visits to your Sales Room</CardDescription>
        </CardHeader>
        <CardContent>
          {analytics.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No views yet. Share the public link to start tracking.
            </p>
          ) : (
            <div className="space-y-3">
              {analytics.slice(0, 20).map((entry) => (
                <div key={entry.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-muted rounded-full">
                      <Eye className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-medium capitalize">{entry.section_viewed}</p>
                      <p className="text-sm text-muted-foreground">
                        {entry.visitor_role ? `Role: ${entry.visitor_role}` : 'Unknown visitor'}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {new Date(entry.visited_at).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Chatbot Conversation Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            Chatbot Conversations
          </CardTitle>
          <CardDescription>See what visitors asked the chatbot</CardDescription>
        </CardHeader>
        <CardContent>
          {chatbotLogs.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No chatbot conversations yet.
            </p>
          ) : (
            <div className="space-y-4">
              {chatbotLogs.slice(0, 10).map((log) => (
                <div key={log.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-blue-600">Visitor asked:</p>
                      <p className="mt-1">{log.question}</p>
                    </div>
                    <p className="text-xs text-muted-foreground whitespace-nowrap ml-4">
                      {new Date(log.asked_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="bg-muted/50 rounded p-3">
                    <p className="text-sm font-medium text-green-600">Bot response:</p>
                    <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">
                      {log.answer.length > 200 ? log.answer.substring(0, 200) + '...' : log.answer}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section Edit Dialog */}
      <Dialog open={editingSectionIdx !== null} onOpenChange={(open) => { if (!open) setEditingSectionIdx(null); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              Edit Section — {editingSectionIdx !== null && sections ? sections[editingSectionIdx]?.label : ''}
            </DialogTitle>
            <DialogDescription>
              Customize the section content. Use Markdown for formatting.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 flex-1 overflow-y-auto">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={editSectionTitle}
                onChange={(e) => setEditSectionTitle(e.target.value)}
                placeholder="Section title"
              />
            </div>
            <div className="space-y-2">
              <Label>Content (Markdown)</Label>
              <Textarea
                value={editSectionContent}
                onChange={(e) => setEditSectionContent(e.target.value)}
                placeholder="Section content..."
                className="min-h-[250px] font-mono text-sm"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setEditingSectionIdx(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveSection} disabled={savingSection}>
              {savingSection ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Section'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
