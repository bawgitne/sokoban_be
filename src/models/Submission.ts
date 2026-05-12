import * as mongoose from "mongoose";

const { Schema } = mongoose;

const SubmissionSchema = new Schema({
  user_id: { type: Schema.Types.ObjectId, ref: "User" },
  user_name: { type: String, default: "Guest runner" },
  level_id: { type: String, required: true, index: true },
  time_ms: { type: Number, required: true },
  steps: { type: Number, required: true },
  replay_url: { type: String, required: true },
  created_at: { type: Date, default: Date.now }
});

SubmissionSchema.index({ level_id: 1, time_ms: 1, steps: 1 });

export const Submission = mongoose.models?.Submission ?? mongoose.model("Submission", SubmissionSchema);
