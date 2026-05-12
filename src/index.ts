import { createRoom, getRoom, insertSubmission, joinRoom, listSubmissions, pingMongo, saveRoomResult } from "./db";
import { validateReplay } from "./game/validator";
import { TournamentRoom } from "./durable_objects/TournamentRoom";
import type { Env, LevelData } from "./types";

export { TournamentRoom };

const jsonHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") return new Response(null, { headers: jsonHeaders });

    const url = new URL(request.url);
    try {
      if (url.pathname === "/health") return json({ ok: true, service: "sokorace-api" });
      if (url.pathname === "/db/ping") return pingDb(env);
      if (url.pathname === "/rooms" && request.method === "POST") return createRaceRoom(request, env);
      if (url.pathname.startsWith("/rooms/")) return handleRoomRequest(request, env, url);
      if (url.pathname === "/submit" && request.method === "POST") return submitRun(request, env);
      if (url.pathname.startsWith("/leaderboard/") && request.method === "GET") {
        return getLeaderboard(url.pathname.split("/").pop() ?? "", env);
      }
      if (url.pathname.startsWith("/tournament/")) {
        if (!env.TOURNAMENT_ROOM) return json({ error: "Tournament room binding is not configured" }, 503);
        const id = env.TOURNAMENT_ROOM.idFromName(url.pathname);
        return env.TOURNAMENT_ROOM.get(id).fetch(request);
      }
      return json({ error: "Not found" }, 404);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected error";
      return json({ error: message }, 500);
    }
  }
};

async function createRaceRoom(request: Request, env: Env) {
  if (!env.MONGODB_URI) return json({ error: "MONGODB_URI is not configured" }, 500);
  const body = await request.json<{
    playerId: string;
    playerName: string;
    level: LevelData;
    mode?: "solo" | "team";
  }>();
  if (!body.playerId || !body.playerName || !body.level?.id) return json({ error: "Invalid room payload" }, 400);

  const code = await createUniqueRoomCode(env);
  await createRoom(env.MONGODB_URI, {
    code,
    mode: body.mode ?? "solo",
    level_id: body.level.id,
    level: body.level,
    players: [{ id: body.playerId, name: cleanName(body.playerName), joined_at: new Date() }],
    results: [],
    created_at: new Date(),
    updated_at: new Date()
  });

  const room = await getRoom(env.MONGODB_URI, code);
  return json({ ok: true, room: publicRoom(room) }, 201);
}

async function handleRoomRequest(request: Request, env: Env, url: URL) {
  if (!env.MONGODB_URI) return json({ error: "MONGODB_URI is not configured" }, 500);
  const [, , rawCode, action] = url.pathname.split("/");
  const code = rawCode?.toUpperCase();
  if (!code) return json({ error: "Missing room code" }, 400);

  if (!action && request.method === "GET") {
    const room = await getRoom(env.MONGODB_URI, code);
    return room ? json({ ok: true, room: publicRoom(room) }) : json({ error: "Room not found" }, 404);
  }

  if (action === "join" && request.method === "POST") {
    const body = await request.json<{ playerId: string; playerName: string }>();
    if (!body.playerId || !body.playerName) return json({ error: "Invalid join payload" }, 400);
    const room = await joinRoom(env.MONGODB_URI, code, {
      id: body.playerId,
      name: cleanName(body.playerName),
      joined_at: new Date()
    });
    return room ? json({ ok: true, room: publicRoom(room) }) : json({ error: "Room not found" }, 404);
  }

  if (action === "submit" && request.method === "POST") {
    return submitRoomRun(request, env, code);
  }

  return json({ error: "Not found" }, 404);
}

