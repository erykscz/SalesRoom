import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function ManagerDashboardPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Manager Dashboard</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">Team performance metrics coming soon...</p>
      </CardContent>
    </Card>
  );
}
