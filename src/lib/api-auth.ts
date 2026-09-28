import { timingSafeEqual } from "node:crypto";

export function isApiRequestAuthorized(request: Request): boolean {
  const configured = process.env.SECRET_FABRIC_API_TOKEN;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!configured || !supplied) return false;
  const expected = Buffer.from(configured, "utf8");
  const actual = Buffer.from(supplied, "utf8");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