async function submitRoomRun(request: Request, env: Env, code: string) {
  const room = await getRoom(env.MONGODB_URI, code);
  if (!room) return json({ error: "Room not found" }, 404);

  const body = await request.json<{
    playerId: string;
    playerName: string;
    replay: string;
    timeMs: number;
    steps: number;
  }>();
  if (!body.playerId || !body.playerName || !body.replay) return json({ error: "Invalid room submission payload" }, 400);

  const level = room.level as LevelData;
  const result = validateReplay(level, body.replay, body.timeMs, body.steps);
  if (!result.ok) return json({ error: result.reason, details: result }, 422);

  const replayKey = `rooms/${code}/${body.playerId}/${crypto.randomUUID()}.txt`;
  if (env.REPLAYS) {
    await env.REPLAYS.put(replayKey, body.replay, {
      httpMetadata: { contentType: "text/plain" }
    });
  }

  const updated = await saveRoomResult(env.MONGODB_URI, code, {
    player_id: body.playerId,
    player_name: cleanName(body.playerName),
    time_ms: result.timeMs,
    steps: result.steps,
    replay_url: replayKey,
    replay: env.REPLAYS ? undefined : body.replay,
    submitted_at: new Date()
  });

  return json({ ok: true, room: publicRoom(updated) });
}

async function submitRun(request: Request, env: Env) {
  const body = await request.json<{
    levelId: string;
    level: LevelData;
    replay: string;
    timeMs: number;
    steps: number;
    userName?: string;
  }>();

  if (!body.levelId || !body.level || !body.replay) return json({ error: "Invalid submission payload" }, 400);
  const result = validateReplay(body.level, body.replay, body.timeMs, body.steps);
  if (!result.ok) return json({ error: result.reason, details: result }, 422);

  const replayKey = `replays/${body.levelId}/${crypto.randomUUID()}.txt`;
  if (env.REPLAYS) {
    await env.REPLAYS.put(replayKey, body.replay, {
      httpMetadata: { contentType: "text/plain" }
    });
  }

  if (!env.MONGODB_URI) {
    return json({ ok: true, replayKey, result, persistence: "skipped: MONGODB_URI is not configured" }, 202);
  }

  await insertSubmission(env.MONGODB_URI, {
    user_name: body.userName ?? "Guest runner",
    level_id: body.levelId,
    time_ms: result.timeMs,
    steps: result.steps,
    replay_url: replayKey,
    replay: env.REPLAYS ? undefined : body.replay,
    created_at: new Date()
  });

  await env.LEADERBOARD_CACHE?.delete(cacheKey(body.levelId));
  return json({ ok: true, replayKey, result }, 201);
}

async function getLeaderboard(levelId: string, env: Env) {
  if (!levelId) return json({ error: "Missing level id" }, 400);
  const key = cacheKey(levelId);
  const cached = await env.LEADERBOARD_CACHE?.get(key);
  if (cached) return new Response(cached, { headers: jsonHeaders });

  if (!env.MONGODB_URI) {
    return json([]);
  }

  const rows = await listSubmissions(env.MONGODB_URI, levelId);

  const entries = rows.map((row: any, index: number) => ({
    rank: index + 1,
    userName: row.user_name,
    timeMs: row.time_ms,
    steps: row.steps,
    createdAt: row.created_at
  }));

  const payload = JSON.stringify(entries);
  await env.LEADERBOARD_CACHE?.put(key, payload, { expirationTtl: 60 });
  return new Response(payload, { headers: jsonHeaders });
}

async function pingDb(env: Env) {
  if (!env.MONGODB_URI) return json({ ok: false, error: "MONGODB_URI is not configured" }, 500);
  const result = await pingMongo(env.MONGODB_URI);
  return json({ ok: result.ok === 1, db: "sokorace" });
}

function cacheKey(levelId: string) {
  return `leaderboard:${levelId}`;
}

async function createUniqueRoomCode(env: Env) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    if (!env.MONGODB_URI || !(await getRoom(env.MONGODB_URI, code))) return code;
  }
  return crypto.randomUUID().slice(0, 6).toUpperCase();
}

function publicRoom(room: any) {
  if (!room) return null;
  const results = [...(room.results ?? [])].sort((a, b) => a.time_ms - b.time_ms || a.steps - b.steps);
  return {
    code: room.code,
    mode: room.mode,
    levelId: room.level_id,
    level: room.level,
    players: room.players ?? [],
    results,
    winner: results[0] ?? null,
    createdAt: room.created_at,
    updatedAt: room.updated_at
  };
}

function cleanName(name: string) {
  return name.trim().slice(0, 24) || "Guest runner";
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: jsonHeaders });
}
