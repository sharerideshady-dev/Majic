const crypto = require("crypto");
const config = require("../config");

const algorithm = "aes-256-gcm";

function decodeKey(rawKey) {
  const key = String(rawKey || "").trim();
  if (!key) {
    const error = new Error("ACCOUNT_ENCRYPTION_KEY is not configured");
    error.statusCode = 503;
    throw error;
  }

  if (/^[a-f0-9]{64}$/i.test(key)) {
    return Buffer.from(key, "hex");
  }

  const base64 = Buffer.from(key, "base64");
  if (base64.length === 32) return base64;

  const utf8 = Buffer.from(key, "utf8");
  if (utf8.length === 32) return utf8;

  const error = new Error(
    "ACCOUNT_ENCRYPTION_KEY must be 32 bytes, 64 hex characters, or base64 for 32 bytes"
  );
  error.statusCode = 503;
  throw error;
}

function encryptionReady() {
  try {
    decodeKey(config.accounts.encryptionKey);
    return true;
  } catch {
    return false;
  }
}

function encryptSecret(secret) {
  const key = decodeKey(config.accounts.encryptionKey);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(String(secret || ""), "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return {
    algorithm,
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    keyVersion: "v1",
  };
}

function decryptSecret(encrypted) {
  if (!encrypted?.ciphertext || !encrypted?.iv || !encrypted?.authTag) {
    const error = new Error("Stored password is missing encrypted fields");
    error.statusCode = 500;
    throw error;
  }

  const key = decodeKey(config.accounts.encryptionKey);
  const decipher = crypto.createDecipheriv(
    encrypted.algorithm || algorithm,
    key,
    Buffer.from(encrypted.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

module.exports = {
  decryptSecret,
  encryptSecret,
  encryptionReady,
};
