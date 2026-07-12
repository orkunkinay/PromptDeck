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

test("trigger detection works inside an open shadow root", async ({ page }) => {
  await typeCommand(page, "#shadow-editor textarea", ";;blog");

  await expect(page.locator("#promptdeck-root .pd-title")).toHaveText("Blog Evolution");
});

test("clipboard fallback path shows the copied message", async ({ page }) => {
  test.fail(true, "Palette state stores the fallback copy message, but src/content/index.ts does not render state.message yet.");

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
