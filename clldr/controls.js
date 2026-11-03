const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// Presentation-only controls; callbacks write parameter state, never DSP history.
export function knob(
  parent,
  {
    id,
    label,
    min,
    max,
    step = 0.01,
    unit = "",
    size = "small",
    log = false,
    onChange,
  },
) {
  const root = document.createElement("div");
  root.className = `control rotary ${size}`;
  root.innerHTML = `<label for="${id}">${label}</label><div class="knob-body"><svg viewBox="0 0 100 100" aria-hidden="true"><circle class="dial-track" cx="50" cy="50" r="42"/><circle class="dial-fill" cx="50" cy="50" r="42"/><circle class="dial-face" cx="50" cy="50" r="32"/><path class="dial-pointer" d="M50 24V32"/></svg><input class="knob-range" id="${id}" aria-label="${label}" type="range" min="${min}" max="${max}" step="any"></div><span class="knob-value"><input id="${id}-exact" aria-label="${label} exact value" type="number" min="${min}" max="${max}" step="any"><span>${unit}</span></span>`;
  parent.append(root);
  const range = root.querySelector(".knob-range"),
    editor = root.querySelector("input[type=number]"),
    body = root.querySelector(".knob-body"),
    pointer = root.querySelector(".dial-pointer"),
    fill = root.querySelector(".dial-fill");
  const normal = (v) =>
    log ? Math.log(v / min) / Math.log(max / min) : (v - min) / (max - min);
  const from = (n) => (log ? min * (max / min) ** n : min + n * (max - min));
  let value = min,
    drag = null;
  function set(v) {
    value = v;
    range.value = v;
    if (document.activeElement !== editor) editor.value = v;
    const n = clamp(normal(v), 0, 1);
    pointer.setAttribute("transform", `rotate(${-135 + 270 * n} 50 50)`);
    fill.style.strokeDasharray = `${197.92 * n} 263.9`;
    range.setAttribute("aria-valuetext", `${v} ${unit}`);
  }
  function commit(v) {
    if (!Number.isFinite(v)) {
      editor.value = value;
      return;
    }
    v = clamp(v, min, max);
    onChange(v);
    set(v);
    editor.value = v;
  }
  range.oninput = () => commit(Number(range.value));
  editor.onchange = () => {
    if (editor.value.trim() === "" || !Number.isFinite(editor.valueAsNumber)) {
      editor.value = value;
      return;
    }
    commit(editor.valueAsNumber);
  };
  editor.onkeydown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      editor.blur();
    }
  };
  body.onpointerdown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    range.focus();
    drag = { id: e.pointerId, y: e.clientY, n: normal(value) };
    body.setPointerCapture(e.pointerId);
  };
  body.onpointermove = (e) => {
    if (drag?.id !== e.pointerId) return;
    const n = clamp(
      drag.n + (drag.y - e.clientY) / (e.shiftKey ? 1800 : 180),
      0,
      1,
    );
    commit(from(n));
  };
  body.onpointerup =
    body.onpointercancel =
    body.onlostpointercapture =
      () => {
        drag = null;
      };
  range.onkeydown = (e) => {
    let n = normal(value);
    if (e.key === "Home") n = 0;
    else if (e.key === "End") n = 1;
    else if (["ArrowUp", "ArrowRight"].includes(e.key))
      n += e.shiftKey ? 0.001 : 0.01;
    else if (["ArrowDown", "ArrowLeft"].includes(e.key))
      n -= e.shiftKey ? 0.001 : 0.01;
    else if (e.key === "PageUp") n += 0.1;
    else if (e.key === "PageDown") n -= 0.1;
    else return;
    e.preventDefault();
    commit(from(clamp(n, 0, 1)));
  };
  return { element: root, set };
}
export function segments(parent, { id, label, choices, onChange }) {
  const group = document.createElement("div");
  group.id = id;
  group.className = "segments";
  group.setAttribute("role", "radiogroup");
  group.setAttribute("aria-label", label);
  const buttons = choices.map(([value, text]) => {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.value = value;
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", "false");
    b.textContent = text;
    b.onclick = () => onChange(value);
    group.append(b);
    return b;
  });
  group.onkeydown = (e) => {
    const current = buttons.indexOf(document.activeElement);
    if (current < 0) return;
    let index;
    if (e.key === "ArrowRight" || e.key === "ArrowDown")
      index = (current + 1) % buttons.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
      index = (current - 1 + buttons.length) % buttons.length;
    else if (e.key === "Home") index = 0;
    else if (e.key === "End") index = buttons.length - 1;
    else return;
    e.preventDefault();
    buttons[index].focus();
    onChange(choices[index][0]);
  };
  parent.append(group);
  return {
    element: group,
    set(value) {
      group.dataset.value = value;
      for (const b of buttons) {
        const checked = b.dataset.value === String(value);
        b.setAttribute("aria-checked", String(checked));
        b.tabIndex = checked ? 0 : -1;
      }
      if (!buttons.some((b) => b.dataset.value === String(value)))
        buttons[0].tabIndex = 0;
    },
  };
}
