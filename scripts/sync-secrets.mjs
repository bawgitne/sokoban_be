import { spawnSync } from "node:child_process";

const secrets = ["MONGODB_URI", "JWT_SECRET"];

for (const name of secrets) {
  const value = process.env[name];
  if (!value) {
    console.log(`Skipping ${name}: environment variable is not set in this build.`);
    continue;
  }

  const result = spawnSync("npx", ["wrangler", "secret", "put", name], {
    input: value,
    stdio: ["pipe", "inherit", "inherit"],
    shell: process.platform === "win32"
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
