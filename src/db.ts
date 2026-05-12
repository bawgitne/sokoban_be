import { MongoClient, ServerApiVersion, type MongoClientOptions } from "mongodb";

export interface SubmissionDocument {
  user_id?: string;
  user_name: string;
  level_id: string;
  time_ms: number;
  steps: number;
  replay_url: string;
  replay?: string;
  created_at: Date;
}

export interface RoomPlayer {
  id: string;
  name: string;
  joined_at: Date;
}

export interface RoomResult {
  player_id: string;
  player_name: string;
  time_ms: number;
  steps: number;
  replay_url: string;
  replay?: string;
  submitted_at: Date;
}

export interface RoomDocument {
  code: string;
  mode: "solo" | "team";
  level_id: string;
  level: unknown;
  players: RoomPlayer[];
  results: RoomResult[];
  created_at: Date;
  updated_at: Date;
}

const options = {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: false,
    deprecationErrors: true
  },
  maxPoolSize: 1,
  serverSelectionTimeoutMS: 5000
} as MongoClientOptions;

export async function pingMongo(uri?: string) {
  return withDb(uri, (client) => client.db("sokorace").command({ ping: 1 }));
}

export async function insertSubmission(uri: string | undefined, submission: SubmissionDocument) {
  return withDb(uri, (client) => client.db("sokorace").collection<SubmissionDocument>("submissions").insertOne(submission));
}

export async function listSubmissions(uri: string | undefined, levelId: string) {
  return withDb(uri, (client) =>
    client
      .db("sokorace")
      .collection<SubmissionDocument>("submissions")
      .find({ level_id: levelId })
      .sort({ time_ms: 1, steps: 1, created_at: 1 })
      .limit(50)
      .toArray()
  );
}

export async function createRoom(uri: string | undefined, room: RoomDocument) {
  return withDb(uri, (client) => client.db("sokorace").collection<RoomDocument>("rooms").insertOne(room));
}

export async function getRoom(uri: string | undefined, code: string) {
  return withDb(uri, (client) => client.db("sokorace").collection<RoomDocument>("rooms").findOne({ code }));
}

export async function joinRoom(uri: string | undefined, code: string, player: RoomPlayer) {
  return withDb(uri, async (client) => {
    const rooms = client.db("sokorace").collection<RoomDocument>("rooms");
    await rooms.updateOne(
      { code, "players.id": { $ne: player.id } },
      { $push: { players: player }, $set: { updated_at: new Date() } }
    );
    return rooms.findOne({ code });
  });
}

export async function saveRoomResult(uri: string | undefined, code: string, result: RoomResult) {
  return withDb(uri, async (client) => {
    const rooms = client.db("sokorace").collection<RoomDocument>("rooms");
    await rooms.updateOne({ code }, { $pull: { results: { player_id: result.player_id } } });
    await rooms.updateOne(
      { code },
      { $push: { results: result }, $set: { updated_at: new Date() } }
    );
    return rooms.findOne({ code });
  });
}

async function withDb<T>(uri: string | undefined, operation: (client: MongoClient) => Promise<T>) {
  if (!uri) throw new Error("MONGODB_URI is not configured");
  const client = new MongoClient(uri, options);
  try {
    await client.connect();
    return await operation(client);
  } finally {
    await client.close();
  }
}
