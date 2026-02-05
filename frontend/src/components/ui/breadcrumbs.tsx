import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';
import { useEffect, useState } from 'react';

interface BreadcrumbItem {
  label: string;
  path: string;
  isLast: boolean;
}

// Map route segments to display labels
const routeLabels: Record<string, string> = {
  'dashboard': 'Dashboard',
  'deals': 'Deals',
  'intent-scraper': 'Intent Scraper',
  'discovery': 'Discovery',
  'sales-rooms': 'Sales Rooms',
  'battlecards': 'Battlecards',
  'knowledge': 'Knowledge Base',
  'manager': 'Manager',
  'team-pipeline': 'Team Pipeline',
  'analytics': 'Analytics',
  'admin': 'Admin',
  'users': 'Users',
  'settings': 'Settings',
  'audit-log': 'Audit Log',
  'profile': 'Profile',
  'notifications': 'Notifications',
  'edit': 'Edit',
  'create': 'Create',
  'new': 'New',
};

export function Breadcrumbs() {
  const location = useLocation();
  const [entityName, setEntityName] = useState<string | null>(null);
  const [entityId, setEntityId] = useState<string | null>(null);

  // Fetch entity name (deal, sales room, etc.) if we're on a detail page
  useEffect(() => {
    const fetchEntityName = async () => {
      const pathParts = location.pathname.split('/').filter(Boolean);

      // Check if there's a UUID in the path
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      for (let i = 0; i < pathParts.length; i++) {
        const part = pathParts[i];
        if (uuidPattern.test(part)) {
          // Found a UUID, check what type of entity
          const entityType = pathParts[i - 1]; // e.g., 'deals', 'sales-rooms'

          if (entityType === 'deals') {
            try {
              const token = localStorage.getItem('token');
              const response = await fetch(`/api/deals/${part}`, {
                headers: {
                  'Authorization': `Bearer ${token}`,
                },
              });
              if (response.ok) {
                const data = await response.json();
                // API returns { deal: { company_name: "..." } }
                setEntityName(data.deal?.company_name || data.company_name);
                setEntityId(part);
                return;
              }
            } catch (error) {
              console.error('Failed to fetch deal name:', error);
            }
          } else if (entityType === 'sales-rooms') {
            try {
              const token = localStorage.getItem('token');
              const response = await fetch(`/api/sales-rooms/${part}`, {
                headers: {
                  'Authorization': `Bearer ${token}`,
                },
              });
              if (response.ok) {
                const data = await response.json();
                setEntityName(data.deal?.company_name || 'Sales Room');
                setEntityId(part);
                return;
              }
            } catch (error) {
              console.error('Failed to fetch sales room name:', error);
            }
          }
        }
      }

      // No UUID found or fetch failed
      setEntityName(null);
      setEntityId(null);
    };

    fetchEntityName();
  }, [location.pathname]);

  // Generate breadcrumbs from current path
  const pathParts = location.pathname.split('/').filter(Boolean);

  // Don't show breadcrumbs if we're just on the dashboard
  if (pathParts.length === 0 || (pathParts.length === 1 && pathParts[0] === 'dashboard')) {
    return null;
  }

  const breadcrumbs: BreadcrumbItem[] = [];

  // Always start with Dashboard
  breadcrumbs.push({
    label: 'Dashboard',
    path: '/dashboard',
    isLast: false,
  });

  let currentPath = '';
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  pathParts.forEach((part, index) => {
    // Skip dashboard as we already added it
    if (part === 'dashboard') return;

    currentPath += `/${part}`;
    const isLast = index === pathParts.length - 1;
    const isUUID = uuidPattern.test(part);

    let label = routeLabels[part] || part;

    // If it's a UUID, use the entity name if available
    if (isUUID) {
      if (entityName && entityId === part) {
        label = entityName;
      } else {
        // Truncate UUID for display
        label = part.substring(0, 8) + '...';
      }
    }

    breadcrumbs.push({
      label,
      path: currentPath,
      isLast,
    });
  });

  // Update the last item to be marked as last
  if (breadcrumbs.length > 0) {
    breadcrumbs[breadcrumbs.length - 1].isLast = true;
  }

  return (
    <nav aria-label="Breadcrumb" className="flex items-center text-sm">
      <ol className="flex items-center space-x-1">
        {breadcrumbs.map((crumb, index) => (
          <li key={crumb.path} className="flex items-center">
            {index > 0 && (
              <ChevronRight className="h-4 w-4 mx-1 text-muted-foreground" />
            )}
            {crumb.isLast ? (
              <span className="text-foreground font-medium truncate max-w-[200px]" aria-current="page" title={crumb.label}>
                {crumb.label}
              </span>
            ) : (
              <Link
                to={crumb.path}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {index === 0 ? (
                  <span className="flex items-center gap-1">
                    <Home className="h-4 w-4" />
                    <span className="hidden sm:inline">{crumb.label}</span>
                  </span>
                ) : (
                  crumb.label
                )}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
