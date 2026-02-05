import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  Search, Plus, FileText, HelpCircle, Users, FileBox, Trash2, Edit, X, Check, Loader2
} from 'lucide-react';

interface KnowledgeItem {
  id: string;
  type: 'case_study' | 'faq' | 'competitor_sheet' | 'offer_template';
  title: string;
  content: string;
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
};

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
  const { toast } = useToast();

  const fetchItems = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      if (searchQuery) params.append('search', searchQuery);
      if (selectedType) params.append('type', selectedType);

      const response = await fetch(`/api/knowledge?${params}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch items');
      }

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

  const handleSearch = () => {
    fetchItems();
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title.trim()) {
      toast({
        title: 'Error',
        description: 'Title is required',
        variant: 'destructive'
      });
      return;
    }

    try {
      setSaving(true);
      const token = localStorage.getItem('token');
      const tags = formData.tags ? formData.tags.split(',').map(t => t.trim()).filter(t => t) : [];

      const response = await fetch('/api/knowledge', {
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

      toast({
        title: 'Success',
        description: 'Knowledge base item created successfully'
      });

      setShowCreateForm(false);
      setFormData({ type: 'case_study', title: '', content: '', tags: '' });
      fetchItems();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create item',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;

    if (!formData.title.trim()) {
      toast({
        title: 'Error',
        description: 'Title is required',
        variant: 'destructive'
      });
      return;
    }

    try {
      setSaving(true);
      const token = localStorage.getItem('token');
      const tags = formData.tags ? formData.tags.split(',').map(t => t.trim()).filter(t => t) : [];

      const response = await fetch(`/api/knowledge/${editingItem.id}`, {
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

      toast({
        title: 'Success',
        description: 'Item updated successfully'
      });

      setEditingItem(null);
      setFormData({ type: 'case_study', title: '', content: '', tags: '' });
      fetchItems();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update item',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this item?')) return;

    try {
      setDeleting(id);
      const token = localStorage.getItem('token');

      const response = await fetch(`/api/knowledge/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete item');
      }

      toast({
        title: 'Success',
        description: 'Item deleted successfully'
      });

      fetchItems();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete item',
        variant: 'destructive'
      });
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">Knowledge Base</h1>
          <p className="text-muted-foreground">Manage case studies, FAQs, and sales materials</p>
        </div>
        <Button onClick={() => { setShowCreateForm(true); setEditingItem(null); }}>
          <Plus className="h-4 w-4 mr-2" />
          Add Item
        </Button>
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
              <option value="case_study">Case Studies</option>
              <option value="faq">FAQs</option>
              <option value="competitor_sheet">Competitor Sheets</option>
              <option value="offer_template">Offer Templates</option>
            </select>
          </div>
        </CardContent>
      </Card>

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
                <Button className="mt-4" onClick={() => setShowCreateForm(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Your First Item
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="border rounded-lg p-4 hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${typeLabels[item.type]?.color || 'bg-gray-100 text-gray-800'}`}>
                          {typeLabels[item.type]?.icon}
                          {typeLabels[item.type]?.label || item.type}
                        </span>
                        {item.tags?.length > 0 && (
                          <div className="flex gap-1 flex-wrap">
                            {item.tags.slice(0, 3).map((tag, i) => (
                              <span key={i} className="px-2 py-0.5 bg-muted rounded text-xs">
                                {tag}
                              </span>
                            ))}
                            {item.tags.length > 3 && (
                              <span className="px-2 py-0.5 text-xs text-muted-foreground">
                                +{item.tags.length - 3} more
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <h3 className="font-semibold truncate">{item.title}</h3>
                      {item.content && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {item.content.substring(0, 200)}{item.content.length > 200 ? '...' : ''}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-2">
                        Created by {item.created_by_name} on {new Date(item.created_at).toLocaleDateString()}
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
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
