import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  Search, Plus, Trash2, Edit, X, Check, Loader2, ThumbsUp, ThumbsDown,
  DollarSign, Cpu, Shield, Users, Clock, Layers
} from 'lucide-react';

interface ARCResponse {
  acknowledge: string;
  reframe: string;
  counter: string;
}

interface Battlecard {
  id: string;
  category: 'price' | 'technology' | 'trust' | 'competition' | 'timing' | 'features';
  objection_text: string;
  arc_response: ARCResponse | null;
  case_study_links: string[];
  is_shared: number;
  created_by: string;
  created_by_name: string;
  feedback_score: number;
  created_at: string;
  updated_at: string;
}

const CATEGORIES = [
  { value: 'price', label: 'Price', icon: <DollarSign className="h-4 w-4" />, color: 'bg-green-100 text-green-800' },
  { value: 'technology', label: 'Technology', icon: <Cpu className="h-4 w-4" />, color: 'bg-blue-100 text-blue-800' },
  { value: 'trust', label: 'Trust', icon: <Shield className="h-4 w-4" />, color: 'bg-purple-100 text-purple-800' },
  { value: 'competition', label: 'Competition', icon: <Users className="h-4 w-4" />, color: 'bg-orange-100 text-orange-800' },
  { value: 'timing', label: 'Timing', icon: <Clock className="h-4 w-4" />, color: 'bg-yellow-100 text-yellow-800' },
  { value: 'features', label: 'Features', icon: <Layers className="h-4 w-4" />, color: 'bg-pink-100 text-pink-800' },
];

