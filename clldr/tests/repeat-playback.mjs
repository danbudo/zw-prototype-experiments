// Real-browser regression for Repeat during asynchronous audio initialisation.
// Same optional Playwright/Chromium environment variables as browser-smoke.mjs.
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
async function open() {
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  await page.addInitScript(() => {
    const probe = (window.repeatProbe = {
      commands: [],
      telemetry: [],
      audio: [],
      errors: [],
    });
    const gate = new Promise((resolve) => (probe.releaseModule = resolve));
    const Context = window.AudioContext,
      Node = window.AudioWorkletNode;
    window.AudioContext = class extends Context {
      constructor(...args) {
        super(...args);
        probe.context = this;
        const add = this.audioWorklet.addModule.bind(this.audioWorklet);
        this.audioWorklet.addModule = async (...args) => {
          probe.moduleWaiting = true;
          await gate;
          await add(...args);
          // A silent test-only tap measures actual engine output on the audio clock.
          const source = `registerProcessor('repeat-test-capture',class extends AudioWorkletProcessor {
       constructor(){super();this.count=0;this.energy=0;this.peak=0;}
       process(inputs,outputs){const input=inputs[0]?.[0];if(input)for(let i=0;i<input.length;i++){
         const v=input[i];this.energy+=v*v;this.peak=Math.max(this.peak,Math.abs(v));this.count++;
         if(this.count>=sampleRate*.01){this.port.postMessage({time:(currentFrame+i+1)/sampleRate,peak:this.peak,rms:Math.sqrt(this.energy/this.count)});this.count=0;this.energy=0;this.peak=0;}
       }for(const ch of outputs[0])ch.fill(0);return true;}
     });`;
          const url = URL.createObjectURL(
            new Blob([source], { type: "text/javascript" }),
          );
          try {
            await add(url);
          } finally {
            URL.revokeObjectURL(url);
          }
        };
      }
    };
    window.AudioWorkletNode = class extends Node {
      constructor(context, ...args) {
        super(context, ...args);
        const send = this.port.postMessage.bind(this.port);
        this.port.postMessage = (data, ...rest) => {
          if (data.type !== "recycle")
            probe.commands.push({
              type: data.type,
              value: data.type === "config" ? undefined : data.value,
            });
          return send(data, ...rest);
        };
        this.port.addEventListener("message", ({ data }) => {
          if (data.type === "telemetry")
            probe.telemetry.push({
              note: data.note,
              time: context.currentTime,
              endFrame: data.endFrame,
            });
        });
        this.addEventListener("processorerror", () =>
          probe.errors.push("processorerror"),
        );
        const capture = new Node(context, "repeat-test-capture", {
          outputChannelCount: [1],
        });
        capture.port.onmessage = ({ data }) => probe.audio.push(data);
        this.connect(capture);
        capture.connect(context.destination);
      }
    };
  });
  await page.goto(process.env.CLLDR_TEST_URL || "http://127.0.0.1:8000");
  await page.locator("#advanced > summary").click();
  await page.locator("#legacy-audition > summary").click();
  return page;
}
const range = (page, id, value) =>
  page.locator("#" + id).evaluate((el, v) => {
    el.value = String(v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
const release = async (page) => {
  await page.evaluate(() => window.repeatProbe.releaseModule());
  await page.waitForFunction(() =>
    document.querySelector("#power").textContent.includes("enabled"),
  );
};
async function assertSilent(page) {
  // Initialise has a 700 ms release; inspect a later quiet window, not its tail.
  await page.waitForTimeout(1400);
  const tail = await page.evaluate(() => window.repeatProbe.audio.slice(-30));
  assert.ok(tail.length > 10, "audio clock must keep processing");
  assert.ok(
    tail.every((x) => x.peak < 1e-6),
    "stopped playback must remain silent beyond the next scheduled onset",
  );
}
try {
  const p = await open();
  await p.locator("#power").click();
  await p.waitForFunction(() => window.repeatProbe.moduleWaiting);
  await p.locator('[data-preset="initialise"]').click();
  await p.locator("#repeat").click();
  await release(p);
  await p.waitForTimeout(650);
  const start = await p.evaluate(() => ({
    pressed: document.querySelector("#repeat").getAttribute("aria-pressed"),
    sent: window.repeatProbe.commands.some(
      (x) => x.type === "audition" && x.value === true,
    ),
    audio: window.repeatProbe.audio,
    packets: window.repeatProbe.telemetry.length,
  }));
  assert.equal(start.pressed, "true");
  assert.ok(
    start.sent,
    "Repeat must reach the worklet after audio loading; highlighting the button is not enough",
  );
  assert.ok(start.packets > 3);
  assert.ok(
    start.audio.some((x) => x.peak > 0.01),
    "Repeat after Initialise must generate final audio",
  );
  console.log(
    "Startup race: active button, delivered command, processing worklet and nonzero final audio verified",
  );
  await p.locator("#repeat").click();
  await assertSilent(p);
  assert.equal(
    await p.locator("#repeat").getAttribute("aria-pressed"),
    "false",
  );
  await range(p, "decay", 0.08);
  await range(p, "sustain", 0);
  await range(p, "release", 0.03);
  await range(p, "auditionRate", 2);
  await p.evaluate(() => (window.repeatProbe.audio = []));
  await p.locator("#repeat").click();
  await p.waitForTimeout(1750);
  const audio = await p.evaluate(() => window.repeatProbe.audio);
  const onsets = [];
  let sounding = false;
  for (const frame of audio) {
    const active = frame.peak > 0.005;
    if (active && !sounding) onsets.push(frame.time);
    sounding = active;
  }
  assert.ok(
    onsets.length >= 3,
    "percussive playback must retrigger audibly, not merely sustain one note",
  );
  for (let i = 1; i < onsets.length; i++)
    assert.ok(
      Math.abs(onsets[i] - onsets[i - 1] - 0.5) < 0.04,
      "audible onsets must follow the selected 2 Hz rate",
    );
  console.log(
    "Percussive output: repeated attacks and quiet gaps at 2 Hz verified",
  );
  await p.locator("#repeat").click();
  await assertSilent(p);
  await range(p, "auditionRate", 4);
  await p.locator("#sequence").check();
  await p.evaluate(() => {
    window.repeatProbe.audio = [];
    window.repeatProbe.telemetry = [];
  });
  await p.locator("#repeat").click();
  await p.waitForTimeout(1300);
  const sequence = await p.evaluate(() => ({
    audio: window.repeatProbe.audio,
    notes: window.repeatProbe.telemetry,
  }));
  for (const note of [45, 57, 33, 52])
    assert.ok(
      sequence.notes.some(
        (packet) =>
          packet.note === note &&
          sequence.audio.some(
            (frame) =>
              Math.abs(frame.time - packet.time) < 0.06 && frame.peak > 0.005,
          ),
      ),
      `sequence pitch ${note} must be scheduled with an audible output burst`,
    );
  console.log(
    "Sequence: all four pitches paired with audible percussive output",
  );
  // Repeat-off must not depend on successfully resuming an interrupted context.
  await p.evaluate(() => {
    window.repeatProbe.context.resume = () => new Promise(() => {});
  });
  await p.locator("#repeat").click();
  await p.waitForTimeout(50);
  assert.equal(
    await p.locator("#repeat").getAttribute("aria-pressed"),
    "false",
  );
  await assertSilent(p);
  await p.locator('[data-preset="initialise"]').click();
  await range(p, "release", 0.03);
  await p.evaluate(() => (window.repeatProbe.audio = []));
  await p.locator("#trigger").click();
  await p.waitForTimeout(120);
  assert.ok(
    await p.evaluate(() => window.repeatProbe.audio.some((x) => x.peak > 0.01)),
    "Strike must sound in the same session",
  );
  await p.locator("#repeat").click();
  await p.waitForTimeout(750);
  assert.equal(await p.locator("#repeat").getAttribute("aria-pressed"), "true");
  assert.ok(
    await p.evaluate(() =>
      window.repeatProbe.audio.slice(-20).some((x) => x.peak > 0.01),
    ),
    "Repeat must continue after the old Strike timeout",
  );
  await p.locator("#stop").click();
  await assertSilent(p);
  await p.evaluate(() => (window.repeatProbe.audio = []));
  await p.locator("#drone").check();
  await p.waitForTimeout(200);
  assert.ok(
    await p.evaluate(() => window.repeatProbe.audio.some((x) => x.peak > 0.01)),
    "Drone must sound in the same session",
  );
  await p.locator("#repeat").click();
  await p.waitForTimeout(750);
  assert.equal(await p.locator("#drone").isChecked(), false);
  assert.equal(await p.locator("#repeat").getAttribute("aria-pressed"), "true");
  assert.ok(
    await p.evaluate(() =>
      window.repeatProbe.audio.slice(-20).some((x) => x.peak > 0.01),
    ),
    "Drone to Repeat must produce audio",
  );
  await p.locator("#stop").click();
  await assertSilent(p);
  console.log(
    "Strike → Repeat and Drone → Repeat work without redundant resume calls",
  );
  assert.deepEqual(await p.evaluate(() => window.repeatProbe.errors), []);
  await p.close();
  const cancelled = await open();
  await cancelled.locator("#power").click();
  await cancelled.waitForFunction(() => window.repeatProbe.moduleWaiting);
  await cancelled.locator('[data-preset="initialise"]').click();
  await cancelled.locator("#repeat").click();
  await cancelled.locator("#stop").click();
  await release(cancelled);
  await assertSilent(cancelled);
  assert.equal(
    await cancelled.locator("#repeat").getAttribute("aria-pressed"),
    "false",
  );
  assert.equal(
    await cancelled.evaluate(() =>
      window.repeatProbe.commands.some(
        (x) => x.type === "audition" && x.value === true,
      ),
    ),
    false,
  );
  await cancelled.close();
  console.log(
    "Stop cancels Repeat while audio is loading; no deferred start escapes cancellation",
  );
  const direct = await open();
  await direct.locator('[data-preset="initialise"]').click();
  await direct.locator("#repeat").click();
  await direct.waitForFunction(() => window.repeatProbe.moduleWaiting);
  await release(direct);
  await direct.waitForTimeout(200);
  assert.equal(
    await direct.locator("#repeat").getAttribute("aria-pressed"),
    "true",
  );
  assert.ok(
    await direct.evaluate(() =>
      window.repeatProbe.audio.some((x) => x.peak > 0.01),
    ),
  );
  await direct.locator("#stop").click();
  await assertSilent(direct);
  await direct.close();
  console.log(
    "Repeat also starts audio directly; Stop cancels active playback reliably",
  );
  // Authorised discovery transport: actual clean press/release and Play/Stop.
  const lab = await open();
  await lab.locator("#legacy-audition > summary").click();
  await lab.locator('[data-preset="initialise"]').click();
  await lab.locator("#momentary-trigger").scrollIntoViewIfNeeded();
  const trigger = lab.locator("#momentary-trigger"),
    box = await trigger.boundingBox();
  await lab.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await lab.mouse.down();
  await lab.waitForFunction(() => window.repeatProbe.moduleWaiting);
  await release(lab);
  await lab.waitForTimeout(350);
  assert.equal(await trigger.getAttribute("aria-pressed"), "true");
  assert.ok(
    await lab.evaluate(() =>
      window.repeatProbe.commands.some(
        (x) => x.type === "clean-on" && x.value.sustain === true,
      ),
    ),
  );
  assert.ok(
    await lab.evaluate(() =>
      window.repeatProbe.audio.slice(-10).some((x) => x.peak > 0.01),
    ),
    "held Trigger must sound beyond the old 180 ms pulse",
  );
  await lab.mouse.move(2, 2);
  await lab.mouse.up();
  assert.equal(await trigger.getAttribute("aria-pressed"), "false");
  await assertSilent(lab);
  await trigger.focus();
  await lab.keyboard.down("Space");
  await lab.waitForTimeout(250);
  assert.equal(await trigger.getAttribute("aria-pressed"), "true");
  await lab.keyboard.up("Space");
  await assertSilent(lab);
  await trigger.focus();
  await lab.keyboard.down("Enter");
  await lab.waitForTimeout(100);
  await lab.locator("#note").focus();
  await lab.keyboard.up("Enter");
  assert.equal(await trigger.getAttribute("aria-pressed"), "false");
  await assertSilent(lab);
  console.log(
    "new Trigger: clean held audio, pointer release outside, keyboard release and blur cancellation verified",
  );
  await range(lab, "attack", 0.002);
  await range(lab, "decay", 0.08);
  await range(lab, "sustain", 0);
  await range(lab, "release", 0.04);
  await range(lab, "auditionRate", 2);
  await lab.evaluate(() => (window.repeatProbe.audio = []));
  await lab.locator("#audition-play").click();
  await lab.waitForTimeout(1750);
  assert.equal(await lab.locator("#audition-play").textContent(), "Stop");
  const playing = await lab.evaluate(() => window.repeatProbe.audio);
  const attacks = [];
  let was = false;
  for (const frame of playing) {
    const active = frame.peak > 0.005;
    if (active && !was) attacks.push(frame.time);
    was = active;
  }
  assert.ok(attacks.length >= 3);
  for (let i = 1; i < attacks.length; i++)
    assert.ok(Math.abs(attacks[i] - attacks[i - 1] - 0.5) < 0.04);
  await range(lab, "auditionRate", 4);
  await lab.locator("#sequence").check();
  await lab.evaluate(() => {
    window.repeatProbe.audio = [];
    window.repeatProbe.telemetry = [];
  });
  await lab.waitForTimeout(1400);
  const melody = await lab.evaluate(() => ({
    audio: window.repeatProbe.audio,
    notes: window.repeatProbe.telemetry,
  }));
  for (const note of [45, 57, 33, 52])
    assert.ok(
      melody.notes.some(
        (packet) =>
          packet.note === note &&
          melody.audio.some(
            (frame) =>
              Math.abs(frame.time - packet.time) < 0.06 && frame.peak > 0.005,
          ),
      ),
    );
  await lab.locator("#mode-drone").click();
  assert.equal(await lab.locator("#audition-play").textContent(), "Play");
  assert.equal(
    await lab.locator("#mode-drone").getAttribute("aria-pressed"),
    "true",
  );
  await assertSilent(lab);
  await lab.locator('[data-preset="initialise"]').click();
  await range(lab, "release", 0.04);
  await lab.locator("#audition-play").click();
  await lab.waitForTimeout(300);
  assert.equal(await lab.locator("#audition-play").textContent(), "Stop");
  assert.ok(
    await lab.evaluate(() =>
      window.repeatProbe.audio.slice(-10).some((x) => x.peak > 0.01),
    ),
  );
  await range(lab, "release", 8);
  await lab.locator("#audition-play").click();
  await lab.evaluate(() => (window.repeatProbe.commands = []));
  await lab.locator("#audition-play").click();
  await lab.waitForTimeout(50);
  assert.ok(
    await lab.evaluate(() =>
      window.repeatProbe.commands.some((x) => x.type === "on"),
    ),
    "Drone Play must start a note during a previous long release",
  );
  await range(lab, "release", 0.04);
  await lab.locator("#audition-play").click();
  assert.equal(await lab.locator("#audition-play").textContent(), "Play");
  await assertSilent(lab);
  await lab.close();
  console.log(
    "new header: Sequence timing, four Melody pitches, stop-before-mode-change and Drone Play/Stop verified",
  );
  const pending = await open();
  await pending.locator("#legacy-audition > summary").click();
  await pending.locator('[data-preset="initialise"]').click();
  await pending.locator("#audition-play").click();
  await pending.waitForFunction(() => window.repeatProbe.moduleWaiting);
  assert.equal(await pending.locator("#audition-play").textContent(), "Stop");
  await pending.locator("#audition-play").click();
  await release(pending);
  await assertSilent(pending);
  assert.equal(
    await pending.evaluate(() =>
      window.repeatProbe.commands.some(
        (x) => x.type === "audition" && x.value === true,
      ),
    ),
    false,
  );
  await pending.close();
  const lifted = await open();
  await lifted.locator("#legacy-audition > summary").click();
  await lifted.locator("#momentary-trigger").scrollIntoViewIfNeeded();
  const early = await lifted.locator("#momentary-trigger").boundingBox();
  await lifted.mouse.move(
    early.x + early.width / 2,
    early.y + early.height / 2,
  );
  await lifted.mouse.down();
  await lifted.waitForFunction(() => window.repeatProbe.moduleWaiting);
  await lifted.mouse.up();
  await release(lifted);
  await assertSilent(lifted);
  assert.equal(
    await lifted.evaluate(() =>
      window.repeatProbe.commands.some((x) => x.type === "clean-on"),
    ),
    false,
  );
  await lifted.close();
  console.log(
    "new header: pending Play and early Trigger release cannot escape audio-loading cancellation",
  );
} finally {
  await browser.close();
}
