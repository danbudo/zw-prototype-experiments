// Optional real-browser Stage A check, using the same environment as browser-smoke.mjs.
import assert from "node:assert/strict";
const { chromium } = await import(
  process.env.CLLDR_PLAYWRIGHT_MODULE || "playwright"
);
const browser = await chromium.launch({
  ...(process.env.CLLDR_CHROMIUM
    ? { executablePath: process.env.CLLDR_CHROMIUM }
    : {}),
  headless: true,
  args: ["--no-sandbox"],
});
try {
  const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(process.env.CLLDR_TEST_URL || "http://127.0.0.1:8000");
  assert.equal(await page.locator("select").count(), 0);
  assert.equal(await page.locator(".rotary.tuning").count(), 2);
  assert.equal(await page.locator(".source-bank .rotary").count(), 4);
  for (const id of ["advanced", "chaos"])
    assert.equal(await page.locator("#" + id).evaluate((e) => e.open), false);
  for (const selector of [
    "#osc-a",
    "#osc-b",
    "#collision-scope",
    "#collision",
    "#bank-a",
    "#bank-b",
  ]) {
    const b = await page.locator(selector).boundingBox();
    assert.ok(
      b.y >= 0 && b.y + b.height <= 900,
      `${selector} must be above the desktop fold`,
    );
  }
  assert.match(await page.locator("#note-name").textContent(), /A2.*110.0/);
  const exact = async (id, value) => {
    await page.locator("#" + id + "-exact").fill(String(value));
    await page.locator("#" + id + "-exact").press("Tab");
  };
  await exact("a-ratio", 1.0001);
  assert.equal(await page.locator("#a-ratio").inputValue(), "1.0001");
  await exact("a-ratio", 2);
  assert.match(await page.locator("#a-nominal").textContent(), /220.00/);
  await page.locator("#a-ratio").focus();
  await page.keyboard.press("ArrowUp");
  assert.ok(Number(await page.locator("#a-ratio-exact").inputValue()) > 2);
  const body = page.locator("#osc-b .knob-body"),
    box = await body.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y - 15);
  await page.mouse.up();
  assert.ok(Number(await page.locator("#b-ratio-exact").inputValue()) > 1.5);
  await page.locator("#a-wave [data-value=sine]").focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(
    await page.locator("#a-wave").getAttribute("data-value"),
    "triangle",
  );
  await exact("a-shape", 0.3);
  await exact("b-dc", -0.2);
  await page.locator("[data-preset=initialise]").click();
  await page.locator("#mode-drone").click();
  await page.locator("#audition-play").click();
  await page.waitForFunction(
    () =>
      Number(document.querySelector("#collision-scope").dataset.frames) > 10000,
  );
  assert.equal(
    await page.locator("#collision-scope").getAttribute("data-note"),
    "45",
  );
  assert.ok(
    Number(
      await page.locator("#collision-scope").getAttribute("data-window-ms"),
    ) > 20,
  );
  await page.screenshot({ path: "/tmp/clldr-stage-a-desktop.png" });
  for (const octave of [-2, -1, 0, 1, 2]) {
    await page.locator(`#root-octave [data-value="${octave}"]`).click();
    await page.waitForFunction(
      (n) =>
        Number(document.querySelector("#collision-scope").dataset.note) === n,
      45 + 12 * octave,
    );
    assert.match(
      await page.locator("#a-nominal").textContent(),
      new RegExp((110 * 2 ** octave).toFixed(2)),
    );
  }
  await page.locator("#audition-play").click();
  await page.locator("#advanced > summary").click();
  await exact("a-tracking", 0.5);
  assert.equal(
    await page.locator("#keyboard-tracking").getAttribute("data-value"),
    "custom",
  );
  assert.equal(await page.locator("#tracking-note").textContent(), "partial");
  await page.locator("#keyboard-tracking [data-value=both]").click();
  assert.equal(await page.locator("#a-tracking-exact").inputValue(), "1");
  await page.locator("#advanced > summary").click();
  await page.locator("[data-preset=initialise]").click();
  for (const [width, height] of [
    [1024, 768],
    [768, 1024],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `width ${width} fits`,
    );
    await page.locator("#collision-scope").scrollIntoViewIfNeeded();
    if (width === 390)
      await page.screenshot({
        path: "/tmp/clldr-stage-a-mobile.png",
        fullPage: true,
      });
  }
  assert.deepEqual(errors, []);
  console.log(
    "Stage A: above-fold desktop fascia, responsive layout, dial drag/keys/exact entry, waveform segments, octave audio telemetry, partial tracking and collapsed racks verified.",
  );
} finally {
  await browser.close();
}
