import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Input } from '@/components/ui/input';

describe('Input component', () => {
  it('renders an input element', () => {
    render(<Input placeholder="Enter text" />);
    expect(screen.getByPlaceholderText('Enter text')).toBeInTheDocument();
  });

  it('accepts and displays typed text', async () => {
    const user = userEvent.setup();
    render(<Input placeholder="Type here" />);
    const input = screen.getByPlaceholderText('Type here');

    await user.type(input, 'Hello World');
    expect(input).toHaveValue('Hello World');
  });

  it('renders with type email', () => {
    render(<Input type="email" placeholder="Email" />);
    const input = screen.getByPlaceholderText('Email');
    expect(input).toHaveAttribute('type', 'email');
  });

  it('renders with type password', () => {
    render(<Input type="password" placeholder="Password" />);
    const input = screen.getByPlaceholderText('Password');
    expect(input).toHaveAttribute('type', 'password');
  });

  it('renders as disabled', () => {
    render(<Input disabled placeholder="Disabled" />);
    expect(screen.getByPlaceholderText('Disabled')).toBeDisabled();
  });

  it('does not accept input when disabled', async () => {
    const user = userEvent.setup();
    render(<Input disabled placeholder="Disabled" />);
    const input = screen.getByPlaceholderText('Disabled');

    await user.type(input, 'test');
    expect(input).toHaveValue('');
  });

  it('calls onChange when value changes', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<Input onChange={handleChange} placeholder="Change" />);

    await user.type(screen.getByPlaceholderText('Change'), 'a');
    expect(handleChange).toHaveBeenCalledTimes(1);
  });

  it('applies custom className', () => {
    render(<Input className="custom-input" placeholder="Custom" />);
    const input = screen.getByPlaceholderText('Custom');
    expect(input.className).toContain('custom-input');
  });

  it('supports id attribute', () => {
    render(<Input id="my-input" placeholder="ID" />);
    const input = screen.getByPlaceholderText('ID');
    expect(input).toHaveAttribute('id', 'my-input');
  });

  it('supports autoComplete attribute', () => {
    render(<Input autoComplete="email" placeholder="Autocomplete" />);
    const input = screen.getByPlaceholderText('Autocomplete');
    expect(input).toHaveAttribute('autocomplete', 'email');
  });
});
