import { render, screen } from '@testing-library/react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';

describe('Card component', () => {
  it('renders Card with children', () => {
    render(<Card>Card content</Card>);
    expect(screen.getByText('Card content')).toBeInTheDocument();
  });

  it('applies custom className to Card', () => {
    const { container } = render(<Card className="custom-card">Test</Card>);
    expect(container.firstChild).toHaveClass('custom-card');
  });

  it('renders CardHeader', () => {
    render(
      <Card>
        <CardHeader>Header</CardHeader>
      </Card>
    );
    expect(screen.getByText('Header')).toBeInTheDocument();
  });

  it('renders CardTitle as h3', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>My Title</CardTitle>
        </CardHeader>
      </Card>
    );
    const title = screen.getByText('My Title');
    expect(title).toBeInTheDocument();
    expect(title.tagName).toBe('H3');
  });

  it('renders CardDescription as p', () => {
    render(
      <Card>
        <CardHeader>
          <CardDescription>My Description</CardDescription>
        </CardHeader>
      </Card>
    );
    const desc = screen.getByText('My Description');
    expect(desc).toBeInTheDocument();
    expect(desc.tagName).toBe('P');
  });

  it('renders CardContent', () => {
    render(
      <Card>
        <CardContent>Content area</CardContent>
      </Card>
    );
    expect(screen.getByText('Content area')).toBeInTheDocument();
  });

  it('renders CardFooter', () => {
    render(
      <Card>
        <CardFooter>Footer area</CardFooter>
      </Card>
    );
    expect(screen.getByText('Footer area')).toBeInTheDocument();
  });

  it('renders a complete card with all sub-components', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Title</CardTitle>
          <CardDescription>Description</CardDescription>
        </CardHeader>
        <CardContent>Body</CardContent>
        <CardFooter>Footer</CardFooter>
      </Card>
    );

    expect(screen.getByText('Title')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByText('Body')).toBeInTheDocument();
    expect(screen.getByText('Footer')).toBeInTheDocument();
  });

  it('applies custom className to CardContent', () => {
    const { container } = render(
      <Card>
        <CardContent className="custom-content">Test</CardContent>
      </Card>
    );
    const content = container.querySelector('.custom-content');
    expect(content).toBeInTheDocument();
  });
});
