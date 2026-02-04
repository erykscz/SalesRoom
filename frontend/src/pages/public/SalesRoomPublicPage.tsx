import { useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function SalesRoomPublicPage() {
  const { slug } = useParams();

  return (
    <div className="min-h-screen bg-background p-6">
      <Card className="max-w-4xl mx-auto">
        <CardHeader>
          <CardTitle>Sales Room</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Sales room: {slug}</p>
          <p className="text-muted-foreground">Public sales room view coming soon...</p>
        </CardContent>
      </Card>
    </div>
  );
}
