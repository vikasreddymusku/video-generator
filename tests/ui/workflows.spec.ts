import { test, expect } from "@playwright/test";
test("dedicated pages, mixed source scheduling, detail views and queue actions", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Great content/ }),
  ).toBeVisible();
  await page.screenshot({
    path: ".verification/home-desktop.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Create your first video" }).click();
  await expect(
    page.getByRole("heading", { name: "Create video", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Paste one or more HTTPS URLs")
    .fill("https://example.com/course.md\nhttps://example.com/guide.pdf");
  await page.getByRole("button", { name: "Add URLs" }).click();
  await page.getByRole("tab", { name: /Upload Files/ }).click();
  await page.getByLabel("Upload source files").setInputFiles([
    {
      name: "browser-lesson.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("# Browser lesson\n\nA local Markdown lesson."),
    },
    {
      name: "browser-notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("A simple text lesson."),
    },
  ]);
  await page.getByRole("radio", { name: "Schedule", exact: true }).check();
  const future = new Date(Date.now() + 86400000);
  const local = new Date(future.getTime() - future.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
  await page.getByLabel(/Date and time/).fill(local);
  await page.screenshot({
    path: ".verification/create-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Schedule videos" }).click();
  await expect(
    page.getByRole("heading", { name: "4 jobs created" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Open queue" }).click();
  await expect(
    page.getByRole("heading", { name: /To generate/ }),
  ).toBeVisible();
  await expect(page.locator(".job-row")).toHaveCount(4);
  await page.screenshot({
    path: ".verification/queue-desktop.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Browser lesson", exact: true }).click();
  await page.getByRole("tab", { name: "Source", exact: true }).click();
  await expect(
    page.getByText("A local Markdown lesson.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Video Plan", exact: true }).click();
  await expect(
    page.getByText(
      "The structured video plan will appear after planning succeeds.",
    ),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Logs", exact: true }).click();
  await expect(
    page.getByText("Source accepted; awaiting generation."),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Overview", exact: true }).click();
  await page.screenshot({
    path: ".verification/detail-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Generate now", exact: true }).click();
  await expect(page.locator(".page-header .badge")).toHaveText("queued");
  await page.getByRole("link", { name: "Scheduler", exact: true }).click();
  await expect(page.locator(".job-row")).toHaveCount(3);
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Dashboard", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Completed Videos", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your library starts here" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(
    page.getByText("Offline verification mode prevents job execution."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start worker" }),
  ).toBeDisabled();
  await page.getByLabel("Concurrent job preparation").selectOption("2");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByRole("status")).toContainText("Settings saved");
  await page.reload();
  await expect(page.getByLabel("Concurrent job preparation")).toHaveValue("2");
  expect(errors).toEqual([]);
});
test("responsive navigation and upload validation on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Great content/ }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".verification/home-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page.getByRole("link", { name: "Create Video", exact: true }).click();
  await page.getByRole("tab", { name: /Upload Files/ }).click();
  await page.getByLabel("Upload source files").setInputFiles({
    name: "unsafe.exe",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("MZ"),
  });
  await expect(
    page.getByText("Unsupported type, empty file or over 20 MB"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Create video jobs" }).click();
  await expect(page.getByRole("alert")).toContainText("Remove invalid files");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".verification/create-mobile.png",
    fullPage: true,
  });
});

test("global branding settings preview locally and batch overrides are selectable", async ({
  page,
}) => {
  await page.goto("/settings/branding");
  await expect(
    page.getByRole("heading", { name: "Branding", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Sample video title").fill("AWS Data Engineering");
  await page.getByRole("button", { name: "Preview branding" }).click();
  await expect(page.getByText("AWS Data Engineering", { exact: true })).toBeVisible();
  await expect(page.getByText(/dynamic.*120 frames/i)).toBeVisible();
  await page.getByLabel("Brand name").fill("Tinitiate AI Solutions");
  await page.getByRole("button", { name: "Save branding" }).click();
  await expect(page.getByRole("status")).toContainText("Global video branding saved");
  await page.screenshot({
    path: ".verification/branding-desktop.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByRole("link", { name: "Video branding" }).click();
  await expect(page.getByLabel("Brand name")).toHaveValue("Tinitiate AI Solutions");
  await page.goto("/videos/new");
  await page.getByRole("combobox", { name: "Intro", exact: true }).selectOption("none");
  await page.getByRole("combobox", { name: "Outro", exact: true }).selectOption("uploaded");
  await expect(page.getByRole("combobox", { name: "Intro", exact: true })).toHaveValue("none");
  await expect(page.getByRole("combobox", { name: "Outro", exact: true })).toHaveValue("uploaded");
});

test("branding settings remain usable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/settings/branding");
  await expect(
    page.getByRole("heading", { name: "Branding", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Preview branding" }).click();
  await expect(page.getByText(/dynamic.*120 frames/i)).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".verification/branding-mobile.png",
    fullPage: true,
  });
});


test("hybrid input controls expose all six source combinations without invoking providers", async ({ page }) => {
  await page.goto("/videos/new");
  await page.getByRole("tab", { name: /Hybrid Inputs/ }).click();
  await expect(page.getByRole("combobox", { name: "Visual source", exact: true })).toHaveValue("AI");
  await expect(page.getByRole("combobox", { name: "Narration source", exact: true })).toHaveValue("AI_SCRIPT");

  const visual = page.getByRole("combobox", { name: "Visual source", exact: true });
  const narration = page.getByRole("combobox", { name: "Narration source", exact: true });
  const cases = [
    ["AI", "AI_SCRIPT"],
    ["AI", "USER_SCRIPT"],
    ["AI", "USER_AUDIO"],
    ["USER_VIDEO", "AI_SCRIPT"],
    ["USER_VIDEO", "USER_SCRIPT"],
    ["USER_VIDEO", "USER_AUDIO"],
  ] as const;

  for (const [visualSource, narrationSource] of cases) {
    await visual.selectOption(visualSource);
    await narration.selectOption(narrationSource);
    if (narrationSource === "USER_SCRIPT") {
      await expect(page.getByLabel("Exact narration / voiceover script")).toBeVisible();
    } else if (narrationSource === "USER_AUDIO") {
      await expect(page.getByLabel("Narration audio")).toBeVisible();
    }
    if (visualSource === "USER_VIDEO") {
      await expect(page.getByLabel("Existing video")).toBeVisible();
    }
  }
});
