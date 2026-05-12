import * as mongoose from "mongoose";

const { Schema } = mongoose;

const LevelSchema = new Schema({
  name: { type: String, required: true },
  difficulty: { type: String, required: true },
  author: { type: String, required: true },
  data_json: { type: Schema.Types.Mixed, required: true },
  is_official: { type: Boolean, default: false }
});

export const Level = mongoose.models?.Level ?? mongoose.model("Level", LevelSchema);
