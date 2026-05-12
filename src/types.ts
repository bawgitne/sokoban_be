export type Direction = "U" | "D" | "L" | "R";
export type Cell = "wall" | "floor" | "target";

export interface Env {
  MONGODB_URI?: string;
  JWT_SECRET?: string;
  ENVIRONMENT: string;
  LEADERBOARD_CACHE?: KVNamespace;
  SESSION_CACHE?: KVNamespace;
  REPLAYS?: R2Bucket;
  LEVELS?: R2Bucket;
  TOURNAMENT_ROOM?: DurableObjectNamespace;
}

export interface LevelData {
  id: string;
  name: string;
  difficulty: string;
  author: string;
  grid: string[];
}

export interface Point {
  x: number;
  y: number;
}
