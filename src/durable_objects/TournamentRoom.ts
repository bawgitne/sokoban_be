import { validateReplay } from "../game/validator";
import type { LevelData } from "../types";

interface RoomPlayer {
  id: string;
  name: string;
  joined_at: string;
}

interface RoomResult {
  player_id: string;
  player_name: string;
  time_ms: number;
  steps: number;
  submitted_at: string;
}

interface RoomState {
  code: string;
  mode: "solo" | "team";
  level: LevelData;
  players: RoomPlayer[];
  results: RoomResult[];
  created_at: string;
  updated_at: string;
}

const jsonHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

export class TournamentRoom {
  private sessions = new Set<WebSocket>();

  constructor(private state: DurableObjectState) {}

  async fetch(request: Request) {
    if (request.method === "OPTIONS") return new Response(null, { headers: jsonHeaders });
    if (request.headers.get("Upgrade") === "websocket") return this.handleWebSocket();

    const url = new URL(request.url);
    if (url.pathname === "/init" && request.method === "POST") return this.initRoom(request);
    if (url.pathname === "/join" && request.method === "POST") return this.joinRoom(request);
    if (url.pathname === "/submit" && request.method === "POST") return this.submitRun(request);
    if (url.pathname === "/" && request.method === "GET") return this.getRoom();
    return json({ error: "Not found" }, 404);
  }

  private async initRoom(request: Request) {
    const body = await request.json<{
      code: string;
      playerId: string;
      playerName: string;
      level: LevelData;
      mode?: "solo" | "team";
    }>();
    if (!body.code || !body.playerId || !body.playerName || !body.level?.id) {
      return json({ error: "Invalid room payload" }, 400);
    }

    const now = new Date().toISOString();
    const existing = await this.state.storage.get<RoomState>("room");
    const room: RoomState = existing ?? {
      code: body.code,
      mode: body.mode ?? "solo",
      level: body.level,
      players: [],
      results: [],
      created_at: now,
      updated_at: now
    };
    upsertPlayer(room, { id: body.playerId, name: cleanName(body.playerName), joined_at: now });
    room.updated_at = now;
    await this.state.storage.put("room", room);
    this.broadcast(room);
    return json({ ok: true, room: publicRoom(room) }, 201);
  }

  private async joinRoom(request: Request) {
    const room = await this.state.storage.get<RoomState>("room");
    if (!room) return json({ error: "Room not found" }, 404);

    const body = await request.json<{ playerId: string; playerName: string }>();
    if (!body.playerId || !body.playerName) return json({ error: "Invalid join payload" }, 400);

    upsertPlayer(room, {
      id: body.playerId,
      name: cleanName(body.playerName),
      joined_at: new Date().toISOString()
    });
    room.updated_at = new Date().toISOString();
    await this.state.storage.put("room", room);
    this.broadcast(room);
    return json({ ok: true, room: publicRoom(room) });
  }

  private async submitRun(request: Request) {
    const room = await this.state.storage.get<RoomState>("room");
    if (!room) return json({ error: "Room not found" }, 404);

    const body = await request.json<{
      playerId: string;
      playerName: string;
      replay: string;
      timeMs: number;
      steps: number;
    }>();
    if (!body.playerId || !body.playerName || !body.replay) return json({ error: "Invalid room submission payload" }, 400);

    const result = validateReplay(room.level, body.replay, body.timeMs, body.steps);
    if (!result.ok) return json({ error: result.reason, details: result }, 422);

    room.results = room.results.filter((entry) => entry.player_id !== body.playerId);
    room.results.push({
      player_id: body.playerId,
      player_name: cleanName(body.playerName),
      time_ms: result.timeMs,
      steps: result.steps,
      submitted_at: new Date().toISOString()
    });
    room.updated_at = new Date().toISOString();
    await this.state.storage.put("room", room);
    this.broadcast(room);
    return json({ ok: true, room: publicRoom(room) });
  }

  private async getRoom() {
    const room = await this.state.storage.get<RoomState>("room");
    return room ? json({ ok: true, room: publicRoom(room) }) : json({ error: "Room not found" }, 404);
  }

  private handleWebSocket() {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    this.sessions.add(server);
    server.send(JSON.stringify({ type: "room_ready", at: Date.now() }));

    const close = () => this.sessions.delete(server);
    server.addEventListener("close", close);
    server.addEventListener("error", close);
    return new Response(null, { status: 101, webSocket: client });
  }

  private broadcast(room: RoomState) {
    const payload = JSON.stringify({ type: "room_update", room: publicRoom(room) });
    for (const session of this.sessions) {
      if (session.readyState === WebSocket.OPEN) session.send(payload);
    }
  }
}

function upsertPlayer(room: RoomState, player: RoomPlayer) {
  const existing = room.players.find((entry) => entry.id === player.id);
  if (existing) {
    existing.name = player.name;
    return;
  }
  room.players.push(player);
}

function publicRoom(room: RoomState) {
  const results = [...room.results].sort((a, b) => a.time_ms - b.time_ms || a.steps - b.steps);
  return {
    code: room.code,
    mode: room.mode,
    levelId: room.level.id,
    level: room.level,
    players: room.players,
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
