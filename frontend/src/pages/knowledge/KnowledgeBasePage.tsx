import { useState, useEffect, useRef, useCallback } from 'react';
import { API_URL } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  Search, Plus, FileText, HelpCircle, Users, FileBox, Trash2, Edit, X, Check, Loader2, Upload, File, FileJson, FileType, Eye, EyeOff, Download
} from 'lucide-react';

interface KnowledgeItem {
  id: string;
  type: 'case_study' | 'faq' | 'competitor_sheet' | 'offer_template' | 'document';
  title: string;
  content: string;
  file_url?: string;
  tags: string[];
  is_shared: number;
  created_by: string;
  created_by_name: string;
  created_at: string;
  updated_at: string;
}

const typeLabels: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  case_study: { label: 'Case Study', icon: <FileText className="h-4 w-4" />, color: 'bg-blue-100 text-blue-800' },
  faq: { label: 'FAQ', icon: <HelpCircle className="h-4 w-4" />, color: 'bg-green-100 text-green-800' },
  competitor_sheet: { label: 'Competitor Sheet', icon: <Users className="h-4 w-4" />, color: 'bg-orange-100 text-orange-800' },
  offer_template: { label: 'Offer Template', icon: <FileBox className="h-4 w-4" />, color: 'bg-purple-100 text-purple-800' },
  document: { label: 'Document', icon: <File className="h-4 w-4" />, color: 'bg-slate-100 text-slate-800' },
};

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default function KnowledgeBasePage() {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingItem, setEditingItem] = useState<KnowledgeItem | null>(null);
  const [formData, setFormData] = useState({
    type: 'case_study',
    title: '',
    content: '',
    tags: ''
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  // Upload state
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadFormData, setUploadFormData] = useState({
    type: 'document',
    tags: ''
  });
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number; fileName: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const { toast } = useToast();

  const allowedExtensions = ['pdf', 'txt', 'md', 'json', 'docx'];

  const validateFiles = (files: FileList | File[]): File[] => {
    const valid: File[] = [];
    for (const file of Array.from(files)) {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (ext && allowedExtensions.includes(ext)) {
        valid.push(file);
      }
    }
    return valid;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const valid = validateFiles(files);
    if (valid.length === 0) {
      toast({
        title: 'Invalid file type',
        description: `Supported formats: ${allowedExtensions.map(e => `.${e}`).join(', ')}`,
        variant: 'destructive'
      });
      return;
    }
    if (valid.length < files.length) {
      toast({
        title: 'Some files skipped',
        description: `${files.length - valid.length} file(s) had unsupported formats`,
      });
    }
    setUploadFiles(prev => [...prev, ...valid]);
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    const valid = validateFiles(files);
    if (valid.length === 0) {
      toast({
        title: 'Invalid file type',
        description: `Supported formats: ${allowedExtensions.map(e => `.${e}`).join(', ')}`,
        variant: 'destructive'
      });
      return;
    }
    setUploadFiles(prev => [...prev, ...valid]);
  }, []);

  const removeUploadFile = (index: number) => {
    setUploadFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (uploadFiles.length === 0) return;

    try {
      setUploading(true);
      const token = localStorage.getItem('token');
      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < uploadFiles.length; i++) {
        const file = uploadFiles[i];
        setUploadProgress({ current: i + 1, total: uploadFiles.length, fileName: file.name });

        const formDataToSend = new FormData();
        formDataToSend.append('file', file);
        formDataToSend.append('type', uploadFormData.type);
        formDataToSend.append('title', file.name.replace(/\.[^/.]+$/, ''));
        if (uploadFormData.tags) {
          formDataToSend.append('tags', uploadFormData.tags);
        }

        try {
          const response = await fetch(`${API_URL}/knowledge/upload`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`
            },
            body: formDataToSend
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Upload failed');
          }

          const data = await response.json();
          if (data.extraction && !data.extraction.success) {
            toast({
              title: `Warning: ${file.name}`,
              description: `Content extraction issue: ${data.extraction.error}`,
            });
          }
          successCount++;
        } catch (err: any) {
          errorCount++;
          console.error(`Failed to upload ${file.name}:`, err);
        }
      }

      if (successCount > 0) {
        toast({
          title: 'Upload complete',
          description: `${successCount} document${successCount > 1 ? 's' : ''} uploaded${errorCount > 0 ? `, ${errorCount} failed` : ''}`
        });
      }
      if (errorCount > 0 && successCount === 0) {
        toast({
          title: 'Upload failed',
          description: `All ${errorCount} document(s) failed to upload`,
          variant: 'destructive'
        });
      }

      // Reset
      setUploadFiles([]);
      setUploadFormData({ type: 'document', tags: '' });
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      fetchItems();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to upload documents',
        variant: 'destructive'
      });
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  const cancelUpload = () => {
    setUploadFiles([]);
    setUploadFormData({ type: 'document', tags: '' });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const fetchItems = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      if (searchQuery) params.append('search', searchQuery);
      if (selectedType) params.append('type', selectedType);

      const response = await fetch(`${API_URL}/knowledge?${params}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) throw new Error('Failed to fetch items');

      const data = await response.json();
      setItems(data.items || []);
    } catch (error) {
      console.error('Error fetching knowledge base:', error);
      toast({
        title: 'Error',
        description: 'Failed to load knowledge base items',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, [selectedType]);

  const handleSearch = () => fetchItems();

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      toast({ title: 'Error', description: 'Title is required', variant: 'destructive' });
      return;
    }

    try {
      setSaving(true);
      const token = localStorage.getItem('token');
      const tags = formData.tags ? formData.tags.split(',').map(t => t.trim()).filter(t => t) : [];

      const response = await fetch(`${API_URL}/knowledge`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: formData.type,
          title: formData.title.trim(),
          content: formData.content,
          tags
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create item');
      }

      toast({ title: 'Success', description: 'Knowledge base item created successfully' });
      setShowCreateForm(false);
      setFormData({ type: 'case_study', title: '', content: '', tags: '' });
      fetchItems();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to create item', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    if (!formData.title.trim()) {
      toast({ title: 'Error', description: 'Title is required', variant: 'destructive' });
      return;
    }

    try {
      setSaving(true);
      const token = localStorage.getItem('token');
      const tags = formData.tags ? formData.tags.split(',').map(t => t.trim()).filter(t => t) : [];

      const response = await fetch(`${API_URL}/knowledge/${editingItem.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: formData.title.trim(),
          content: formData.content,
          tags
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update item');
      }

      toast({ title: 'Success', description: 'Item updated successfully' });
      setEditingItem(null);
      setFormData({ type: 'case_study', title: '', content: '', tags: '' });
      fetchItems();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to update item', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this item?')) return;

    try {
      setDeleting(id);
      const token = localStorage.getItem('token');

      const response = await fetch(`${API_URL}/knowledge/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete item');
      }

      toast({ title: 'Success', description: 'Item deleted successfully' });
      fetchItems();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to delete item', variant: 'destructive' });
    } finally {
      setDeleting(null);
    }
  };

  const startEditing = (item: KnowledgeItem) => {
    setEditingItem(item);
    setFormData({
      type: item.type,
      title: item.title,
      content: item.content || '',
      tags: item.tags?.join(', ') || ''
    });
    setShowCreateForm(false);
  };

  const cancelEditing = () => {
    setEditingItem(null);
    setFormData({ type: 'case_study', title: '', content: '', tags: '' });
  };

  const cancelCreate = () => {
    setShowCreateForm(false);
    setFormData({ type: 'case_study', title: '', content: '', tags: '' });
  };

  const getFileIcon = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'pdf': return <FileText className="h-4 w-4 text-red-500" />;
      case 'json': return <FileJson className="h-4 w-4 text-yellow-600" />;
      case 'md': return <FileType className="h-4 w-4 text-blue-500" />;
      case 'txt': return <FileText className="h-4 w-4 text-gray-500" />;
      case 'docx': return <FileText className="h-4 w-4 text-blue-600" />;
      default: return <File className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">Knowledge Base</h1>
          <p className="text-muted-foreground">Manage documents, case studies, FAQs, and sales materials</p>
        </div>
        <div className="flex gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept=".pdf,.docx,.md,.txt,.json"
            className="hidden"
            multiple
          />
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-4 w-4 mr-2" />
            Upload Documents
          </Button>
          <Button onClick={() => { setShowCreateForm(true); setEditingItem(null); }}>
            <Plus className="h-4 w-4 mr-2" />
            Add Item
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 flex gap-2">
              <Input
                placeholder="Search by title, content, or tags..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                className="flex-1"
              />
              <Button onClick={handleSearch} variant="secondary">
                <Search className="h-4 w-4" />
              </Button>
            </div>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="px-3 py-2 rounded-md border bg-background"
            >
              <option value="">All Types</option>
              <option value="document">Documents</option>
              <option value="case_study">Case Studies</option>
              <option value="faq">FAQs</option>
              <option value="competitor_sheet">Competitor Sheets</option>
              <option value="offer_template">Offer Templates</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Drop Zone & Upload Area */}
      <div
        ref={dropZoneRef}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
          isDragging
            ? 'border-primary bg-primary/5'
            : uploadFiles.length > 0
            ? 'border-green-300 bg-green-50/50'
            : 'border-muted-foreground/25 hover:border-muted-foreground/50'
        }`}
        onClick={() => uploadFiles.length === 0 && fileInputRef.current?.click()}
      >
        {uploadFiles.length === 0 ? (
          <div className="py-4">
            <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm font-medium">Drop files here or click to browse</p>
            <p className="text-xs text-muted-foreground mt-1">
              Supports PDF, TXT, Markdown, JSON, DOCX • Max 20MB per file
            </p>
          </div>
        ) : (
          <div className="space-y-4" onClick={(e) => e.stopPropagation()}>
            {/* File list */}
            <div className="space-y-2">
              {uploadFiles.map((file, idx) => (
                <div key={idx} className="flex items-center gap-3 bg-white rounded-md border px-3 py-2 text-left">
                  {getFileIcon(file.name)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeUploadFile(idx)}
                    className="h-6 w-6 p-0"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>

            {/* Upload options */}
            <div className="flex flex-col sm:flex-row gap-3 items-end">
              <div className="flex-1">
                <label className="block text-xs font-medium mb-1 text-left">Category</label>
                <select
                  value={uploadFormData.type}
                  onChange={(e) => setUploadFormData({ ...uploadFormData, type: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-md border bg-background text-sm"
                >
                  <option value="document">Document</option>
                  <option value="case_study">Case Study</option>
                  <option value="faq">FAQ</option>
                  <option value="competitor_sheet">Competitor Sheet</option>
                  <option value="offer_template">Offer Template</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium mb-1 text-left">Tags (optional)</label>
                <Input
                  value={uploadFormData.tags}
                  onChange={(e) => setUploadFormData({ ...uploadFormData, tags: e.target.value })}
                  placeholder="e.g., cloud, migration"
                  className="h-8 text-sm"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add More
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={cancelUpload}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleUpload}
                  disabled={uploading}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      {uploadProgress ? `${uploadProgress.current}/${uploadProgress.total}` : 'Uploading...'}
                    </>
                  ) : (
                    <>
                      <Upload className="h-3.5 w-3.5 mr-1" />
                      Upload {uploadFiles.length > 1 ? `${uploadFiles.length} files` : 'file'}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Create Form */}
      {showCreateForm && (
        <Card>
          <CardHeader>
            <CardTitle>Create New Item</CardTitle>
            <CardDescription>Add a new document to the knowledge base</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Type</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  className="w-full px-3 py-2 rounded-md border bg-background"
                  required
                >
                  <option value="case_study">Case Study</option>
                  <option value="faq">FAQ</option>
                  <option value="competitor_sheet">Competitor Sheet</option>
                  <option value="offer_template">Offer Template</option>
                  <option value="document">Document</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Title</label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Enter title..."
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Content</label>
                <Textarea
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  placeholder="Enter content (Markdown supported)..."
                  rows={8}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Tags (comma-separated)</label>
                <Input
                  value={formData.tags}
                  onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                  placeholder="e.g., cloud, migration, enterprise"
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
                  Create
                </Button>
                <Button type="button" variant="outline" onClick={cancelCreate}>
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Edit Form */}
      {editingItem && (
        <Card>
          <CardHeader>
            <CardTitle>Edit Item</CardTitle>
            <CardDescription>Update the knowledge base item</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpdate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Type</label>
                <div className="px-3 py-2 rounded-md border bg-muted">
                  {typeLabels[editingItem.type]?.label || editingItem.type}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Title</label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Enter title..."
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Content</label>
                <Textarea
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  placeholder="Enter content (Markdown supported)..."
                  rows={8}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Tags (comma-separated)</label>
                <Input
                  value={formData.tags}
                  onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                  placeholder="e.g., cloud, migration, enterprise"
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
                  Save Changes
                </Button>
                <Button type="button" variant="outline" onClick={cancelEditing}>
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Items List */}
      <Card>
        <CardHeader>
          <CardTitle>
            {searchQuery ? `Search Results` : 'All Items'}
          </CardTitle>
          <CardDescription>
            {loading ? 'Loading...' : `${items.length} item${items.length !== 1 ? 's' : ''} found`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                {searchQuery ? 'No items match your search' : 'No knowledge base items yet'}
              </p>
              {!searchQuery && (
                <div className="flex gap-2 justify-center mt-4">
                  <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Document
                  </Button>
                  <Button onClick={() => setShowCreateForm(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Item Manually
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => {
                const isExpanded = expandedItem === item.id;
                const hasLongContent = (item.content?.length || 0) > 200;

                return (
                  <div
                    key={item.id}
                    className="border rounded-lg p-4 hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${typeLabels[item.type]?.color || 'bg-gray-100 text-gray-800'}`}>
                            {typeLabels[item.type]?.icon}
                            {typeLabels[item.type]?.label || item.type}
                          </span>
                          {item.file_url && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">
                              <Download className="h-3 w-3" />
                              Uploaded File
                            </span>
                          )}
                          {item.tags?.length > 0 && (
                            <div className="flex gap-1 flex-wrap">
                              {item.tags.slice(0, 5).map((tag, i) => (
                                <span key={i} className="px-2 py-0.5 bg-muted rounded text-xs">
                                  {tag}
                                </span>
                              ))}
                              {item.tags.length > 5 && (
                                <span className="px-2 py-0.5 text-xs text-muted-foreground">
                                  +{item.tags.length - 5} more
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <h3 className="font-semibold truncate">{item.title}</h3>
                        {item.content && (
                          <div className="mt-1">
                            <p className={`text-sm text-muted-foreground ${isExpanded ? 'whitespace-pre-wrap' : 'line-clamp-2'}`}>
                              {isExpanded ? item.content : item.content.substring(0, 200) + (item.content.length > 200 ? '...' : '')}
                            </p>
                            {hasLongContent && (
                              <button
                                onClick={() => setExpandedItem(isExpanded ? null : item.id)}
                                className="text-xs text-primary hover:underline mt-1 inline-flex items-center gap-1"
                              >
                                {isExpanded ? (
                                  <><EyeOff className="h-3 w-3" /> Show less</>
                                ) : (
                                  <><Eye className="h-3 w-3" /> Show full content ({Math.ceil(item.content.length / 1000)}k chars)</>
                                )}
                              </button>
                            )}
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground mt-2">
                          Created by {item.created_by_name} on {new Date(item.created_at).toLocaleDateString()}
                          {item.content && (
                            <span className="ml-2">• {Math.ceil(item.content.length / 1000)}k characters extracted</span>
                          )}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => startEditing(item)}
                          aria-label={`Edit ${item.title}`}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(item.id)}
                          disabled={deleting === item.id}
                          className="text-red-500 hover:text-red-600"
                          aria-label={`Delete ${item.title}`}
                        >
                          {deleting === item.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
