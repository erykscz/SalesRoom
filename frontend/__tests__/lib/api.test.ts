import { API_URL } from '@/lib/api';

describe('API_URL constant', () => {
  it('should be defined', () => {
    expect(API_URL).toBeDefined();
  });

  it('should be a string', () => {
    expect(typeof API_URL).toBe('string');
  });

  it('should default to /api when VITE_API_URL is not set', () => {
    // In test env, VITE_API_URL is likely not set, so it defaults to /api
    expect(API_URL).toBe('/api');
  });
});
