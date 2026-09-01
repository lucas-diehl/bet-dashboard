import type { Config } from "drizzle-kit";
import { loadEnv } from "./src/env";

loadEnv();
const url = process.env.DATABASE_URL ?? "";
const withSsl = url && !/sslmode=/.test(url) && !/localhost|127\.0\.0\.1/.test(url) ? url + (url.includes("?") ? "&" : "?") + "sslmode=require" : url;

export default {
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: withSsl },
} satisfies Config;
