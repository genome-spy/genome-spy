# Browser recording

Use `scripts/recordBrowserDemo.mjs` from this skill for a browser-based demo.
It uses Playwright installed in the caller's project and FFmpeg with the VP9
encoder (`libvpx-vp9`) plus `ffprobe` on `PATH`. Check these dependencies before
capture; reuse existing installations rather than adding project dependencies
just for a recording. Other recording tools remain suitable for desktop or
terminal demonstrations.

## Per-demo recipe

Run the recipe from the target project's directory so Playwright resolves there.
Replace the helper import path and application-specific steps with the real
paths and behavior. Start the application using its usual development workflow;
the recipe owns server startup and cleanup when needed.

```js
import { recordBrowserDemo } from "/path/to/attach-pr-recording/scripts/recordBrowserDemo.mjs";

const result = await recordBrowserDemo({
  url: "http://127.0.0.1:3000/",
  outputPath: "/tmp/pr-demo/details-panel.webm",
  async prepare(page) {
    await page.getByRole("button", { name: "Show details" }).waitFor();
  },
  async demonstrate({ page, moveTo, caption }) {
    await caption("Open the details panel");
    await page.waitForTimeout(1000);
    const button = page.getByRole("button", { name: "Show details" });
    const bounds = await button.boundingBox();
    const x = bounds.x + bounds.width / 2;
    const y = bounds.y + bounds.height / 2;
    await moveTo(x, y);
    await page.mouse.click(x, y);
    await page.getByRole("region", { name: "Details" }).waitFor();
    await page.waitForTimeout(1500);
  },
});
console.log(result);
```

The helper returns `videoPath`, `durationSeconds`, and three `previewPaths` from
near the start, middle, and end of the encoded video. It trims navigation and
preparation footage. Use a new output filename for another take; existing video
and preview files are not overwritten.

## Options and boundaries

- `prepare(page)` owns application-specific setup and readiness. Await actual
  data loading, layout, and relevant animations, not just navigation completion.
- `demonstrate({page, moveTo, caption})` defines the visible sequence and checks
  its outcome. It receives an ordinary Playwright page; use its locators, mouse,
  keyboard, and assertions as appropriate. Keep selectors and application APIs
  in this recipe rather than in the shared helper.
- `moveTo(x, y, durationMs = 500)` animates pointer movement. Use it for recorded
  movement; direct `page.mouse.move` calls can position the pointer during setup
  or deliberately reproduce abrupt motion. Prefer fresh element bounds or the
  application's layout API over guessed coordinates.
- `caption(text)` shows an optional bottom overlay; `caption("")` hides it.
  Check that captions do not cover the behavior or controls being demonstrated.
- `viewport` defaults to `{width: 1000, height: 650}` and sets the video size.
  `launchOptions` and `contextOptions` accept Playwright options; viewport and
  recording configuration are owned by the helper. Keep machine-specific GPU
  settings, authentication, and application configuration in the recipe.
- The overlay uses an arrow cursor. `clickIndicators: true` adds a brief ring at
  clicks; the default is `false`. Overlays do not intercept application input.
- Include short pauses around meaningful actions so a reviewer can follow the
  sequence. Wait for the actual outcome before changing captions or moving on.
  Some interfaces delay tooltips during pointer movement: approach slowly and
  verify that the tooltip becomes visible. Keep any specific hover timing in
  the recipe instead of making it a rule for other applications.

Inspect the preview images and play the video when timing or motion matters.
Check that the final WebM shows the actual revision and requested behavior, with
readable text and no startup footage. Upload is a separate action; the helper
has no GitHub integration and does not modify a PR.