export default function BattlecardsPage() {
  const [battlecards, setBattlecards] = useState<Battlecard[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingItem, setEditingItem] = useState<Battlecard | null>(null);
  const [formData, setFormData] = useState({
    category: 'price',
    objection_text: '',
    acknowledge: '',
    reframe: '',
    counter: '',
    is_shared: true
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchBattlecards = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      if (searchQuery) params.append('search', searchQuery);
      if (selectedCategory) params.append('category', selectedCategory);

      const response = await fetch(`/api/battlecards?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) throw new Error('Failed to fetch battlecards');

      const data = await response.json();
      setBattlecards(data.battlecards || []);
    } catch (error) {
      console.error('Error fetching battlecards:', error);
      toast({
        title: 'Error',
        description: 'Failed to load battlecards',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBattlecards();
  }, [selectedCategory]);

  const handleSearch = () => {
    fetchBattlecards();
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.objection_text.trim()) {
      toast({ title: 'Error', description: 'Objection text is required', variant: 'destructive' });
      return;
    }

    if (!formData.acknowledge.trim() || !formData.reframe.trim() || !formData.counter.trim()) {
      toast({ title: 'Error', description: 'All ARC response fields are required', variant: 'destructive' });
      return;
    }

    try {
      setSaving(true);
      const token = localStorage.getItem('token');

      const response = await fetch('/api/battlecards', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          category: formData.category,
          objection_text: formData.objection_text,
          arc_response: {
            acknowledge: formData.acknowledge,
            reframe: formData.reframe,
            counter: formData.counter
          },
          is_shared: formData.is_shared
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create battlecard');
      }

      toast({ title: 'Success', description: 'Battlecard created successfully' });
      setShowCreateForm(false);
      resetForm();
      fetchBattlecards();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to create battlecard', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;

    try {
      setSaving(true);
      const token = localStorage.getItem('token');

      const response = await fetch(`/api/battlecards/${editingItem.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          objection_text: formData.objection_text,
          arc_response: {
            acknowledge: formData.acknowledge,
            reframe: formData.reframe,
            counter: formData.counter
          },
          is_shared: formData.is_shared
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update battlecard');
      }

      toast({ title: 'Success', description: 'Battlecard updated successfully' });
      setEditingItem(null);
      resetForm();
      fetchBattlecards();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to update battlecard', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this battlecard?')) return;

    try {
      setDeleting(id);
      const token = localStorage.getItem('token');

      const response = await fetch(`/api/battlecards/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete battlecard');
      }

      toast({ title: 'Success', description: 'Battlecard deleted successfully' });
      fetchBattlecards();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to delete battlecard', variant: 'destructive' });
    } finally {
      setDeleting(null);
    }
  };

  const handleFeedback = async (id: string, vote: 'up' | 'down') => {
    try {
      const token = localStorage.getItem('token');

      const response = await fetch(`/api/battlecards/${id}/feedback`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ vote })
      });

      if (!response.ok) throw new Error('Failed to submit feedback');

      const data = await response.json();
      setBattlecards(prev => prev.map(bc =>
        bc.id === id ? { ...bc, feedback_score: data.feedback_score } : bc
      ));
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to submit feedback', variant: 'destructive' });
    }
  };

  const startEditing = (item: Battlecard) => {
    setEditingItem(item);
    setFormData({
      category: item.category,
      objection_text: item.objection_text,
      acknowledge: item.arc_response?.acknowledge || '',
      reframe: item.arc_response?.reframe || '',
      counter: item.arc_response?.counter || '',
      is_shared: item.is_shared === 1
    });
    setShowCreateForm(false);
  };

  const resetForm = () => {
    setFormData({
      category: 'price',
      objection_text: '',
      acknowledge: '',
      reframe: '',
      counter: '',
      is_shared: true
    });
  };

  const cancelForm = () => {
    setShowCreateForm(false);
    setEditingItem(null);
    resetForm();
  };

  const getCategoryInfo = (category: string) => {
    return CATEGORIES.find(c => c.value === category) || CATEGORIES[0];
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">Battlecards</h1>
          <p className="text-muted-foreground">Handle objections with the ARC framework</p>
        </div>
        <Button onClick={() => { setShowCreateForm(true); setEditingItem(null); resetForm(); }}>
          <Plus className="h-4 w-4 mr-2" />
          Create Battlecard
        </Button>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 flex gap-2">
              <Input
                placeholder="Search objections..."
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
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-2 rounded-md border bg-background"
            >
              <option value="">All Categories</option>
              {CATEGORIES.map(cat => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Create/Edit Form */}
      {(showCreateForm || editingItem) && (
        <Card>
          <CardHeader>
            <CardTitle>{editingItem ? 'Edit Battlecard' : 'Create New Battlecard'}</CardTitle>
            <CardDescription>Use the ARC framework: Acknowledge → Reframe → Counter</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={editingItem ? handleUpdate : handleCreate} className="space-y-4">
              {!editingItem && (
                <div>
                  <label className="block text-sm font-medium mb-1">Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 rounded-md border bg-background"
                    required
                  >
                    {CATEGORIES.map(cat => (
                      <option key={cat.value} value={cat.value}>{cat.label}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium mb-1">Objection Text</label>
                <Textarea
                  value={formData.objection_text}
                  onChange={(e) => setFormData({ ...formData, objection_text: e.target.value })}
                  placeholder="What objection does this address?"
                  rows={2}
                  required
                />
              </div>
              <div className="border-l-4 border-blue-500 pl-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-blue-600">Acknowledge</label>
                  <Textarea
                    value={formData.acknowledge}
                    onChange={(e) => setFormData({ ...formData, acknowledge: e.target.value })}
                    placeholder="Validate their concern..."
                    rows={2}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-green-600">Reframe</label>
                  <Textarea
                    value={formData.reframe}
                    onChange={(e) => setFormData({ ...formData, reframe: e.target.value })}
                    placeholder="Shift the perspective..."
                    rows={2}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-purple-600">Counter</label>
                  <Textarea
                    value={formData.counter}
                    onChange={(e) => setFormData({ ...formData, counter: e.target.value })}
                    placeholder="Provide the solution..."
                    rows={2}
                    required
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_shared"
                  checked={formData.is_shared}
                  onChange={(e) => setFormData({ ...formData, is_shared: e.target.checked })}
                  className="rounded"
                />
                <label htmlFor="is_shared" className="text-sm">Share with team</label>
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
                  {editingItem ? 'Save Changes' : 'Create'}
                </Button>
                <Button type="button" variant="outline" onClick={cancelForm}>
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Battlecards List */}
      <Card>
        <CardHeader>
          <CardTitle>{searchQuery || selectedCategory ? 'Results' : 'All Battlecards'}</CardTitle>
          <CardDescription>
            {loading ? 'Loading...' : `${battlecards.length} battlecard${battlecards.length !== 1 ? 's' : ''} found`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : battlecards.length === 0 ? (
            <div className="text-center py-8">
              <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                {searchQuery ? 'No battlecards match your search' : 'No battlecards yet'}
              </p>
              {!searchQuery && (
                <Button className="mt-4" onClick={() => setShowCreateForm(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Your First Battlecard
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {battlecards.map((bc) => {
                const catInfo = getCategoryInfo(bc.category);
                return (
                  <div key={bc.id} className="border rounded-lg p-4 hover:bg-accent/50 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${catInfo.color}`}>
                            {catInfo.icon}
                            {catInfo.label}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Score: {bc.feedback_score}
                          </span>
                        </div>
                        <h3 className="font-semibold mb-2">{bc.objection_text}</h3>
                        {bc.arc_response && (
                          <div className="space-y-2 text-sm">
                            <p><span className="font-medium text-blue-600">A:</span> {bc.arc_response.acknowledge}</p>
                            <p><span className="font-medium text-green-600">R:</span> {bc.arc_response.reframe}</p>
                            <p><span className="font-medium text-purple-600">C:</span> {bc.arc_response.counter}</p>
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground mt-2">
                          Created by {bc.created_by_name} on {new Date(bc.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex flex-col gap-2">
                        <div className="flex gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleFeedback(bc.id, 'up')}
                            title="This worked!"
                          >
                            <ThumbsUp className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleFeedback(bc.id, 'down')}
                            title="Needs improvement"
                          >
                            <ThumbsDown className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => startEditing(bc)}
                            aria-label={`Edit ${bc.objection_text.substring(0, 20)}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDelete(bc.id)}
                            disabled={deleting === bc.id}
                            className="text-red-500 hover:text-red-600"
                            aria-label={`Delete battlecard`}
                          >
                            {deleting === bc.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
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
