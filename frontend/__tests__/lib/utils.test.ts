import { cn } from '@/lib/utils';

describe('cn (classname merge utility)', () => {
  it('should merge simple class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('should handle undefined and null values', () => {
    expect(cn('foo', undefined, null, 'bar')).toBe('foo bar');
  });

  it('should handle empty strings', () => {
    expect(cn('foo', '', 'bar')).toBe('foo bar');
  });

  it('should handle conditional classes via clsx-style objects', () => {
    expect(cn('base', { active: true, disabled: false })).toBe('base active');
  });

  it('should merge Tailwind classes correctly (tailwind-merge)', () => {
    // tailwind-merge should resolve conflicting utilities
    expect(cn('px-2', 'px-4')).toBe('px-4');
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
  });

  it('should merge padding conflicts', () => {
    expect(cn('p-4', 'p-2')).toBe('p-2');
  });

  it('should handle arrays of class names', () => {
    expect(cn(['foo', 'bar'])).toBe('foo bar');
  });

  it('should return empty string for no arguments', () => {
    expect(cn()).toBe('');
  });

  it('should handle boolean false values in objects', () => {
    expect(cn({ hidden: false, visible: true })).toBe('visible');
  });

  it('should handle mixed arguments', () => {
    const result = cn('base', ['arr1', 'arr2'], { conditional: true });
    expect(result).toBe('base arr1 arr2 conditional');
  });
});
