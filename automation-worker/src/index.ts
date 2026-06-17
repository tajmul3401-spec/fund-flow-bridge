// APB Automation Worker — polls middleware, drives Playwright, reports back.
// Run with: node --experimental-strip-types src/index.ts
import { chromium, type BrowserContext, type Page } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const BASE_URL = mustEnv("APB_BASE_URL").replace(/\/$/, "");
const TOKEN = mustEnv("APB_WORKER_TOKEN");
const POLL_MS = Number(process.env.POLL_INTERVAL_MS ?? 1000);
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 3);
const PROFILES_DIR = process.env.BROWSER_PROFILES_DIR ?? "./browser-profiles";
const HEADLESS = (process.env.HEADLESS ?? "true") !== "false";

function mustEnv(k: string): string {
  const v = process.env[k];
  if (!v) { console.error(`Missing env ${k}`); process.exit(1); }
  return v;
}

type Job = {
  job_id: string;
  transaction_id: string;
  apb_session_id: string;
  attempt: number;
  amount: number;
  payment_method_target: string;
  provider_callback_url: string;
  provider: {
    id: string;
    name: string;
    base_url: string;
    username: string;
    password: string;
    flow_config: FlowConfig;
  };
};

type FlowConfig = {
  login?: {
    url_path?: string;
    username_selector?: string;
    password_selector?: string;
    submit_selector?: string;
    success_url_contains?: string;
  };
  add_funds?: {
    url_path?: string;
    amount_selector?: string;
    method_selector_template?: string; // "{target}" replaced with payment_method_target
    submit_selector?: string;
    gateway_selector_chain?: string[];
    final_url_capture?: string; // CSS selector of iframe whose src is the checkout URL
    return_url_field?: string;  // optional input where we inject provider_callback_url
    wait_for_selector?: string; // wait for this element after chain (e.g. #CardNumber)
    final_url_contains?: string; // poll URL until it contains this substring
    final_url_timeout_ms?: number;
  };
};

const contexts = new Map<string, BrowserContext>();
let inFlight = 0;

const DEFAULT_LOGIN_USERNAME = '#username, input[name="LoginForm[username]"], input[name="username"], input[name="email"], input[type="email"]';
const DEFAULT_LOGIN_PASSWORD = '#password, input[name="LoginForm[password]"], input[name="password"], input[type="password"]';
const DEFAULT_LOGIN_SUBMIT = '#loginForm button[type="submit"], form#loginForm button[type="submit"], button[type="submit"]:has-text("Sign in"), button:has-text("Sign in")';
const DEFAULT_AMOUNT_SELECTOR = '#amount, input[name="amount"], input[name="AddFoundsForm[amount]"], input[name="AddFundsForm[amount]"], input[placeholder*="Amount" i]';

function findUrlContaining(page: Page, needle?: string): string | undefined {
  if (!needle) return undefined;
  if (page.url().includes(needle)) return page.url();
  return page.frames().map(frame => frame.url()).find(url => url.includes(needle));
}

async function isAttached(page: Page, selector?: string, timeout = 500): Promise<boolean> {
  if (!selector) return false;
  return page.locator(selector).first().waitFor({ state: "attached", timeout }).then(() => true).catch(() => false);
}

