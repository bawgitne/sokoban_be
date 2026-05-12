import * as mongoose from "mongoose";

const { Schema } = mongoose;

const TournamentSchema = new Schema({
  name: { type: String, required: true },
  mode: { type: String, enum: ["solo", "team"], required: true },
  start_at: { type: Date, required: true },
  end_at: { type: Date, required: true },
  level_set: [{ type: String }]
});

export const Tournament = mongoose.models?.Tournament ?? mongoose.model("Tournament", TournamentSchema);
