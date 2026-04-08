import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { TrendingUp, Calendar, AlertTriangle, AlertCircle, Clock } from 'lucide-react';
import { API_URL } from '@/lib/api';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';

interface Deal {
  id: string;
  name: string;
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
  days_in_stage: number;
  stagnation_status: 'normal' | 'warning' | 'critical';
  last_stage_change: string;
}

interface KanbanData {
  stages: Record<string, Deal[]>;
  closedCounts?: Record<string, number>;
  total: number;
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
  new_signal: 'bg-blue-500',
  qualified: 'bg-purple-500',
  discovery: 'bg-yellow-500',
  solution_design: 'bg-orange-500',
  negotiation: 'bg-pink-500',
  closed_won: 'bg-green-500',
  closed_lost: 'bg-red-500',
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

const getHealthScoreColor = (score: number) => {
  if (score >= 70) return 'text-green-500';
  if (score >= 40) return 'text-yellow-500';
  return 'text-red-500';
};

const getStagnationBorder = (status: string) => {
  switch (status) {
    case 'critical':
      return 'border-l-4 border-l-red-500';
    case 'warning':
      return 'border-l-4 border-l-yellow-500';
    default:
      return 'border-l-4 border-l-transparent';
  }
};

const getStagnationIcon = (status: string, days: number) => {
  if (status === 'critical') {
    return (
      <div className="flex items-center gap-1 text-red-500 text-xs">
        <AlertCircle className="w-3 h-3" />
        <span>{days}d</span>
      </div>
    );
  }
  if (status === 'warning') {
    return (
      <div className="flex items-center gap-1 text-yellow-500 text-xs">
        <AlertTriangle className="w-3 h-3" />
        <span>{days}d</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1 text-muted-foreground text-xs">
      <Clock className="w-3 h-3" />
      <span>{days}d</span>
    </div>
  );
};

// ── Draggable deal card ─────────────────────────────────────────────
function DealCard({ deal, onClick }: { deal: Deal; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: deal.id,
    data: { deal },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={(e) => {
        // Only navigate if not dragging
        if (!isDragging) {
          e.stopPropagation();
          onClick();
        }
      }}
      className={`p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors cursor-grab active:cursor-grabbing ${getStagnationBorder(deal.stagnation_status)} ${isDragging ? 'opacity-30' : ''}`}
    >
      <DealCardContent deal={deal} />
    </div>
  );
}

// ── Card content (shared between card and drag overlay) ─────────────
function DealCardContent({ deal }: { deal: Deal }) {
  return (
    <>
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-sm truncate" title={deal.name}>
            {deal.name}
          </h4>
          {deal.company_name && (
            <p className="text-xs text-muted-foreground truncate">
              {deal.company_name}
            </p>
          )}
        </div>
        {getStagnationIcon(deal.stagnation_status, deal.days_in_stage)}
      </div>
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1">
          <TrendingUp className={`w-3 h-3 ${getHealthScoreColor(deal.health_score)}`} />
          <span className={getHealthScoreColor(deal.health_score)}>
            {deal.health_score}%
          </span>
        </div>
        <span className="font-medium">
          {formatCurrency(deal.estimated_value)}
        </span>
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
        <span>{deal.owner_name}</span>
        <div className="flex items-center gap-1">
          <Calendar className="w-3 h-3" />
          <span>{new Date(deal.next_step_date).toLocaleDateString()}</span>
        </div>
      </div>
    </>
  );
}

// ── Droppable stage column ──────────────────────────────────────────
function StageColumn({
  stage,
  deals,
  totalCount,
  onColumnClick,
  children,
}: {
  stage: string;
  deals: Deal[];
  totalCount?: number;
  onColumnClick: (stage: string) => void;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const displayCount = totalCount ?? deals.length;

  return (
    <div className="flex-shrink-0 w-72">
      <Card className={`transition-colors ${isOver ? 'ring-2 ring-primary ring-offset-2' : ''}`}>
        <CardHeader
          className="py-3 cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => onColumnClick(stage)}
          title={`Click to filter by ${stageLabels[stage]}`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${stageColors[stage]}`}></div>
              <CardTitle className="text-sm font-medium">
                {stageLabels[stage]}
              </CardTitle>
            </div>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
              {displayCount}
            </span>
          </div>
        </CardHeader>
        <CardContent
          ref={setNodeRef}
          className={`space-y-2 max-h-[calc(100vh-300px)] overflow-y-auto min-h-[60px] transition-colors ${isOver ? 'bg-primary/5' : ''}`}
        >
          {children}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Main board ──────────────────────────────────────────────────────
export default function KanbanBoard({ returnUrl }: { returnUrl?: string }) {
  const { token } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [kanbanData, setKanbanData] = useState<KanbanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const handleColumnClick = (stage: string) => {
    navigate(`/deals?stage=${stage}`);
  };

  useEffect(() => {
    fetchKanbanData();
  }, [token]);

  const fetchKanbanData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/deals/kanban`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch Kanban data');
      }

      const data = await response.json();
      setKanbanData(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    const deal = event.active.data.current?.deal as Deal | undefined;
    if (deal) setActiveDeal(deal);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveDeal(null);
    const { active, over } = event;
    if (!over || !kanbanData) return;

    const dealId = active.id as string;
    const newStage = over.id as string;

    // Find which stage the deal is currently in
    let oldStage: string | null = null;
    for (const [stage, deals] of Object.entries(kanbanData.stages)) {
      if (deals.some(d => d.id === dealId)) {
        oldStage = stage;
        break;
      }
    }

    if (!oldStage || oldStage === newStage) return;

    // Optimistic update (immutable)
    const prevData = structuredClone(kanbanData);
    const movedDeal = { ...kanbanData.stages[oldStage].find(d => d.id === dealId)!, stage: newStage };
    const updatedStages = {
      ...kanbanData.stages,
      [oldStage]: kanbanData.stages[oldStage].filter(d => d.id !== dealId),
      [newStage]: [...(kanbanData.stages[newStage] || []), movedDeal],
    };
    setKanbanData({ stages: updatedStages, total: kanbanData.total });

    try {
      const res = await fetch(`${API_URL}/deals/${dealId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ stage: newStage }),
      });

      if (!res.ok) throw new Error('Failed to update stage');

      toast({
        title: 'Deal moved',
        description: `${movedDeal.name} → ${stageLabels[newStage]}`,
      });
    } catch {
      // Revert on error
      setKanbanData(prevData);
      toast({
        title: 'Failed to move deal',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">Loading Kanban board...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-red-500">{error}</div>
      </div>
    );
  }

  if (!kanbanData) {
    return null;
  }

  const activeStages = ['new_signal', 'qualified', 'discovery', 'solution_design', 'negotiation'];
  const closedStages = ['closed_won', 'closed_lost'];

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="space-y-6">
        {/* Stagnation Legend */}
        <div className="flex items-center gap-6 text-sm text-muted-foreground">
          <span className="font-medium">Stagnation Indicators:</span>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-l-4 border-l-yellow-500 bg-muted"></div>
            <span>&gt;10 days (Warning)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-l-4 border-l-red-500 bg-muted"></div>
            <span>&gt;20 days (Critical)</span>
          </div>
        </div>

        {/* Active Stages */}
        <div className="flex gap-4 overflow-x-auto pb-4">
          {activeStages.map((stage) => (
            <StageColumn
              key={stage}
              stage={stage}
              deals={kanbanData.stages[stage] || []}
              onColumnClick={handleColumnClick}
            >
              {(kanbanData.stages[stage]?.length || 0) === 0 ? (
                <div className="text-center py-4 text-muted-foreground text-sm">
                  No deals
                </div>
              ) : (
                kanbanData.stages[stage]?.map((deal) => (
                  <DealCard
                    key={deal.id}
                    deal={deal}
                    onClick={() => navigate(`/deals/${deal.id}`, { state: { from: returnUrl || '/deals' } })}
                  />
                ))
              )}
            </StageColumn>
          ))}
        </div>

        {/* Closed Deals Section */}
        <div className="mt-8">
          <h3 className="text-lg font-semibold mb-4">Closed Deals</h3>
          <div className="flex gap-4">
            {closedStages.map((stage) => {
              const deals = kanbanData.stages[stage] || [];
              const totalCount = kanbanData.closedCounts?.[stage] ?? deals.length;
              const shown = deals.slice(0, 5);
              const remaining = totalCount - shown.length;
              return (
                <StageColumn
                  key={stage}
                  stage={stage}
                  deals={deals}
                  totalCount={totalCount}
                  onColumnClick={handleColumnClick}
                >
                  {shown.length === 0 ? (
                    <div className="text-center py-4 text-muted-foreground text-sm">
                      No deals
                    </div>
                  ) : (
                    shown.map((deal) => (
                      <DealCard
                        key={deal.id}
                        deal={deal}
                        onClick={() => navigate(`/deals/${deal.id}`, { state: { from: returnUrl || '/deals' } })}
                      />
                    ))
                  )}
                  {remaining > 0 && (
                    <div
                      className="text-center text-xs text-muted-foreground cursor-pointer hover:text-foreground"
                      onClick={() => handleColumnClick(stage)}
                    >
                      +{remaining} more
                    </div>
                  )}
                </StageColumn>
              );
            })}
          </div>
        </div>
      </div>

      {/* Drag overlay — rendered at document root, follows cursor */}
      <DragOverlay>
        {activeDeal ? (
          <div className="p-3 bg-background rounded-lg shadow-lg border-2 border-primary w-64 opacity-90">
            <DealCardContent deal={activeDeal} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
