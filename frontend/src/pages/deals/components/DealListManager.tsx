import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { API_URL } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Plus, X, List, Pencil, Trash2, Check } from 'lucide-react';

interface DealList {
  id: string;
  name: string;
  description: string | null;
  color: string;
  item_count: number;
}

interface DealListManagerProps {
  selectedListId: string | null;
  onSelectList: (listId: string | null) => void;
  token: string;
  refreshKey?: number;
  onListsLoaded?: (lists: Array<{ id: string; name: string }>) => void;
}

const COLOR_PRESETS = [
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
];

export default function DealListManager({ selectedListId, onSelectList, token, refreshKey, onListsLoaded }: DealListManagerProps) {
  const { toast } = useToast();
  const [lists, setLists] = useState<DealList[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [newListColor, setNewListColor] = useState(COLOR_PRESETS[0]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');

  useEffect(() => {
    fetchLists();
  }, [token, refreshKey]);

  const fetchLists = async () => {
    try {
      const response = await fetch(`${API_URL}/deal-lists`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        const fetched = data.lists || [];
        setLists(fetched);
        onListsLoaded?.(fetched.map((l: DealList) => ({ id: l.id, name: l.name })));
      }
    } catch (err) {
      console.error('Failed to fetch deal lists:', err);
    }
  };

  const createList = async () => {
    if (!newListName.trim()) return;

    try {
      const response = await fetch(`${API_URL}/deal-lists`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: newListName.trim(), color: newListColor }),
      });

      if (response.ok) {
        setNewListName('');
        setNewListColor(COLOR_PRESETS[0]);
        setShowCreate(false);
        fetchLists();
      } else {
        const data = await response.json().catch(() => ({}));
        toast({ variant: 'destructive', title: 'Failed to create list', description: data.error || 'Something went wrong' });
      }
    } catch (err) {
      console.error('Failed to create list:', err);
      toast({ variant: 'destructive', title: 'Failed to create list', description: 'Network error — check your connection' });
    }
  };

  const updateList = async (id: string) => {
    if (!editName.trim()) return;

    try {
      const response = await fetch(`${API_URL}/deal-lists/${id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: editName.trim(), color: editColor }),
      });

      if (response.ok) {
        setEditingId(null);
        fetchLists();
      } else {
        const data = await response.json().catch(() => ({}));
        toast({ variant: 'destructive', title: 'Failed to update list', description: data.error || 'Something went wrong' });
      }
    } catch (err) {
      console.error('Failed to update list:', err);
      toast({ variant: 'destructive', title: 'Failed to update list', description: 'Network error — check your connection' });
    }
  };

  const deleteList = async (id: string, name: string) => {
    if (!confirm(`Delete list "${name}"? Deals won't be deleted.`)) return;

    try {
      const response = await fetch(`${API_URL}/deal-lists/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (response.ok) {
        if (selectedListId === id) onSelectList(null);
        fetchLists();
      } else {
        const data = await response.json().catch(() => ({}));
        toast({ variant: 'destructive', title: 'Failed to delete list', description: data.error || 'Something went wrong' });
      }
    } catch (err) {
      console.error('Failed to delete list:', err);
      toast({ variant: 'destructive', title: 'Failed to delete list', description: 'Network error — check your connection' });
    }
  };

  const startEditing = (list: DealList) => {
    setEditingId(list.id);
    setEditName(list.name);
    setEditColor(list.color);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant={selectedListId === null ? 'default' : 'outline'}
        size="sm"
        onClick={() => onSelectList(null)}
      >
        <List className="w-3.5 h-3.5 mr-1.5" />
        All Deals
      </Button>

      {lists.map((list) =>
        editingId === list.id ? (
          <div key={list.id} className="flex items-center gap-1 border rounded-md px-2 py-0.5">
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="h-7 w-28 text-xs"
              onKeyDown={(e) => e.key === 'Enter' && updateList(list.id)}
            />
            <div className="flex gap-0.5">
              {COLOR_PRESETS.map((c) => (
                <button
                  type="button"
                  key={c}
                  className={`w-4 h-4 rounded-full border-2 ${editColor === c ? 'border-foreground' : 'border-transparent'}`}
                  style={{ backgroundColor: c }}
                  onClick={() => setEditColor(c)}
                />
              ))}
            </div>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => updateList(list.id)}>
              <Check className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setEditingId(null)}>
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        ) : (
          <div key={list.id} className="group relative flex items-center">
            <Button
              variant={selectedListId === list.id ? 'default' : 'outline'}
              size="sm"
              onClick={() => onSelectList(list.id)}
              className="pr-7"
            >
              <span
                className="w-2.5 h-2.5 rounded-full mr-1.5 shrink-0"
                style={{ backgroundColor: list.color }}
              />
              {list.name}
              <span className="ml-1.5 text-xs opacity-60">{list.item_count}</span>
            </Button>
            <div className="absolute right-0 top-0 h-full hidden group-hover:flex items-center gap-0.5 pr-0.5">
              <button
                className="p-0.5 hover:bg-muted rounded"
                onClick={(e) => { e.stopPropagation(); startEditing(list); }}
              >
                <Pencil className="w-3 h-3 text-muted-foreground" />
              </button>
              <button
                className="p-0.5 hover:bg-muted rounded"
                onClick={(e) => { e.stopPropagation(); deleteList(list.id, list.name); }}
              >
                <Trash2 className="w-3 h-3 text-red-400" />
              </button>
            </div>
          </div>
        )
      )}

      {showCreate ? (
        <div className="flex items-center gap-1 border rounded-md px-2 py-0.5">
          <Input
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            placeholder="List name..."
            className="h-7 w-28 text-xs"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && createList()}
          />
          <div className="flex gap-0.5">
            {COLOR_PRESETS.map((c) => (
              <button
                type="button"
                key={c}
                className={`w-4 h-4 rounded-full border-2 ${newListColor === c ? 'border-foreground' : 'border-transparent'}`}
                style={{ backgroundColor: c }}
                onClick={() => setNewListColor(c)}
              />
            ))}
          </div>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={createList}>
            <Check className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => { setShowCreate(false); setNewListName(''); }}>
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      ) : (
        <Button variant="ghost" size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="w-3.5 h-3.5 mr-1" />
          New List
        </Button>
      )}
    </div>
  );
}
