import { getEnv } from "@/shared/request-context";

/** D1 binding used for device credentials, link index, and related auth tables. */
export const D1_BATCH_CHUNK = 100;

export function getD1(): D1Database {
  const db = getEnv().phygital_token;
  if (!db) {
    throw new Error("D1 binding phygital_token is not configured");
  }
  return db;
}
