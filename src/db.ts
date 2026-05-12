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
