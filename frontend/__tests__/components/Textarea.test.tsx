import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Textarea } from '@/components/ui/textarea';

describe('Textarea component', () => {
  it('renders a textarea element', () => {
    render(<Textarea placeholder="Enter description" />);
    expect(screen.getByPlaceholderText('Enter description')).toBeInTheDocument();
  });

  it('accepts and displays typed text', async () => {
    const user = userEvent.setup();
    render(<Textarea placeholder="Type here" />);
    const textarea = screen.getByPlaceholderText('Type here');

    await user.type(textarea, 'Hello\nWorld');
    expect(textarea).toHaveValue('Hello\nWorld');
  });

  it('renders as disabled', () => {
    render(<Textarea disabled placeholder="Disabled" />);
    expect(screen.getByPlaceholderText('Disabled')).toBeDisabled();
  });

  it('does not accept input when disabled', async () => {
    const user = userEvent.setup();
    render(<Textarea disabled placeholder="Disabled" />);
    const textarea = screen.getByPlaceholderText('Disabled');

    await user.type(textarea, 'test');
    expect(textarea).toHaveValue('');
  });

  it('calls onChange when value changes', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<Textarea onChange={handleChange} placeholder="Change" />);

    await user.type(screen.getByPlaceholderText('Change'), 'a');
    expect(handleChange).toHaveBeenCalledTimes(1);
  });

  it('applies custom className', () => {
    render(<Textarea className="custom-textarea" placeholder="Custom" />);
    const textarea = screen.getByPlaceholderText('Custom');
    expect(textarea.className).toContain('custom-textarea');
  });

  it('renders as a textarea HTML element', () => {
    render(<Textarea placeholder="Tag check" />);
    const el = screen.getByPlaceholderText('Tag check');
    expect(el.tagName).toBe('TEXTAREA');
  });
});
