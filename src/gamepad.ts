/**
 * Game controllers, read with the Gamepad API. A controller shows to the
 * page once one of its buttons is pressed. A button is named by its place
 * on the standard layout, e.g. "South" for the bottom face button, and the
 * screen shows it as the controller in use labels it: A, ✕ or B.
 */

/** The buttons in the order of the standard mapping. */
export const BUTTONS = [
  "South",
  "East",
  "West",
  "North",
  "LB",
  "RB",
  "LT",
  "RT",
  "View",
  "Menu",
  "LS",
  "RS",
  "Up",
  "Down",
  "Left",
  "Right",
  "Home",
] as const;

export type Button = (typeof BUTTONS)[number];

export type Direction = "left" | "right" | "up" | "down";

type Family = "xbox" | "playstation" | "nintendo";

const xbox: Record<Button, string> = {
  South: "A",
  East: "B",
  West: "X",
  North: "Y",
  LB: "LB",
  RB: "RB",
  LT: "LT",
  RT: "RT",
  View: "View",
  Menu: "Menu",
  LS: "LS",
  RS: "RS",
  Up: "▲",
  Down: "▼",
  Left: "◀",
  Right: "▶",
  Home: "Guide",
};

const labels: Record<Family, Record<Button, string>> = {
  xbox,
  playstation: {
    ...xbox,
    South: "✕",
    East: "○",
    West: "□",
    North: "△",
    LB: "L1",
    RB: "R1",
    LT: "L2",
    RT: "R2",
    View: "Share",
    Menu: "Options",
    LS: "L3",
    RS: "R3",
    Home: "PS",
  },
  // The bottom button of a Nintendo controller is B, its right one A.
  nintendo: {
    ...xbox,
    South: "B",
    East: "A",
    West: "Y",
    North: "X",
    LB: "L",
    RB: "R",
    LT: "ZL",
    RT: "ZR",
    View: "−",
    Menu: "+",
    Home: "Home",
  },
};

/** The controller last used, which decides the names of the buttons. */
let family: Family = "xbox";

function familyOf(pad: Gamepad): Family {
  if (/054c|sony|playstation|dualshock|dualsense/i.test(pad.id)) return "playstation";
  if (/057e|nintendo|pro controller|joy-con/i.test(pad.id)) return "nintendo";
  return "xbox";
}

export function isButton(name: string): name is Button {
  return (BUTTONS as readonly string[]).includes(name);
}

/** A button as the controller in use labels it, e.g. "A" or "✕". */
export function buttonName(button: string): string {
  return isButton(button) ? labels[family][button] : button;
}

/** Whether a button shows in a circle: the face buttons and the D-pad. */
export function isRound(button: string): boolean {
  return ["South", "East", "West", "North", "Up", "Down", "Left", "Right"].includes(button);
}

/** The names of the controllers connected, e.g. "Xbox Wireless Controller". */
export function controllers(): string[] {
  return pads().map((p) =>
    p.id
      .replace(/\s*\((?:STANDARD GAMEPAD|Vendor:)[^)]*\)\s*$/i, "")
      .replace(/^[0-9a-f]{1,4}-[0-9a-f]{1,4}-/i, "")
      .trim(),
  );
}

function pads(): Gamepad[] {
  return navigator.getGamepads?.().filter((p): p is Gamepad => !!p && p.connected) ?? [];
}

export interface PadEvents {
  /** A button or a stick was used; familyChanged when the controller is of another kind than the last one. */
  input(familyChanged: boolean): void;
  /** A button pressed, and again and again while it is held. */
  press(button: Button, repeat: boolean): void;
  /** The left stick pushed in a direction, and again while it is held. */
  move(direction: Direction, repeat: boolean): void;
  /** The right stick pushed up or down, by this many pixels. */
  scroll(dy: number): void;
  /** A controller was connected or disconnected. */
  change(): void;
}

/** How far a stick is pushed to count, from 0 to 1. */
const STICK = 0.5;
/** Below this a stick scrolls nothing, so that a stick at rest does not drift. */
const DEAD_ZONE = 0.2;
/** How long a button is held before it repeats, and how often it repeats then, in ms. */
const REPEAT_AFTER = 400;
const REPEAT_EVERY = 90;
/** How fast the right stick, pushed fully, scrolls, in pixels per ms. */
const SCROLL_SPEED = 1.4;

/** When the inputs held repeat next, by input. */
const held = new Map<string, number>();
let running = false;
let last = 0;

/** Starts reading the controllers, which go on as long as one is connected. */
export function startGamepads(events: PadEvents) {
  const start = () => {
    if (running) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(frame);
  };

  const frame = (now: number) => {
    const connected = pads();
    if (!connected.length) {
      running = false;
      held.clear();
      return;
    }
    const dt = Math.min(now - last, 100);
    last = now;

    // What is down on any controller, and the controller that has a new input.
    const down = new Map<string, Gamepad>();
    let scroll = 0;
    for (const pad of connected) {
      pad.buttons.forEach((b, i) => {
        const name = BUTTONS[i];
        if (name && (b.pressed || b.value > 0.5)) down.set(name, pad);
      });
      const [x = 0, y = 0, , ry = 0] = pad.axes;
      if (Math.max(Math.abs(x), Math.abs(y)) > STICK) {
        const direction: Direction = Math.abs(x) > Math.abs(y) ? (x > 0 ? "right" : "left") : y > 0 ? "down" : "up";
        down.set(`stick:${direction}`, pad);
      }
      if (Math.abs(ry) > DEAD_ZONE) scroll += Math.sign(ry) * ((Math.abs(ry) - DEAD_ZONE) / (1 - DEAD_ZONE)) * SCROLL_SPEED * dt;
    }

    for (const name of held.keys()) if (!down.has(name)) held.delete(name);
    for (const [name, pad] of down) {
      const next = held.get(name);
      if (next === undefined) {
        const was = family;
        family = familyOf(pad);
        events.input(was !== family);
        held.set(name, now + REPEAT_AFTER);
        emit(name, false);
      } else if (now >= next) {
        held.set(name, now + REPEAT_EVERY);
        emit(name, true);
      }
    }
    if (scroll) {
      events.input(false);
      events.scroll(scroll);
    }
    requestAnimationFrame(frame);
  };

  const emit = (name: string, repeat: boolean) => {
    if (name.startsWith("stick:")) events.move(name.slice(6) as Direction, repeat);
    else events.press(name as Button, repeat);
  };

  window.addEventListener("gamepadconnected", () => {
    start();
    events.change();
  });
  window.addEventListener("gamepaddisconnected", () => events.change());
  // A controller that was used before the page loaded.
  if (pads().length) start();
}
