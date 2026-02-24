import { useState, useEffect } from 'react';
import { Link, useSearchParams, useLocation } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { Plus, Search, Building2, Calendar, TrendingUp, MoreVertical, Eye, Pencil, Trash2, Download, Upload, ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Archive, ArchiveRestore, LayoutList, Kanban } from 'lucide-react';
import KanbanBoard from '@/components/deals/KanbanBoard';
import { API_URL } from '@/lib/api';

interface Deal {
  id: string;
  first_name: string;
  last_name: string;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  company_name: string | null;
  industry: string | null;
  stage: string;
  estimated_value: number | null;
  close_date: string | null;
  next_step_date: string;
  health_score: number;
  priority: string;
  owner_name: string;
  created_at: string;
  is_archived?: number;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

const stageLabels: Record<string, string> = {
  new_signal: 'New Signal',
  qualified: 'Qualified',
  discovery: 'Discovery',
  solution_design: 'Solution Design',
  negotiation: 'Negotiation',
  closed_won: 'Closed Won',
  closed_lost: 'Closed Lost',
};

const stageColors: Record<string, string> = {
  new_signal: 'bg-blue-500/10 text-blue-500',
  qualified: 'bg-purple-500/10 text-purple-500',
  discovery: 'bg-yellow-500/10 text-yellow-500',
  solution_design: 'bg-orange-500/10 text-orange-500',
  negotiation: 'bg-pink-500/10 text-pink-500',
  closed_won: 'bg-green-500/10 text-green-500',
  closed_lost: 'bg-red-500/10 text-red-500',
};

const priorityColors: Record<string, string> = {
  low: 'text-slate-400',
  medium: 'text-yellow-500',
  high: 'text-red-500',
};

export default function DealsPage() {
  const { token } = useAuth();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>(
    (searchParams.get('view') as 'table' | 'kanban') || 'table'
  );

  // Get current URL with search params for passing to detail pages
  const currentUrl = location.pathname + location.search;

  // Initialize state from URL params
  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');
  const [selectedStage, setSelectedStage] = useState<string | null>(searchParams.get('stage'));
  const [healthScoreFilter, setHealthScoreFilter] = useState<string>(searchParams.get('health') || 'all');
  const [sortBy, setSortBy] = useState<string>(searchParams.get('sort_by') || 'created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>((searchParams.get('sort_order') as 'asc' | 'desc') || 'desc');
  const [currentPage, setCurrentPage] = useState(parseInt(searchParams.get('page') || '1'));
  const [showArchived, setShowArchived] = useState(searchParams.get('archived') === 'true');
  const [dateFilter, setDateFilter] = useState<string>(searchParams.get('date_filter') || 'all');
  const pageSize = 20;

  // Sync state changes to URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (searchTerm) params.set('search', searchTerm);
    if (selectedStage) params.set('stage', selectedStage);
    if (healthScoreFilter && healthScoreFilter !== 'all') params.set('health', healthScoreFilter);
    if (sortBy && sortBy !== 'created_at') params.set('sort_by', sortBy);
    if (sortOrder && sortOrder !== 'desc') params.set('sort_order', sortOrder);
    if (currentPage > 1) params.set('page', currentPage.toString());
    if (showArchived) params.set('archived', 'true');
    if (dateFilter && dateFilter !== 'all') params.set('date_filter', dateFilter);
    if (viewMode && viewMode !== 'table') params.set('view', viewMode);
    setSearchParams(params, { replace: true });
  }, [searchTerm, selectedStage, healthScoreFilter, sortBy, sortOrder, currentPage, showArchived, dateFilter, viewMode, setSearchParams]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedStage, healthScoreFilter, sortBy, sortOrder, showArchived, dateFilter]);

  useEffect(() => {
    fetchDeals();
  }, [token, searchTerm, selectedStage, healthScoreFilter, sortBy, sortOrder, currentPage, showArchived, dateFilter]);

  const fetchDeals = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (selectedStage) params.append('stage', selectedStage);
      if (healthScoreFilter === 'high') params.append('health_score_min', '70');
      if (healthScoreFilter === 'medium') {
        params.append('health_score_min', '40');
        params.append('health_score_max', '69');
      }
      if (healthScoreFilter === 'low') params.append('health_score_max', '39');
      if (showArchived) params.append('archived', 'true');
      if (dateFilter && dateFilter !== 'all') params.append('date_filter', dateFilter);
      if (sortBy) params.append('sort_by', sortBy);
      if (sortOrder) params.append('sort_order', sortOrder);
      params.append('page', currentPage.toString());
      params.append('limit', pageSize.toString());

      const response = await fetch(`${API_URL}/deals?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch deals');
      }

      const data = await response.json();
      setDeals(data.deals || []);
      setPagination(data.pagination || null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const importFromCsv = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const csvContent = await file.text();

      const response = await fetch(`${API_URL}/deals/import/csv`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ csvContent }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to import deals');
      }

      const result = await response.json();
      alert(`Successfully imported ${result.imported} deal(s)`);

      // Refresh deals list
      fetchDeals();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to import deals');
    }

    // Reset file input
    event.target.value = '';
  };

  const exportToCsv = async () => {
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (selectedStage) params.append('stage', selectedStage);

      const response = await fetch(`${API_URL}/deals/export/csv?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to export deals');
      }

      // Create a blob from the response
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `deals-export-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to export deals');
    }
  };

  const deleteDeal = async (id: string, displayName: string) => {
    if (!confirm(`Are you sure you want to delete the deal for "${displayName}"?`)) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/deals/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to delete deal');
      }

      // Refresh deals list
      fetchDeals();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete deal');
    }
  };

  const archiveDeal = async (id: string, displayName: string) => {
    if (!confirm(`Are you sure you want to archive the deal for "${displayName}"?`)) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/deals/${id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ is_archived: true }),
      });

      if (!response.ok) {
        throw new Error('Failed to archive deal');
      }

      // Refresh deals list
      fetchDeals();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to archive deal');
    }
  };

  const unarchiveDeal = async (id: string) => {
    try {
      const response = await fetch(`${API_URL}/deals/${id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ is_archived: false }),
      });

      if (!response.ok) {
        throw new Error('Failed to restore deal');
      }

      // Refresh deals list
      fetchDeals();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to restore deal');
    }
  };

  const formatCurrency = (value: number | null) => {
    if (!value) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (date: string | null) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getHealthScoreColor = (score: number) => {
    if (score >= 70) return 'text-green-500';
    if (score >= 40) return 'text-yellow-500';
    return 'text-red-500';
  };

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
  };

  const SortIcon = ({ column }: { column: string }) => {
    if (sortBy !== column) return <ArrowUpDown className="w-4 h-4 ml-1 opacity-50" />;
    return sortOrder === 'asc' ? <ArrowUp className="w-4 h-4 ml-1" /> : <ArrowDown className="w-4 h-4 ml-1" />;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Deals</h2>
          <p className="text-muted-foreground">Manage your sales pipeline</p>
        </div>
        <div className="flex gap-2 items-center">
          {/* View Toggle */}
          <div className="flex border rounded-md">
            <Button
              variant={viewMode === 'table' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('table')}
              className="rounded-r-none"
              title="Table View"
            >
              <LayoutList className="w-4 h-4" />
            </Button>
            <Button
              variant={viewMode === 'kanban' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('kanban')}
              className="rounded-l-none"
              title="Kanban View"
            >
              <Kanban className="w-4 h-4" />
            </Button>
          </div>
          <Button variant="outline" onClick={exportToCsv}>
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
          <label>
            <input
              type="file"
              accept=".csv"
              onChange={importFromCsv}
              className="hidden"
            />
            <Button variant="outline" asChild>
              <span>
                <Upload className="w-4 h-4 mr-2" />
                Import CSV
              </span>
            </Button>
          </label>
          <Link to="/deals/new">
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Create Deal
            </Button>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search deals..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant={selectedStage === null ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedStage(null)}
              >
                All
              </Button>
              {Object.entries(stageLabels).map(([value, label]) => (
                <Button
                  key={value}
                  variant={selectedStage === value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedStage(value)}
                >
                  {label}
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Health:</span>
              <select
                value={healthScoreFilter}
                onChange={(e) => setHealthScoreFilter(e.target.value)}
                className="bg-background border border-input rounded-md px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="all">All Health</option>
                <option value="high">High (70+)</option>
                <option value="medium">Medium (40-69)</option>
                <option value="low">Low (&lt;40)</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Created:</span>
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="bg-background border border-input rounded-md px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="all">All Time</option>
                <option value="today">Today</option>
                <option value="this_week">This Week</option>
              </select>
            </div>
            <Button
              variant={showArchived ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowArchived(!showArchived)}
            >
              <Archive className="w-4 h-4 mr-2" />
              {showArchived ? 'Showing Archived' : 'Show Archived'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Kanban View */}
      {viewMode === 'kanban' ? (
        <KanbanBoard />
      ) : (
        /* Deals Table */
        <Card>
        <CardHeader>
          <CardTitle>All Deals</CardTitle>
          <CardDescription>
            {loading ? 'Loading...' : `${pagination?.total || deals.length} deal${(pagination?.total || deals.length) !== 1 ? 's' : ''} found`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error ? (
            <div role="alert" className="text-center py-8 text-red-500">
              {error}
            </div>
          ) : loading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading deals...
            </div>
          ) : deals.length === 0 ? (
            <div className="text-center py-8">
              <Building2 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              {(searchTerm || selectedStage || healthScoreFilter !== 'all') ? (
                <>
                  <p className="text-muted-foreground mb-2">No results match your filters</p>
                  <p className="text-sm text-muted-foreground mb-4">Try adjusting your search or filter criteria</p>
                  <Button variant="outline" onClick={() => {
                    setSearchTerm('');
                    setSelectedStage(null);
                    setHealthScoreFilter('all');
                  }}>
                    Clear Filters
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-muted-foreground mb-4">No deals yet</p>
                  <Link to="/deals/new">
                    <Button>
                      <Plus className="w-4 h-4 mr-2" />
                      Create Your First Deal
                    </Button>
                  </Link>
                </>
              )}
            </div>
          ) : (
            <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground cursor-pointer hover:text-foreground" onClick={() => handleSort('last_name')}>
                      <div className="flex items-center">Contact<SortIcon column="last_name" /></div>
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground cursor-pointer hover:text-foreground" onClick={() => handleSort('stage')}>
                      <div className="flex items-center">Stage<SortIcon column="stage" /></div>
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground cursor-pointer hover:text-foreground" onClick={() => handleSort('estimated_value')}>
                      <div className="flex items-center">Value<SortIcon column="estimated_value" /></div>
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground cursor-pointer hover:text-foreground" onClick={() => handleSort('health_score')}>
                      <div className="flex items-center">Health<SortIcon column="health_score" /></div>
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground cursor-pointer hover:text-foreground" onClick={() => handleSort('next_step_date')}>
                      <div className="flex items-center">Next Step<SortIcon column="next_step_date" /></div>
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Owner</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {deals.map((deal) => (
                    <tr key={deal.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                      <td className="py-3 px-4 max-w-xs">
                        <div className="truncate">
                          <Link to={`/deals/${deal.id}`} state={{ from: currentUrl }} className="font-medium hover:text-primary truncate block" title={`${deal.first_name} ${deal.last_name}`}>
                            {deal.first_name} {deal.last_name}
                          </Link>
                          {deal.company_name && (
                            <p className="text-sm text-muted-foreground truncate" title={deal.company_name}>{deal.company_name}</p>
                          )}
                          {deal.job_title && (
                            <p className="text-xs text-muted-foreground truncate" title={deal.job_title}>{deal.job_title}</p>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${stageColors[deal.stage]}`}>
                          {stageLabels[deal.stage]}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-medium">{formatCurrency(deal.estimated_value)}</span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <TrendingUp className={`w-4 h-4 ${getHealthScoreColor(deal.health_score)}`} />
                          <span className={`font-medium ${getHealthScoreColor(deal.health_score)}`}>
                            {deal.health_score}%
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2 text-sm">
                          <Calendar className="w-4 h-4 text-muted-foreground" />
                          {formatDate(deal.next_step_date)}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm">
                        {deal.owner_name}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-end gap-2">
                          <Link to={`/deals/${deal.id}`} state={{ from: currentUrl }}>
                            <Button variant="ghost" size="sm" aria-label={`View ${deal.first_name} ${deal.last_name}`}>
                              <Eye className="w-4 h-4" />
                            </Button>
                          </Link>
                          <Link to={`/deals/${deal.id}/edit`} state={{ from: currentUrl }}>
                            <Button variant="ghost" size="sm" aria-label={`Edit ${deal.first_name} ${deal.last_name}`}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                          </Link>
                          {showArchived ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => unarchiveDeal(deal.id)}
                              className="text-green-500 hover:text-green-600"
                              aria-label={`Restore ${deal.first_name} ${deal.last_name}`}
                            >
                              <ArchiveRestore className="w-4 h-4" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => archiveDeal(deal.id, `${deal.first_name} ${deal.last_name}`)}
                              className="text-orange-500 hover:text-orange-600"
                              aria-label={`Archive ${deal.first_name} ${deal.last_name}`}
                            >
                              <Archive className="w-4 h-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteDeal(deal.id, `${deal.first_name} ${deal.last_name}`)}
                            className="text-red-500 hover:text-red-600"
                            aria-label={`Delete ${deal.first_name} ${deal.last_name}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {pagination && pagination.totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-4 border-t border-border">
                <div className="text-sm text-muted-foreground">
                  Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
                  {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                  {pagination.total} deals
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(1)}
                    disabled={!pagination.hasPrev}
                    aria-label="First page"
                  >
                    <ChevronsLeft className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(currentPage - 1)}
                    disabled={!pagination.hasPrev}
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Previous
                  </Button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                      // Show pages around current page
                      let pageNum;
                      if (pagination.totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= pagination.totalPages - 2) {
                        pageNum = pagination.totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }
                      return (
                        <Button
                          key={pageNum}
                          variant={currentPage === pageNum ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setCurrentPage(pageNum)}
                          className="w-8"
                        >
                          {pageNum}
                        </Button>
                      );
                    })}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(currentPage + 1)}
                    disabled={!pagination.hasNext}
                    aria-label="Next page"
                  >
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(pagination.totalPages)}
                    disabled={!pagination.hasNext}
                    aria-label="Last page"
                  >
                    <ChevronsRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
            </>
          )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
