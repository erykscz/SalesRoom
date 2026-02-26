import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { API_URL } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Plus, ExternalLink, Eye, Building2, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface SalesRoom {
  id: string;
  deal_id: string;
  deal_company: string;
  template_type: string;
  public_url_slug: string;
  is_expired: boolean;
  created_at: string;
  created_by_name: string;
}

export default function SalesRoomsPage() {
  const { toast } = useToast();
  const [salesRooms, setSalesRooms] = useState<SalesRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingRoomId, setDeletingRoomId] = useState<string | null>(null);
  const [roomToDelete, setRoomToDelete] = useState<SalesRoom | null>(null);

  useEffect(() => {
    const fetchSalesRooms = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_URL}/sales-rooms`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
          throw new Error('Nie udało się pobrać Sales Rooms');
        }

        const data = await response.json();
        setSalesRooms(data.salesRooms);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Wystąpił błąd');
      } finally {
        setLoading(false);
      }
    };

    fetchSalesRooms();
  }, []);

  const handleDeleteClick = (room: SalesRoom) => {
    setRoomToDelete(room);
  };

  const handleDeleteConfirm = async () => {
    if (!roomToDelete) return;

    setDeletingRoomId(roomToDelete.id);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/sales-rooms/${roomToDelete.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Nie udało się usunąć Sales Room');
      }

      // Remove from list
      setSalesRooms(prev => prev.filter(r => r.id !== roomToDelete.id));
      toast({ title: 'Sukces!', description: 'Sales Room został usunięty' });
      setRoomToDelete(null);
    } catch (err) {
      toast({
        title: 'Błąd',
        description: err instanceof Error ? err.message : 'Nie udało się usunąć Sales Room',
        variant: 'destructive'
      });
    } finally {
      setDeletingRoomId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Sales Rooms</h1>
          <p className="text-muted-foreground">Mikroserwisy dla klientów w Twoich dealach</p>
        </div>
        <Link to="/sales-rooms/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Utwórz Sales Room
          </Button>
        </Link>
      </div>

      {error && (
        <Card>
          <CardContent className="py-6">
            <p className="text-red-500 text-center">{error}</p>
          </CardContent>
        </Card>
      )}

      {!error && salesRooms.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold mb-2">Brak Sales Rooms</h3>
            <p className="text-muted-foreground mb-4">Utwórz swój pierwszy Sales Room, aby zaangażować klientów.</p>
            <Link to="/sales-rooms/new">
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Utwórz Sales Room
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {salesRooms.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {salesRooms.map((room) => (
            <Card key={room.id} className="hover:border-primary/50 transition-colors">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{room.deal_company}</CardTitle>
                    <CardDescription className="capitalize">
                      {room.template_type.replace(/_/g, ' ')}
                    </CardDescription>
                  </div>
                  {room.is_expired && (
                    <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded">Wygasły</span>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-muted-foreground mb-4">
                  <p>Utworzony przez {room.created_by_name}</p>
                  <p>{new Date(room.created_at).toLocaleDateString('pl-PL')}</p>
                </div>
                <div className="flex gap-2">
                  <Link to={`/sales-rooms/${room.id}`} className="flex-1">
                    <Button variant="outline" className="w-full" size="sm">
                      <Eye className="h-4 w-4 mr-2" />
                      Analityka
                    </Button>
                  </Link>
                  <a
                    href={`/room/${room.public_url_slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button variant="ghost" size="sm" title="Otwórz w nowej karcie">
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </a>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteClick(room)}
                    disabled={deletingRoomId === room.id}
                    title="Usuń Sales Room"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    {deletingRoomId === room.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={roomToDelete !== null} onOpenChange={(open) => !open && setRoomToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Czy na pewno chcesz usunąć?</AlertDialogTitle>
            <AlertDialogDescription>
              Ta akcja jest nieodwracalna. Sales Room dla <strong>{roomToDelete?.deal_company}</strong> zostanie trwale usunięty.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anuluj</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-red-600 hover:bg-red-700"
            >
              Usuń
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
