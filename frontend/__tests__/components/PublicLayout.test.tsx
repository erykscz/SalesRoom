import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PublicLayout from '@/components/layout/PublicLayout';

describe('PublicLayout', () => {
  it('renders outlet content', () => {
    render(
      <MemoryRouter initialEntries={['/test']}>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route path="/test" element={<div>Public Content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Public Content')).toBeInTheDocument();
  });

  it('renders with background class', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/test']}>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route path="/test" element={<div>Content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    const layoutDiv = container.firstChild;
    expect(layoutDiv).toHaveClass('min-h-screen');
    expect(layoutDiv).toHaveClass('bg-background');
  });
});
