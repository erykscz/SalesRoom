import { test, expect } from '@playwright/test';
import { loginAs, logout, TEST_USER } from './helpers';

test.describe('Authentication flow', () => {
  test('should login with valid credentials and redirect to dashboard', async ({ page }) => {
    await loginAs(page);

    // Should be on the dashboard now
    await expect(page).toHaveURL(/\/dashboard/);

    // Dashboard should show some recognisable content
    // The MainLayout renders the user name somewhere in the sidebar
    await expect(page.locator('text=Dashboard')).toBeVisible();
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('/login');

    // Fill in bad credentials
    await page.fill('input#email', 'nobody@example.com');
    await page.fill('input#password', 'WrongPassword!');
    await page.click('button[type="submit"]');

    // Should stay on the login page
    await expect(page).toHaveURL(/\/login/);

    // The toast notification with "Login failed" should appear
    // The app uses a Toaster component from shadcn/ui
    await expect(page.locator('text=Login failed')).toBeVisible({ timeout: 5_000 });
  });

  test('should show error when fields are empty', async ({ page }) => {
    await page.goto('/login');

    // Click Sign in without filling anything
    await page.click('button[type="submit"]');

    // Should stay on login and see an error toast
    await expect(page).toHaveURL(/\/login/);
    await expect(
      page.locator('text=Please enter both email and password'),
    ).toBeVisible({ timeout: 5_000 });
  });

  test('should logout and redirect to login page', async ({ page }) => {
    // First, log in
    await loginAs(page);
    await expect(page).toHaveURL(/\/dashboard/);

    // Now log out
    await logout(page);

    // Should be back on the login page
    await expect(page).toHaveURL(/\/login/);

    // The login form should be visible again
    await expect(page.locator('input#email')).toBeVisible();
  });

  test('should redirect unauthenticated users to login', async ({ page }) => {
    // Try to access a protected page directly without logging in
    await page.goto('/deals');

    // Should be redirected to /login
    await expect(page).toHaveURL(/\/login/);
  });
});
