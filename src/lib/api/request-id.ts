import { randomUUID } from "crypto";

export function newRequestId() {
  return `req_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
}
