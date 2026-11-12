import type { Page } from "playwright";
import { redactText } from "../../security/redact.js";

export type FinalUrlValidator = (finalUrl: string) => Promise<void>;

/**
 * Navigate and re-validate final URL (after redirects) against caller policy.
 * On validation failure, blank the page and throw.
 */
export async function navigate(
  page: Page,
  url: string,
  validateFinal?: FinalUrlValidator
): Promise<{ title: string; url: string }> {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  const finalUrl = page.url();
  if (validateFinal) {
    try {
      await validateFinal(finalUrl);
    } catch (err) {
      await page.goto("about:blank").catch(() => undefined);
      throw err;
    }
  }
  return { title: await page.title(), url: finalUrl };
}

export async function snapshot(page: Page, maxBytes: number): Promise<string> {
  const snap = await page.locator("body").ariaSnapshot().catch(async () => {
    const text = await page.innerText("body");
    return text;
  });
  return redactText(String(snap), maxBytes);
}

export async function click(page: Page, selector: string): Promise<void> {
  await page.locator(selector).first().click({ timeout: 10_000 });
}

export async function fill(page: Page, selector: string, value: string): Promise<void> {
  await page.locator(selector).first().fill(value, { timeout: 10_000 });
}

export async function waitFor(
  page: Page,
  selector?: string,
  text?: string,
  timeoutMs = 10_000
): Promise<void> {
  if (selector) {
    await page.locator(selector).first().waitFor({ state: "visible", timeout: timeoutMs });
    return;
  }
  if (text) {
    await page.getByText(text).first().waitFor({ state: "visible", timeout: timeoutMs });
    return;
  }
  await page.waitForTimeout(Math.min(timeoutMs, 2000));
}
