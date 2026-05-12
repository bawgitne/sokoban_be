import * as mongoose from "mongoose";

const { Schema } = mongoose;

const TeamSchema = new Schema({
  name: { type: String, required: true },
  members: [{ type: Schema.Types.ObjectId, ref: "User" }]
});

export const Team = mongoose.models?.Team ?? mongoose.model("Team", TeamSchema);
