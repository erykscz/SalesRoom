import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import RoleGuard from '@/components/guards/RoleGuard';

let mockAuth = {
  user: null as null | { role: string; id: string; email: string; name: string },
  token: 'test-token',
  isAuthenticated: true,
  isLoading: false,
  login: vi.fn(),
  logout: vi.fn(),
  refreshUser: vi.fn(),
};

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockAuth,
}));

describe('RoleGuard', () => {
  beforeEach(() => {
    mockAuth = {
      user: null,
      token: 'test-token',
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    };
  });

  it('redirects to dashboard when user has no role match', () => {
    mockAuth.user = { role: 'rep', id: '1', email: 'rep@test.com', name: 'Rep' };
    render(
      <MemoryRouter initialEntries={['/admin/users']}>
        <Routes>
          <Route element={<RoleGuard allowedRoles={['admin']} />}>
            <Route path="/admin/users" element={<div>Admin Users Page</div>} />
          </Route>
          <Route path="/dashboard" element={<div>Dashboard</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.queryByText('Admin Users Page')).not.toBeInTheDocument();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('renders content when user has matching role', () => {
    mockAuth.user = { role: 'admin', id: '1', email: 'admin@test.com', name: 'Admin' };
    render(
      <MemoryRouter initialEntries={['/admin/users']}>
        <Routes>
          <Route element={<RoleGuard allowedRoles={['admin']} />}>
            <Route path="/admin/users" element={<div>Admin Users Page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Admin Users Page')).toBeInTheDocument();
  });

  it('allows access when user role is in allowedRoles list', () => {
    mockAuth.user = { role: 'manager', id: '1', email: 'mgr@test.com', name: 'Manager' };
    render(
      <MemoryRouter initialEntries={['/manager/dashboard']}>
        <Routes>
          <Route element={<RoleGuard allowedRoles={['manager', 'admin']} />}>
            <Route path="/manager/dashboard" element={<div>Manager Dashboard</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Manager Dashboard')).toBeInTheDocument();
  });

  it('redirects when user is null', () => {
    mockAuth.user = null;
    render(
      <MemoryRouter initialEntries={['/admin/users']}>
        <Routes>
          <Route element={<RoleGuard allowedRoles={['admin']} />}>
            <Route path="/admin/users" element={<div>Admin Page</div>} />
          </Route>
          <Route path="/dashboard" element={<div>Dashboard</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.queryByText('Admin Page')).not.toBeInTheDocument();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });
});
