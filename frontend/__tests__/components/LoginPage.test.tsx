import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import LoginPage from '@/pages/auth/LoginPage';

// Mock useAuth
const mockLogin = vi.fn();
const mockNavigate = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    login: mockLogin,
    isAuthenticated: false,
    isLoading: false,
    user: null,
    token: null,
  }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderPage = () => {
    return render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );
  };

  it('renders the sign in heading', () => {
    renderPage();
    // "Sign in" appears both as heading and button text
    const signInElements = screen.getAllByText('Sign in');
    expect(signInElements.length).toBeGreaterThanOrEqual(1);
    // The heading is rendered as an h3 (CardTitle)
    const heading = signInElements.find((el) => el.tagName === 'H3');
    expect(heading).toBeDefined();
  });

  it('renders the Sales Room branding', () => {
    renderPage();
    expect(screen.getByText('Sales Room')).toBeInTheDocument();
  });

  it('renders email and password fields', () => {
    renderPage();
    expect(screen.getByPlaceholderText('name@company.com')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter your password')).toBeInTheDocument();
  });

  it('renders the sign in button', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('renders forgot password link', () => {
    renderPage();
    expect(screen.getByText('Forgot password?')).toBeInTheDocument();
  });

  it('renders demo credentials hint', () => {
    renderPage();
    expect(screen.getByText(/demo credentials/i)).toBeInTheDocument();
    expect(screen.getByText(/admin@salesroom.local/i)).toBeInTheDocument();
  });

  it('allows user to type in email field', async () => {
    const user = userEvent.setup();
    renderPage();
    const emailInput = screen.getByPlaceholderText('name@company.com');
    await user.type(emailInput, 'test@example.com');
    expect(emailInput).toHaveValue('test@example.com');
  });

  it('allows user to type in password field', async () => {
    const user = userEvent.setup();
    renderPage();
    const passwordInput = screen.getByPlaceholderText('Enter your password');
    await user.type(passwordInput, 'mypassword');
    expect(passwordInput).toHaveValue('mypassword');
  });

  it('password field is type password by default', () => {
    renderPage();
    const passwordInput = screen.getByPlaceholderText('Enter your password');
    expect(passwordInput).toHaveAttribute('type', 'password');
  });

  it('calls login on form submission with valid credentials', async () => {
    const user = userEvent.setup();
    mockLogin.mockResolvedValueOnce(undefined);
    renderPage();

    await user.type(screen.getByPlaceholderText('name@company.com'), 'test@example.com');
    await user.type(screen.getByPlaceholderText('Enter your password'), 'password123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(mockLogin).toHaveBeenCalledWith('test@example.com', 'password123');
  });

  it('renders the credential description text', () => {
    renderPage();
    expect(
      screen.getByText(/enter your credentials to access your account/i)
    ).toBeInTheDocument();
  });
});
