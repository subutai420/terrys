import { expect, test } from '@playwright/test'

test.describe('Smoke test', () => {
  test('homepage renders in Czech', async ({ page }) => {
    await page.goto('/')

    await expect(page).toHaveTitle(/Terrys/)
    await expect(page.locator('html')).toHaveAttribute('lang', 'cs')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByRole('search').first()).toBeVisible()
  })

  test('admin shows the login or create-first-user screen', async ({ page }) => {
    await page.goto('/admin')

    // Empty database -> "create first user"; otherwise -> login form.
    await expect(page).toHaveURL(/\/admin\/(login|create-first-user)/)
    await expect(page.locator('input[name="email"]')).toBeVisible()
  })
})
