import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage';

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderPage = () => {
    return render(
      <MemoryRouter>
        <ForgotPasswordPage />
      </MemoryRouter>
    );
  };

  it('renders the reset password heading', () => {
    renderPage();
    expect(screen.getByText('Reset password')).toBeInTheDocument();
  });

  it('renders the Sales Room branding', () => {
    renderPage();
    expect(screen.getByText('Sales Room')).toBeInTheDocument();
  });

  it('renders email input field', () => {
    renderPage();
    expect(screen.getByPlaceholderText('name@company.com')).toBeInTheDocument();
  });

  it('renders send reset link button', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /send reset link/i })).toBeInTheDocument();
  });

  it('renders back to sign in link', () => {
    renderPage();
    expect(screen.getByText(/back to sign in/i)).toBeInTheDocument();
  });

  it('allows user to type email', async () => {
    const user = userEvent.setup();
    renderPage();
    const emailInput = screen.getByPlaceholderText('name@company.com');
    await user.type(emailInput, 'user@test.com');
    expect(emailInput).toHaveValue('user@test.com');
  });

  it('renders the description text', () => {
    renderPage();
    expect(
      screen.getByText(/enter your email address and we'll send you a link/i)
    ).toBeInTheDocument();
  });

  it('shows success message after successful submission', async () => {
    const user = userEvent.setup();
    // Mock successful fetch
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ message: 'Reset email sent' }),
    });

    renderPage();
    const emailInput = screen.getByPlaceholderText('name@company.com');
    await user.type(emailInput, 'user@test.com');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    expect(await screen.findByText('Check your email')).toBeInTheDocument();
  });
});
