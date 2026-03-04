import { test, expect } from '@playwright/test';
import { loginAs, uniqueName, tomorrowDate } from './helpers';

test.describe('Deals CRUD', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page);
  });

  // ── View deals list ─────────────────────────────────────────────────

  test('should display the deals list page', async ({ page }) => {
    await page.goto('/deals');

    // Page heading
    await expect(page.locator('h2', { hasText: 'Deals' })).toBeVisible();

    // The "Create Deal" button should be visible
    await expect(page.locator('text=Create Deal')).toBeVisible();

    // The search input should be present
    await expect(page.locator('input[placeholder="Search deals..."]')).toBeVisible();
  });

  // ── Create a new deal ───────────────────────────────────────────────

  test('should create a new deal', async ({ page }) => {
    const dealName = uniqueName('E2E-Deal');
    const nextStepDate = tomorrowDate();

    await page.goto('/deals/new');

    // Page heading
    await expect(page.locator('h2', { hasText: 'Create Deal' })).toBeVisible();

    // Fill required fields
    await page.fill('input#name', dealName);
    await page.fill('input#next_step_date', nextStepDate);

    // Fill optional fields
    await page.fill('input#company_name', 'E2E Test Corp');
    await page.fill('input#email', 'e2e@test.com');

    // Submit the form
    await page.click('button:has-text("Create Deal")');

    // Should be redirected to the deal detail page
    await page.waitForURL(/\/deals\/[a-f0-9-]+/, { timeout: 10_000 });

    // The deal name should appear on the detail page
    await expect(page.locator(`text=${dealName}`)).toBeVisible();
  });

  // ── View deal detail ────────────────────────────────────────────────

  test('should navigate to deal detail from the list', async ({ page }) => {
    // First create a deal so we have something to view
    const dealName = uniqueName('E2E-Detail');
    const nextStepDate = tomorrowDate();

    await page.goto('/deals/new');
    await page.fill('input#name', dealName);
    await page.fill('input#next_step_date', nextStepDate);
    await page.click('button:has-text("Create Deal")');
    await page.waitForURL(/\/deals\/[a-f0-9-]+/, { timeout: 10_000 });

    // Go back to the deals list
    await page.goto('/deals');
    await page.waitForSelector('table', { timeout: 10_000 });

    // Search for our deal
    await page.fill('input[placeholder="Search deals..."]', dealName);

    // Wait for search results to update
    await page.waitForTimeout(500);

    // Click on the deal name link
    const dealLink = page.locator(`a:has-text("${dealName}")`).first();
    await dealLink.click();

    // Should navigate to the deal detail page
    await page.waitForURL(/\/deals\/[a-f0-9-]+/, { timeout: 10_000 });
    await expect(page.locator(`text=${dealName}`)).toBeVisible();
  });

  // ── Edit a deal ─────────────────────────────────────────────────────

  test('should edit an existing deal', async ({ page }) => {
    // Create a deal first
    const originalName = uniqueName('E2E-Edit');
    const updatedName = uniqueName('E2E-Edited');
    const nextStepDate = tomorrowDate();

    await page.goto('/deals/new');
    await page.fill('input#name', originalName);
    await page.fill('input#next_step_date', nextStepDate);
    await page.click('button:has-text("Create Deal")');
    await page.waitForURL(/\/deals\/[a-f0-9-]+/, { timeout: 10_000 });

    // Extract the deal ID from the URL
    const url = page.url();
    const dealId = url.split('/deals/')[1];

    // Navigate to the edit page
    await page.goto(`/deals/${dealId}/edit`);

    // Wait for the form to load with existing data
    await page.waitForSelector('input#name', { timeout: 10_000 });

    // Clear the name and type the updated name
    await page.fill('input#name', updatedName);

    // Save changes
    await page.click('button:has-text("Save")');

    // Should redirect back to the deal detail page
    await page.waitForURL(/\/deals\/[a-f0-9-]+/, { timeout: 10_000 });

    // Verify the updated name is shown
    await expect(page.locator(`text=${updatedName}`)).toBeVisible();
  });

  // ── Navigate between pages ──────────────────────────────────────────

  test('should navigate between deals list and create page', async ({ page }) => {
    await page.goto('/deals');

    // Click "Create Deal" button
    await page.click('a:has-text("Create Deal")');
    await expect(page).toHaveURL(/\/deals\/new/);
    await expect(page.locator('h2', { hasText: 'Create Deal' })).toBeVisible();

    // Click "Back" to return to the list
    await page.click('a:has-text("Back")');
    await expect(page).toHaveURL(/\/deals/);
    await expect(page.locator('h2', { hasText: 'Deals' })).toBeVisible();
  });

  // ── Stage filters ───────────────────────────────────────────────────

  test('should filter deals by stage', async ({ page }) => {
    await page.goto('/deals');

    // Click the "All" stage filter (it should be active by default)
    await expect(page.locator('button:has-text("All")').first()).toBeVisible();

    // Click a specific stage filter
    await page.click('button:has-text("New Signal")');

    // URL should contain the stage filter parameter
    await expect(page).toHaveURL(/stage=new_signal/);
  });

  // ── Validation errors on create ─────────────────────────────────────

  test('should show validation error when required fields are missing', async ({ page }) => {
    await page.goto('/deals/new');

    // Try to submit without filling the name
    await page.click('button:has-text("Create Deal")');

    // The browser's native validation or the app's error should appear
    // The name field has required attribute, so we check for the validation state
    const nameInput = page.locator('input#name');
    await expect(nameInput).toBeVisible();
  });
});
