import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Briefcase, Search, FileText, Building2, TrendingUp, Users, Clock, AlertCircle } from 'lucide-react';

export default function DashboardPage() {
  const { user } = useAuth();

  const stats = [
    { label: 'Active Deals', value: '12', icon: Briefcase, change: '+3 this week' },
    { label: 'New Leads', value: '28', icon: Search, change: '+15 this week' },
    { label: 'Sales Rooms', value: '8', icon: Building2, change: '2 viewed today' },
    { label: 'Transcripts', value: '24', icon: FileText, change: '4 pending analysis' },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome header */}
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Welcome back, {user?.name?.split(' ')[0]}</h2>
        <p className="text-muted-foreground">Here's what's happening with your sales pipeline today.</p>
      </div>

      {/* Stats grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.label}</CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">{stat.change}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main content grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        {/* Recent Activity */}
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Your latest actions and updates</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/50">
                <div className="h-9 w-9 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
                  <Building2 className="h-4 w-4 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">Sales Room created for Acme Corp</p>
                  <p className="text-xs text-muted-foreground">2 hours ago</p>
                </div>
              </div>
              <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/50">
                <div className="h-9 w-9 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
                  <TrendingUp className="h-4 w-4 text-green-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">Deal moved to Solution Design</p>
                  <p className="text-xs text-muted-foreground">5 hours ago</p>
                </div>
              </div>
              <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/50">
                <div className="h-9 w-9 rounded-full bg-purple-100 dark:bg-purple-900/20 flex items-center justify-center">
                  <FileText className="h-4 w-4 text-purple-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">Transcript analyzed for TechStart Inc</p>
                  <p className="text-xs text-muted-foreground">Yesterday</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Deals Needing Attention */}
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Needs Attention</CardTitle>
            <CardDescription>Deals that need your focus</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-4 w-4 text-yellow-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">BigTech Solutions</p>
                  <p className="text-xs text-muted-foreground">Stagnant for 12 days</p>
                </div>
                <span className="text-xs font-medium text-yellow-500">High</span>
              </div>
              <div className="flex items-center gap-3">
                <Clock className="h-4 w-4 text-orange-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">DataFlow Inc</p>
                  <p className="text-xs text-muted-foreground">Next step overdue</p>
                </div>
                <span className="text-xs font-medium text-orange-500">Medium</span>
              </div>
              <div className="flex items-center gap-3">
                <Users className="h-4 w-4 text-blue-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">CloudFirst Ltd</p>
                  <p className="text-xs text-muted-foreground">Missing stakeholder info</p>
                </div>
                <span className="text-xs font-medium text-blue-500">Low</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
