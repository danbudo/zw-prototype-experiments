// Optional integration check. Requires Playwright; see EXPERIMENT.md for invocation.
import assert from "node:assert/strict";
const { chromium } = await import(
  process.env.CLLDR_PLAYWRIGHT_MODULE || "playwright"
);
const browser = await chromium.launch({
  ...(process.env.CLLDR_CHROMIUM
    ? { executablePath: process.env.CLLDR_CHROMIUM }
    : {}),
  headless: true,
  args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"],
});
try {
  const page = await browser.newPage({
      viewport: { width: 1440, height: 1150 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const Original = window.AudioContext;
    window.AudioContext = class extends Original {
      createAnalyser() {
        const a = super.createAnalyser();
        window.testAnalyser = a;
        return a;
      }
    };
  });
  await page.goto(process.env.CLLDR_TEST_URL || "http://127.0.0.1:8000");
  assert.equal(
    await page.locator("#legacy-audition").evaluate((el) => el.open),
    false,
  );
  assert.equal(
    await page
      .locator(".discovery-header")
      .evaluate(
        (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
      ),
    3,
  );
  await page.locator("#legacy-audition > summary").click();
  await page.locator("#lab-configurations > summary").click();
  await page.locator("#power").click();
  await page.waitForFunction(() =>
    document.querySelector("#power").textContent.includes("enabled"),
  );
  const range = async (id, value) =>
    page.locator("#" + id).evaluate((e, v) => {
      e.value = String(v);
      e.dispatchEvent(new Event("input", { bubbles: true }));
    }, value);
  async function download(selector) {
    const pending = page.waitForEvent("download");
    await page.locator(selector).click();
    const file = await pending;
    let text = "";
    for await (const chunk of await file.createReadStream()) text += chunk;
    return JSON.parse(text);
  }
  async function level() {
    return page.evaluate(() => {
      const d = new Float32Array(window.testAnalyser.fftSize);
      window.testAnalyser.getFloatTimeDomainData(d);
      return Math.max(...d.map(Math.abs));
    });
  }
  await page.locator('[data-preset="initialise"]').click();
  assert.equal(await page.locator("#feedback").inputValue(), "0");
  // Discovery: exact one-variable tests must reveal accidental confounds.
  const exact = async (id, value) => {
    await page.locator("#" + id).fill(String(value));
    await page.locator("#" + id).press("Tab");
  };
  await page.locator("#store").click();
  await page.locator("#slot-b").click();
  await exact("a-ratio-exact", 1.0001);
  assert.match(
    await page.locator("#comparison-summary").textContent(),
    /1 setting differ/,
  );
  assert.match(
    await page.locator("#comparison-diff").textContent(),
    /a.ratio: A = 1; B = 1.0001/,
  );
  assert.equal((await download("#save")).config.a.ratio, 1.0001);
  await exact("a-ratio-exact", "");
  assert.equal(await page.locator("#a-ratio-exact").inputValue(), "1.0001");
  await exact("a-detune-exact", 1000);
  assert.equal(await page.locator("#a-detune-exact").inputValue(), "100");
  await exact("collision-value", 0.125);
  assert.equal((await download("#save")).config.fm, 1.25);
  assert.match(
    await page.locator("#comparison-summary").textContent(),
    /3 settings differ/,
  );
  await exact("collision-value", 101);
  assert.equal(await page.locator("#collision-value").inputValue(), "100");
  await page.locator("#store").click();
  assert.match(
    await page.locator("#comparison-summary").textContent(),
    /settings identical/,
  );
  await page.locator('[data-preset="initialise"]').click();
  await page.locator("#store").click();
  await page.locator("#slot-a").click();
  console.log(
    "discovery: precise edits isolate one setting, invalid values restore/clamp, snapshot diffs reveal confounds",
  );
  await range("collision", 150);
  let oscillatorSettings;
  for (const coupling of ["original", "normalised", "pm"]) {
    await page.locator("#mechanism").selectOption(coupling);
    await page.locator("#clean-trigger").click();
    await page.waitForTimeout(120);
    assert.ok((await level()) > 0.001);
    await page.waitForFunction(
      (c) => document.querySelector("#collision-scope").dataset.coupling === c,
      coupling,
    );
    const packet = await download("#export-telemetry");
    assert.equal(packet.coupling, coupling);
    assert.equal(packet.fields.length, 12);
    assert.equal(packet.samples.length, packet.count * 12);
    assert.ok(packet.samples.every(Number.isFinite));
    const s = {
      a: packet.config.a,
      b: packet.config.b,
      note: packet.config.note,
    };
    if (oscillatorSettings) assert.deepEqual(s, oscillatorSettings);
    else oscillatorSettings = s;
    for (let i = 0; i < packet.count; i++) {
      const p = i * 12;
      assert.ok(
        Math.abs(
          packet.samples[p] * packet.samples[p + 1] - packet.samples[p + 10],
        ) < 1e-5,
      );
    }
    console.log(
      coupling,
      "audible, unchanged sources, valid synchronised telemetry",
    );
  }
  const first = Number(
    await page.locator("#collision-scope").getAttribute("data-frames"),
  );
  await page.waitForTimeout(800);
  assert.ok(
    Number(await page.locator("#collision-scope").getAttribute("data-frames")) >
      first + 10000,
  );
  console.log("telemetry pool continues beyond three packets");
  await page.locator("#hold").click();
  await page.locator(".scaling > summary").click();
  await range("curve", 2);
  await range("phaseRange", 0.12);
  await range("trim", -2);
  await range("auditionRate", 3);
  await page.locator("#sequence").check();
  await page.locator("#store").click();
  await page.locator("#mechanism").selectOption("original");
  await range("collision", 800);
  await page.locator("#slot-b").click();
  assert.equal(await page.locator("#mechanism").inputValue(), "pm");
  assert.equal(await page.locator("#collision").inputValue(), "150");
  assert.equal(await page.locator("#phaseRange").inputValue(), "0.12");
  assert.equal(await page.locator("#curve").inputValue(), "2");
  assert.equal(await page.locator("#trim").inputValue(), "-2");
  assert.equal(
    await page.locator("#hold").getAttribute("aria-pressed"),
    "true",
  );
  const saved = await download("#save");
  await page.locator("#file").setInputFiles({
    name: "roundtrip.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(saved)),
  });
  assert.match(await page.locator("#message").textContent(), /imported/);
  assert.deepEqual((await download("#save")).config, saved.config);
  console.log(
    "A/B and JSON preserve mechanism, depth, curve, ranges, trim and audition settings",
  );
  await page.locator('[data-preset="initialise"]').click();
  await range("auditionRate", 8);
  await page.locator("#sequence").check();
  await page.locator("#repeat").click();
  assert.equal(await page.locator("#pitch-lock").isDisabled(), true);
  const notes = new Set();
  for (let i = 0; i < 24; i++) {
    await page.waitForTimeout(45);
    const text = await page.locator("#telemetry-summary").textContent();
    notes.add(Number(text.match(/note (\d+)/)[1]));
  }
  for (const n of [57, 69, 45, 64])
    assert.ok(notes.has(n), `sequence note ${n}`);
  console.log("sample-clock sequence observed all four pitches");
  await page.locator("#drone").check();
  assert.equal(
    await page.locator("#repeat").getAttribute("aria-pressed"),
    "false",
  );
  assert.equal(await page.locator("#pitch-lock").isDisabled(), false);
  await page.waitForTimeout(800);
  assert.ok((await level()) > 0.001);
  await range("trim", -6);
  await page.waitForTimeout(500);
  await page.locator("#capture-level").click();
  await range("trim", 0);
  await page.waitForTimeout(500);
  await page.locator("#match-level").click();
  assert.ok(Number(await page.locator("#trim").inputValue()) < 0);
  console.log("drone and one-shot level matching work");
  const legacy = { ...saved.config };
  for (const key of [
    "coupling",
    "curve",
    "hzRange",
    "relativeRange",
    "phaseRange",
    "trim",
    "auditionRate",
    "auditionSequence",
  ])
    delete legacy[key];
  legacy.fm = 190;
  legacy.drone = false;
  await page.locator("#file").setInputFiles({
    name: "legacy.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ format: "clldr", version: 1, config: legacy }),
    ),
  });
  assert.equal(await page.locator("#mechanism").inputValue(), "original");
  assert.equal(await page.locator("#collision").inputValue(), "190");
  console.log("legacy v1 FM patch imports correctly");
  await page.locator('[data-preset="initialise"]').click();
  await page.locator("#mechanism").selectOption("normalised");
  await range("collision", 350);
  await page.locator("#hold").click();
  await page.waitForTimeout(250);
  await page.screenshot({
    path: "/tmp/clldr-experiment-desktop.png",
    fullPage: true,
  });
  await page.locator("#stop").click();
  await page.waitForTimeout(1000);
  assert.ok((await level()) < 0.0001);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page
      .locator(".discovery-header")
      .evaluate(
        (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
      ),
    1,
  );
  await page.screenshot({
    path: "/tmp/clldr-experiment-mobile.png",
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  assert.deepEqual(errors, []);
  console.log("stop reaches silence; mobile fits; no page errors");
} finally {
  await browser.close();
}