async function fillAttachedField(page: Page, selector: string, value: string, timeout = 15_000): Promise<void> {
  const field = page.locator(selector).first();
  await field.waitFor({ state: "attached", timeout });
  await field.scrollIntoViewIfNeeded({ timeout: 2_000 }).catch(() => {});
  if (await field.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await field.fill(value, { timeout });
    return;
  }

  await field.evaluate((element, nextValue) => {
    const input = element as HTMLInputElement;
    input.focus();
    input.value = nextValue;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

async function submitAttachedForm(page: Page, selector: string, timeout = 15_000): Promise<void> {
  const submit = page.locator(selector).first();
  await submit.waitFor({ state: "attached", timeout });
  await submit.scrollIntoViewIfNeeded({ timeout: 2_000 }).catch(() => {});
  if (await submit.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await submit.click({ timeout });
    return;
  }

  await submit.evaluate((element) => {
    const form = element.closest("form") as HTMLFormElement | null;
    if (form?.requestSubmit) form.requestSubmit(element as HTMLElement);
    else form?.submit();
  });
}

async function isReadyForCapture(page: Page, cfg: FlowConfig["add_funds"] = {}): Promise<boolean> {
  if (findUrlContaining(page, cfg.final_url_contains)) return true;
  if (await isAttached(page, cfg.wait_for_selector)) return true;
  if (await isAttached(page, cfg.final_url_capture)) return true;
  return false;
}

async function api(pathName: string, body?: unknown, method = "POST") {
  const res = await fetch(`${BASE_URL}${pathName}`, {
    method,
    headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${pathName} → ${res.status}: ${await res.text()}`);
  return res.json();
}

async function getContext(providerId: string): Promise<BrowserContext> {
  let ctx = contexts.get(providerId);
  if (ctx) return ctx;
  const userDataDir = path.join(PROFILES_DIR, providerId);
  await mkdir(userDataDir, { recursive: true });
  ctx = await chromium.launchPersistentContext(userDataDir, {
    headless: HEADLESS,
    viewport: { width: 1280, height: 800 },
  });
  contexts.set(providerId, ctx);
  return ctx;
}

async function loginIfNeeded(page: Page, job: Job): Promise<void> {
  const cfg = job.provider.flow_config.login ?? {};
  const loginUrl = job.provider.base_url + (cfg.url_path ?? "/login");
  const addFundsCfg = job.provider.flow_config.add_funds ?? {};
  const addFundsUrl = job.provider.base_url + (addFundsCfg.url_path ?? "/addfund");
  const amountSelector = `${addFundsCfg.amount_selector ?? DEFAULT_AMOUNT_SELECTOR}, ${DEFAULT_AMOUNT_SELECTOR}`;
  await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 20_000 });
  if (cfg.success_url_contains && page.url().includes(cfg.success_url_contains)) return;
  if (cfg.username_selector && cfg.password_selector && cfg.submit_selector) {
    const usernameSelector = `${cfg.username_selector}, ${DEFAULT_LOGIN_USERNAME}`;
    const passwordSelector = `${cfg.password_selector}, ${DEFAULT_LOGIN_PASSWORD}`;
    const submitSelector = `${cfg.submit_selector}, ${DEFAULT_LOGIN_SUBMIT}`;
    let found = await isAttached(page, usernameSelector, 5_000);
    if (!found) {
      await page.goto(`${job.provider.base_url}/#login`, { waitUntil: "domcontentloaded", timeout: 20_000 });
      found = await isAttached(page, usernameSelector, 5_000);
    }

    if (!found) {
      await page.goto(addFundsUrl, { waitUntil: "domcontentloaded", timeout: 20_000 }).catch(() => {});
      if (await page.locator(amountSelector).first().isVisible({ timeout: 5_000 }).catch(() => false)) {
        console.log(`[${job.apb_session_id}] already logged in (${page.url()})`);
        return;
      }
      throw new Error(`Login form not found at ${loginUrl}; current page ${page.url()}`);
    }

    await fillAttachedField(page, usernameSelector, job.provider.username);
    await fillAttachedField(page, passwordSelector, job.provider.password);
    await Promise.all([
      page.waitForLoadState("domcontentloaded", { timeout: 20_000 }).catch(() => {}),
      submitAttachedForm(page, submitSelector),
    ]);

    await page.goto(addFundsUrl, { waitUntil: "domcontentloaded", timeout: 20_000 }).catch(() => {});
    if (await page.locator(amountSelector).first().isVisible({ timeout: 8_000 }).catch(() => false)) {
      console.log(`[${job.apb_session_id}] login OK (${page.url()})`);
      return;
    }

    throw new Error(`Login did not reach add funds page. Current page ${page.url()}`);
  }
}

async function captureCheckoutUrl(page: Page, job: Job): Promise<string> {
  const cfg = job.provider.flow_config.add_funds ?? {};
  const addUrl = job.provider.base_url + (cfg.url_path ?? "/addfund");
  await page.goto(addUrl, { waitUntil: "domcontentloaded", timeout: 20_000 });

  if (cfg.amount_selector) {
    const amountSelector = `${cfg.amount_selector}, ${DEFAULT_AMOUNT_SELECTOR}`;
    if (!(await page.locator(amountSelector).first().isVisible({ timeout: 8_000 }).catch(() => false))) {
      await loginIfNeeded(page, job);
      await page.goto(addUrl, { waitUntil: "domcontentloaded", timeout: 20_000 });
    }
    await page.locator(amountSelector).first().fill(String(job.amount), { timeout: 15_000 });
  }
  if (cfg.method_selector_template) {
    const sel = cfg.method_selector_template.replace("{target}", job.payment_method_target);
    await page.click(sel, { timeout: 8_000 });
  }
  if (cfg.return_url_field) await page.fill(cfg.return_url_field, job.provider_callback_url);
  if (cfg.submit_selector) {
    await Promise.all([
      page.waitForLoadState("domcontentloaded"),
      page.click(cfg.submit_selector),
    ]);
  }
  for (const sel of cfg.gateway_selector_chain ?? []) {
    if (await isReadyForCapture(page, cfg)) break;

    const target = page.locator(sel).first();
    const visible = await target.isVisible({ timeout: 10_000 }).catch(() => false);
    if (!visible) {
      console.log(`[${job.apb_session_id}] selector not visible, skipping: ${sel} (${page.url()})`);
      continue;
    }

    await target.click({ timeout: 10_000 });
    await page.waitForLoadState("domcontentloaded", { timeout: 10_000 }).catch(() => {});
  }

  // Poll URL until it contains the expected substring (handles redirects)
  if (cfg.final_url_contains) {
    const timeout = cfg.final_url_timeout_ms ?? 30_000;
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const url = findUrlContaining(page, cfg.final_url_contains);
      if (url) return url;
      await new Promise(r => setTimeout(r, 500));
    }
    if (await isAttached(page, cfg.wait_for_selector, 1_000)) {
      console.log(`[${job.apb_session_id}] expected URL substring not found, but payment form is present; returning current URL (${page.url()})`);
      return page.url();
    }
    throw new Error(`Timeout waiting for URL to contain "${cfg.final_url_contains}". Current: ${page.url()}`);
  }

  if (cfg.final_url_capture) {
    const el = await page.waitForSelector(cfg.final_url_capture, { state: "attached", timeout: 15_000 });
    const src = await el.getAttribute("src");
    if (src) return src;
  }

  // Wait for a specific element on the final page (e.g. card number input).
  // Some gateways keep the card input hidden until their own scripts finish,
  // so attached is enough to know the checkout page exists.
  if (cfg.wait_for_selector) {
    await page.waitForSelector(cfg.wait_for_selector, { state: "attached", timeout: 15_000 });
  }

  // Fallback: current URL
  return page.url();
}

async function runJob(job: Job) {
  const heartbeat = setInterval(() => {
    api(`/api/public/v1/worker/jobs/${job.job_id}/heartbeat`).catch(() => {});
  }, 5000);
  const ctx = await getContext(job.provider.id);
  const page = await ctx.newPage();
  try {
    await loginIfNeeded(page, job);
    const url = await captureCheckoutUrl(page, job);
    await api(`/api/public/v1/worker/jobs/${job.job_id}/result`, {
      outcome: "success",
      checkout_url: url,
    });
    console.log(`[${job.apb_session_id}] OK`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[${job.apb_session_id}] FAIL: ${msg}`);
    await api(`/api/public/v1/worker/jobs/${job.job_id}/result`, {
      outcome: "failure",
      error: msg.slice(0, 800),
      retryable: job.attempt < 2,
    }).catch(() => {});
  } finally {
    clearInterval(heartbeat);
    await page.close().catch(() => {});
  }
}

async function pollLoop() {
  while (true) {
    try {
      if (inFlight < CONCURRENCY) {
        const want = CONCURRENCY - inFlight;
        const { jobs } = (await api("/api/public/v1/worker/claim", { limit: want })) as { jobs: Job[] };
        for (const j of jobs) {
          inFlight++;
          runJob(j).finally(() => { inFlight--; });
        }
      }
    } catch (e) {
      console.error("poll error:", e instanceof Error ? e.message : e);
    }
    await new Promise(r => setTimeout(r, POLL_MS));
  }
}

console.log(`APB worker starting → ${BASE_URL}, concurrency=${CONCURRENCY}, headless=${HEADLESS}`);
pollLoop().catch(e => { console.error(e); process.exit(1); });
