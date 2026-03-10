import { type Page, expect } from '@playwright/test';

/**
 * Default test user credentials (seeded by backend/src/db/init.js).
 */
export const TEST_USER = {
  email: 'admin@salesroom.local',
  password: 'Admin123!',
  name: 'System Admin',
};

/**
 * Log in as the given user via the /login page.
 *
 * 1. Navigates to /login
 * 2. Fills in email + password
 * 3. Clicks "Sign in"
 * 4. Waits for redirect to the dashboard (or wherever the user came from)
 */
export async function loginAs(
  page: Page,
  email: string = TEST_USER.email,
  password: string = TEST_USER.password,
): Promise<void> {
  // Retry login up to 3 times to handle backend DB cold-start in CI
  for (let attempt = 1; attempt <= 3; attempt++) {
    await page.goto('/login');
    await page.waitForSelector('form');
    await page.fill('input#email', email);
    await page.fill('input#password', password);
    await page.click('button[type="submit"]');

    try {
      await page.waitForURL('**/dashboard', { timeout: 10_000 });
      return; // success
    } catch {
      if (attempt === 3) throw new Error('Login failed after 3 attempts');
      // Wait before retrying — gives backend DB time to initialize
      await page.waitForTimeout(2_000);
    }
  }
}

/**
 * Log out the current user.
 *
 * The logout button is a ghost button with a LogOut icon in the sidebar.
 * After clicking it the app redirects to /login.
 */
export async function logout(page: Page): Promise<void> {
  // The logout button has a LogOut icon (svg) inside. It is the last button in
  // the sidebar footer area. We target the button that triggers handleLogout.
  // The sidebar has a button with the lucide LogOut icon.
  const logoutButton = page.locator('button').filter({ has: page.locator('svg.lucide-log-out') });
  await logoutButton.click();

  // Wait for redirect to login
  await page.waitForURL('**/login', { timeout: 10_000 });
}

/**
 * Generate a unique name for test entities to avoid collisions between runs.
 */
export function uniqueName(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Get tomorrow's date as YYYY-MM-DD, useful for the required next_step_date field.
 */
export function tomorrowDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}
