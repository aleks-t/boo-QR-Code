import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { createHash, timingSafeEqual } from "node:crypto";
import { db } from "./db";
import { AppError } from "./domain";
const cookieName = "partbook_session";
function key() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32)
    throw new AppError(
      "The session secret needs to be configured before signing in.",
      503,
    );
  return new TextEncoder().encode(secret);
}
export async function getUser() {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), {
      algorithms: ["HS256"],
    });
    return payload.sub
      ? await db.user.findUnique({ where: { id: payload.sub } })
      : null;
  } catch {
    return null;
  }
}
export async function requireUser() {
  const user = await getUser();
  if (!user) throw new AppError("Please sign in to continue.", 401);
  return user;
}
export async function signIn(id: string) {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(id)
    .setIssuedAt()
    .setExpirationTime("180d")
    .sign(key());
  (await cookies()).set(cookieName, token, {
    httpOnly: true,
    secure:
      process.env.APP_URL?.startsWith("https://") ??
      process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 180 * 86400,
    path: "/",
  });
}
export async function signOut() {
  (await cookies()).delete(cookieName);
}
export function checkCode(code: string) {
  if (!process.env.ACCESS_CODE)
    throw new AppError(
      "The shared access code has not been configured yet.",
      503,
    );
  return timingSafeEqual(
    createHash("sha256").update(code).digest(),
    createHash("sha256").update(process.env.ACCESS_CODE).digest(),
  );
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = new URL(process.env.APP_URL || request.url).origin;
  if (origin && origin !== expected)
    throw new AppError("Please reload the app and try again.", 403);
  if (request.headers.get("sec-fetch-site") === "cross-site")
    throw new AppError("Please open this action in Partbook.", 403);
}
