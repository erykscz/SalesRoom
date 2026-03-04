import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NotFoundPage from '@/pages/NotFoundPage';

describe('NotFoundPage', () => {
  const renderPage = () => {
    return render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>
    );
  };

  it('renders the 404 heading', () => {
    renderPage();
    expect(screen.getByText('404')).toBeInTheDocument();
  });

  it('renders page not found message', () => {
    renderPage();
    expect(screen.getByText('Page not found')).toBeInTheDocument();
  });

  it('renders a descriptive message', () => {
    renderPage();
    expect(
      screen.getByText(/the page you're looking for doesn't exist/i)
    ).toBeInTheDocument();
  });

  it('renders a link back to dashboard', () => {
    renderPage();
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/dashboard');
  });

  it('renders the Back to Dashboard button', () => {
    renderPage();
    expect(screen.getByText(/back to dashboard/i)).toBeInTheDocument();
  });
});
