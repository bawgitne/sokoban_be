import * as mongoose from "mongoose";

const { Schema } = mongoose;

const UserSchema = new Schema({
  name: { type: String, required: true },
  avatar: String,
  country: String,
  join_date: { type: Date, default: Date.now }
});

export const User = mongoose.models?.User ?? mongoose.model("User", UserSchema);
