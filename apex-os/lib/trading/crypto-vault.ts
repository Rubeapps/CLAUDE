import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Encriptação AES-256-GCM das chaves API dos bots.
 * BOT_ENCRYPTION_KEY: 32 bytes em hex (64 caracteres), só no servidor. Gera com: openssl rand -hex 32
 * Formato guardado: v1:<iv base64>:<authTag base64>:<ciphertext base64>
 */

function getKey(): Buffer {
  const hex = process.env.BOT_ENCRYPTION_KEY?.trim() ?? "";
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("BOT_ENCRYPTION_KEY em falta ou inválida (tem de ter 64 caracteres hex).");
  }
  return Buffer.from(hex, "hex");
}

export function isVaultConfigured(): boolean {
  return /^[0-9a-fA-F]{64}$/.test(process.env.BOT_ENCRYPTION_KEY?.trim() ?? "");
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}

export function decryptSecret(payload: string): string {
  const [version, ivB64, tagB64, dataB64] = payload.split(":");
  if (version !== "v1" || !ivB64 || !tagB64 || !dataB64) throw new Error("Formato de segredo encriptado inválido.");
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}
