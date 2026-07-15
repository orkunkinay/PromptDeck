import { test as base, chromium, expect, type BrowserContext, type Page } from "@playwright/test";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const extensionPath = join(repoRoot, "dist");
const fixturePath = join(repoRoot, "tests/e2e/fixtures/prompt-field.html");

interface WorkerFixtures {
  fixtureUrl: string;
}

interface TestFixtures {
  context: BrowserContext;
  page: Page;
}

const test = base.extend<TestFixtures, WorkerFixtures>({
  fixtureUrl: [
    async ({}, use) => {
      const html = await readFile(fixturePath);
      const server = createServer((request, response) => {
        const url = new URL(request.url || "/", "http://127.0.0.1");
        if (url.pathname === "/" || url.pathname === "/prompt-field.html") {
          response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
          response.end(html);
          return;
        }

        response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        response.end("Not found");
      });

      await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Could not start fixture server.");

      try {
        await use(`http://127.0.0.1:${address.port}/prompt-field.html`);
      } finally {
        await new Promise<void>((resolveClose, rejectClose) => {
          server.close((error?: Error) => (error ? rejectClose(error) : resolveClose()));
        });
      }
    },
    { scope: "worker" }
  ],

  context: async ({ fixtureUrl }, use) => {
    if (!existsSync(join(extensionPath, "manifest.json"))) {
      throw new Error("Missing dist/manifest.json. Run npm run build before npm run test:e2e.");
    }

    const userDataDir = await mkdtemp(join(tmpdir(), "promptdeck-e2e-"));
    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: "chromium",
      headless: true,
      permissions: ["clipboard-read", "clipboard-write"],
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        "--disable-dev-shm-usage"
      ]
    });

    try {
      const origin = new URL(fixtureUrl).origin;
      await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin });
      await use(context);
    } finally {
      await context.close();
      await rm(userDataDir, { recursive: true, force: true });
    }
  },

  page: async ({ context, fixtureUrl }, use) => {
    const page = await context.newPage();
    await page.goto(fixtureUrl);
    await page.waitForSelector("#promptdeck-root", { state: "attached" });
    await use(page);
    await page.close();
  }
});

function palette(page: Page) {
  return page.locator("#promptdeck-root .pd-root");
}

async function typeCommand(page: Page, selector: string, command: string): Promise<void> {
  await page.locator(selector).click();
  await page.keyboard.type(command);
  await expect(palette(page)).toBeVisible();
}

test("trigger detection opens the palette", async ({ page }) => {
  await typeCommand(page, "#prompt-input", ";;");

  await expect(page.locator("#promptdeck-root .pd-title")).toBeVisible();
  await expect(page.locator("#promptdeck-root .pd-count")).toContainText("1/5");
});

test("search narrows results", async ({ page }) => {
  await typeCommand(page, "#prompt-input", ";;blog");

  await expect(page.locator("#promptdeck-root .pd-title")).toHaveText("Blog Evolution");
  await expect(page.locator("#promptdeck-root .pd-count")).toHaveText("1/1");
});

test("Enter inserts the selected prompt into a textarea", async ({ page }) => {
  const input = page.locator("#prompt-input");
  await typeCommand(page, "#prompt-input", ";;blog");
  await page.keyboard.press("Enter");

  await expect(input).toHaveValue(/Use these notes to evolve a blog post/);
  await expect(input).not.toHaveValue(/;;blog/);
});

test("Enter inserts the selected prompt into a contenteditable div", async ({ page }) => {
  const editor = page.locator("#rich-editor");
  await typeCommand(page, "#rich-editor", ";;coding");
  await page.keyboard.press("Enter");

  await expect(editor).toContainText("Act as a senior engineer");
  await expect(editor).not.toContainText(";;coding");
});

test("trigger detection works after multi-paragraph content in a contenteditable", async ({ page }) => {
  const editor = page.locator("#multiblock-editor");
  await editor.click();
  // Place the caret at the very end of the pre-filled multi-block content so
  // the trigger sits behind the block-boundary newlines that innerText adds
  // but Range.toString() omits.
  await page.evaluate(() => {
    const element = document.getElementById("multiblock-editor");
    if (!element) return;
    element.focus();
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await page.keyboard.type(";;blog");

  await expect(palette(page)).toBeVisible();
  // The full "blog" query must survive the block-boundary offset. Without the
  // fix the caret offset lands short, the query is truncated, and the palette
  // either stays closed or shows unrelated recency results instead of 1/1.
  await expect(page.locator("#promptdeck-root .pd-title")).toHaveText("Blog Evolution");
  await expect(page.locator("#promptdeck-root .pd-count")).toHaveText("1/1");
});

test("trigger detection works inside an open shadow root", async ({ page }) => {
  await typeCommand(page, "#shadow-editor textarea", ";;blog");

  await expect(page.locator("#promptdeck-root .pd-title")).toHaveText("Blog Evolution");
});

test("opaque editors trigger globally and fall back to a visible clipboard message", async ({ page }) => {
  const editor = page.locator("#closed-shadow-editor");
  await editor.click();
  await page.keyboard.type(";;blog");

  await expect(page.locator("#promptdeck-root .pd-title")).toHaveText("Blog Evolution");
  await page.keyboard.press("Enter");

  await expect(page.locator("#promptdeck-root .pd-title")).toContainText(/Copied.+press/);
  await expect.poll(() => editor.evaluate((element) => (element as HTMLElement & { value: string }).value)).toBe(";;blog");
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("Use these notes to evolve a blog post");
  await page.waitForTimeout(250);
  await expect(page.locator("#promptdeck-root .pd-title")).toContainText(/Copied.+press/);
});

test("trigger detection works inside embedded editors", async ({ page }) => {
  const frame = page.frameLocator("#frame-editor");
  const input = frame.locator("#frame-input");
  await input.click();
  await page.keyboard.type(";;blog");

  await expect(frame.locator("#promptdeck-root .pd-title")).toHaveText("Blog Evolution");
});

test("clipboard fallback path shows the copied message", async ({ page }) => {
  const fallback = page.locator("#fallback-input");
  await typeCommand(page, "#fallback-input", ";;blog");
  await fallback.evaluate((element) => {
    const target = element as HTMLTextAreaElement;
    target.dataset.rejectDirect = "true";
    target.dataset.command = target.value;
  });
  await page.keyboard.press("Enter");

  await expect(palette(page)).toBeVisible();
  await expect(page.locator("#promptdeck-root .pd-title")).toContainText(/Copied.+press/);
});
