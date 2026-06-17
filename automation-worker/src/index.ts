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
  await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 20_000 });
  if (cfg.success_url_contains && page.url().includes(cfg.success_url_contains)) return;
  if (cfg.username_selector && cfg.password_selector && cfg.submit_selector) {
    await page.fill(cfg.username_selector, job.provider.username);
    await page.fill(cfg.password_selector, job.provider.password);
    await Promise.all([
      page.waitForLoadState("domcontentloaded"),
      page.click(cfg.submit_selector),
    ]);
  }
}

async function captureCheckoutUrl(page: Page, job: Job): Promise<string> {
  const cfg = job.provider.flow_config.add_funds ?? {};
  const addUrl = job.provider.base_url + (cfg.url_path ?? "/addfund");
  await page.goto(addUrl, { waitUntil: "domcontentloaded", timeout: 20_000 });

  if (cfg.amount_selector) await page.fill(cfg.amount_selector, String(job.amount));
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
    await page.waitForSelector(sel, { timeout: 10_000 });
    await Promise.all([
      page.waitForLoadState("domcontentloaded").catch(() => {}),
      page.click(sel),
    ]);
  }
  if (cfg.final_url_capture) {
    const el = await page.waitForSelector(cfg.final_url_capture, { timeout: 15_000 });
    const src = await el.getAttribute("src");
    if (src) return src;
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
