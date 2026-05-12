import type { Cell, Direction, LevelData, Point } from "../types";

const DELTAS: Record<Direction, Point> = {
  U: { x: 0, y: -1 },
  D: { x: 0, y: 1 },
  L: { x: -1, y: 0 },
  R: { x: 1, y: 0 }
};

interface ParsedAction {
  action: Direction | "W";
  at: number;
}

export interface ValidationResult {
  ok: boolean;
  reason?: string;
  steps: number;
  timeMs: number;
}

export function validateReplay(level: LevelData, replay: string, claimedTimeMs: number, claimedSteps: number): ValidationResult {
  const parsed = parseReplay(replay);
  if (!parsed.ok) return { ok: false, reason: parsed.reason, steps: 0, timeMs: 0 };

  const state = parseLevel(level);
  let lastAt = 0;
  let steps = 0;

  for (const entry of parsed.actions) {
    if (entry.at < lastAt) return { ok: false, reason: "Replay timestamps are not monotonic", steps, timeMs: lastAt };
    if (entry.at - lastAt < 25 && entry.action !== "W") return { ok: false, reason: "Actions are faster than human input threshold", steps, timeMs: entry.at };
    lastAt = entry.at;
    if (entry.action === "W") continue;

    const moved = applyMove(state, entry.action);
    if (!moved) return { ok: false, reason: "Replay contains an impossible move", steps, timeMs: lastAt };
    steps += 1;
  }

  if (!isSolved(state)) return { ok: false, reason: "Replay does not solve level", steps, timeMs: lastAt };
  if (steps !== claimedSteps) return { ok: false, reason: "Claimed steps do not match replay", steps, timeMs: lastAt };
  if (Math.abs(lastAt - claimedTimeMs) > 250) return { ok: false, reason: "Claimed time does not match replay", steps, timeMs: lastAt };

  return { ok: true, steps, timeMs: lastAt };
}

function parseReplay(replay: string): { ok: true; actions: ParsedAction[] } | { ok: false; reason: string } {
  if (!replay || replay.length > 100_000) return { ok: false, reason: "Replay is empty or too large" };
  const actions: ParsedAction[] = [];
  for (const token of replay.split(",")) {
    const [action, rawAt] = token.split(":");
    const at = Number(rawAt);
    if (!["U", "D", "L", "R", "W"].includes(action) || !Number.isFinite(at) || at < 0) {
      return { ok: false, reason: "Replay has malformed actions" };
    }
    actions.push({ action: action as ParsedAction["action"], at });
  }
  return { ok: true, actions };
}

function parseLevel(level: LevelData) {
  const boxes = new Set<string>();
  let player: Point = { x: 0, y: 0 };
  const grid: Cell[][] = level.grid.map((row, y) =>
    [...row].map((char, x): Cell => {
      if (char === "#") return "wall";
      if (char === "." || char === "*" || char === "+") return "target";
      if (char === "$" || char === "*") boxes.add(key({ x, y }));
      if (char === "@" || char === "+") player = { x, y };
      return "floor";
    })
  );
  return { grid, boxes, player };
}

function applyMove(state: ReturnType<typeof parseLevel>, direction: Direction) {
  const delta = DELTAS[direction];
  const next = { x: state.player.x + delta.x, y: state.player.y + delta.y };
  if (cellAt(state.grid, next) === "wall") return false;

  const nextKey = key(next);
  if (state.boxes.has(nextKey)) {
    const beyond = { x: next.x + delta.x, y: next.y + delta.y };
    if (cellAt(state.grid, beyond) === "wall" || state.boxes.has(key(beyond))) return false;
    state.boxes.delete(nextKey);
    state.boxes.add(key(beyond));
  }

  state.player = next;
  return true;
}

function isSolved(state: ReturnType<typeof parseLevel>) {
  return [...state.boxes].every((boxKey) => {
    const [x, y] = boxKey.split(":").map(Number);
    return cellAt(state.grid, { x, y }) === "target";
  });
}

function cellAt(grid: Cell[][], point: Point): Cell {
  return grid[point.y]?.[point.x] ?? "wall";
}

function key(point: Point) {
  return `${point.x}:${point.y}`;
}
