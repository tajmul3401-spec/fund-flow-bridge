// Server-only cryptography helpers for APB.
// AES-256-GCM encryption, HMAC signing, API key generation & hashing.
import { createHash, createHmac, randomBytes, createCipheriv, createDecipheriv, timingSafeEqual } from "crypto";

function getKey(): Buffer {
  const raw = process.env.APB_ENCRYPTION_KEY;
  if (!raw) throw new Error("APB_ENCRYPTION_KEY is not configured");
  // Accept base64 (44 chars) or hex (64 chars) or raw 32-byte utf8.
  let key: Buffer;
  if (/^[A-Fa-f0-9]{64}$/.test(raw)) key = Buffer.from(raw, "hex");
  else {
    try { key = Buffer.from(raw, "base64"); } catch { key = Buffer.from(raw, "utf8"); }
  }
  if (key.length !== 32) {
    // last resort: derive 32 bytes via SHA-256 of input
    key = createHash("sha256").update(raw).digest();
  }
  return key;
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${enc.toString("base64")}:${tag.toString("base64")}`;
}

export function decrypt(payload: string): string {
  if (!payload?.startsWith("v1:")) throw new Error("Invalid ciphertext");
  const [, ivB64, encB64, tagB64] = payload.split(":");
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const dec = Buffer.concat([decipher.update(Buffer.from(encB64, "base64")), decipher.final()]);
  return dec.toString("utf8");
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function hmacSha256Hex(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

// API key format: apb_<8 char prefix>_<32 char secret>
// We store: api_key_prefix = "apb_<prefix>"  (for fast lookup)
//           api_key_hash   = sha256(full key)
export function generateApiKey(): { plaintext: string; prefix: string; hash: string } {
  const prefix = randomBytes(4).toString("hex"); // 8 chars
  const secret = randomBytes(24).toString("base64url"); // ~32 chars
  const plaintext = `apb_${prefix}_${secret}`;
  return { plaintext, prefix: `apb_${prefix}`, hash: sha256Hex(plaintext) };
}

// Worker token format: wrk_<random48>
export function generateWorkerToken(): { plaintext: string; hash: string } {
  const plaintext = `wrk_${randomBytes(36).toString("base64url")}`;
  return { plaintext, hash: sha256Hex(plaintext) };
}

// HMAC secret for outbound webhooks (returned plaintext once)
export function generateHmacSecret(): string {
  return `whsec_${randomBytes(32).toString("base64url")}`;
}

// Short opaque callback token used in provider redirect URLs.
export function generateCallbackToken(): string {
  return randomBytes(24).toString("base64url");
}

export function generateSessionId(): string {
  return `aps_${randomBytes(16).toString("hex")}`;
}
