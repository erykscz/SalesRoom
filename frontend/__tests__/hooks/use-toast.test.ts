import { reducer } from '@/hooks/use-toast';

// Test the reducer directly since the hook has side effects that are hard to isolate
describe('toast reducer', () => {
  const createToast = (id: string, title?: string) => ({
    id,
    title: title || `Toast ${id}`,
    open: true,
    onOpenChange: vi.fn(),
  });

  describe('ADD_TOAST', () => {
    it('should add a toast to empty state', () => {
      const state = { toasts: [] };
      const toast = createToast('1', 'New toast');
      const result = reducer(state, { type: 'ADD_TOAST', toast });

      expect(result.toasts).toHaveLength(1);
      expect(result.toasts[0].id).toBe('1');
      expect(result.toasts[0].title).toBe('New toast');
    });

    it('should prepend new toast (newest first)', () => {
      const state = { toasts: [createToast('1', 'First')] };
      const toast = createToast('2', 'Second');
      const result = reducer(state, { type: 'ADD_TOAST', toast });

      // With TOAST_LIMIT = 1, only the newest toast is kept
      expect(result.toasts[0].id).toBe('2');
    });

    it('should respect TOAST_LIMIT of 1', () => {
      const state = { toasts: [createToast('1')] };
      const toast = createToast('2');
      const result = reducer(state, { type: 'ADD_TOAST', toast });

      // TOAST_LIMIT is 1, so only one toast should remain
      expect(result.toasts.length).toBeLessThanOrEqual(1);
    });
  });

  describe('UPDATE_TOAST', () => {
    it('should update an existing toast', () => {
      const state = { toasts: [createToast('1', 'Original')] };
      const result = reducer(state, {
        type: 'UPDATE_TOAST',
        toast: { id: '1', title: 'Updated' },
      });

      expect(result.toasts[0].title).toBe('Updated');
    });

    it('should not affect other toasts', () => {
      const state = {
        toasts: [createToast('1', 'First')],
      };
      const result = reducer(state, {
        type: 'UPDATE_TOAST',
        toast: { id: '2', title: 'Updated' },
      });

      expect(result.toasts[0].title).toBe('First');
    });

    it('should merge partial updates', () => {
      const state = { toasts: [createToast('1', 'Original')] };
      const result = reducer(state, {
        type: 'UPDATE_TOAST',
        toast: { id: '1', description: 'Added description' },
      });

      expect(result.toasts[0].title).toBe('Original');
      expect(result.toasts[0].description).toBe('Added description');
    });
  });

  describe('DISMISS_TOAST', () => {
    it('should set open to false for specific toast', () => {
      const state = { toasts: [createToast('1')] };
      const result = reducer(state, {
        type: 'DISMISS_TOAST',
        toastId: '1',
      });

      expect(result.toasts[0].open).toBe(false);
    });

    it('should dismiss all toasts when no toastId provided', () => {
      const state = {
        toasts: [createToast('1')],
      };
      const result = reducer(state, {
        type: 'DISMISS_TOAST',
        toastId: undefined,
      });

      result.toasts.forEach((t) => {
        expect(t.open).toBe(false);
      });
    });
  });

  describe('REMOVE_TOAST', () => {
    it('should remove a specific toast', () => {
      const state = { toasts: [createToast('1')] };
      const result = reducer(state, {
        type: 'REMOVE_TOAST',
        toastId: '1',
      });

      expect(result.toasts).toHaveLength(0);
    });

    it('should remove all toasts when no toastId', () => {
      const state = {
        toasts: [createToast('1')],
      };
      const result = reducer(state, {
        type: 'REMOVE_TOAST',
        toastId: undefined,
      });

      expect(result.toasts).toHaveLength(0);
    });

    it('should not remove non-matching toast', () => {
      const state = { toasts: [createToast('1')] };
      const result = reducer(state, {
        type: 'REMOVE_TOAST',
        toastId: '999',
      });

      expect(result.toasts).toHaveLength(1);
    });
  });
});
