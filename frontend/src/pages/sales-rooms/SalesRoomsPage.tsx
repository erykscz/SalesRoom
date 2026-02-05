import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Plus, ExternalLink, Eye, Building2 } from 'lucide-react';

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
  const [salesRooms, setSalesRooms] = useState<SalesRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSalesRooms = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/sales-rooms', {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
          throw new Error('Failed to fetch sales rooms');
        }

        const data = await response.json();
        setSalesRooms(data.salesRooms);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchSalesRooms();
  }, []);

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
          <p className="text-muted-foreground">Client-facing microsites for your deals</p>
        </div>
        <Link to="/sales-rooms/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Create Sales Room
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
            <h3 className="font-semibold mb-2">No Sales Rooms Yet</h3>
            <p className="text-muted-foreground mb-4">Create your first Sales Room to engage clients.</p>
            <Link to="/sales-rooms/new">
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create Sales Room
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
                    <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded">Expired</span>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-muted-foreground mb-4">
                  <p>Created by {room.created_by_name}</p>
                  <p>{new Date(room.created_at).toLocaleDateString()}</p>
                </div>
                <div className="flex gap-2">
                  <Link to={`/sales-rooms/${room.id}`} className="flex-1">
                    <Button variant="outline" className="w-full" size="sm">
                      <Eye className="h-4 w-4 mr-2" />
                      View Analytics
                    </Button>
                  </Link>
                  <a
                    href={`/room/${room.public_url_slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button variant="ghost" size="sm">
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </a>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
