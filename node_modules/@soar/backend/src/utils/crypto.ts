import CryptoJS from 'crypto-js';

function getKey(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error('ENCRYPTION_KEY environment variable tanımlı değil');
  return key;
}

/**
 * API key'i AES-256 ile şifreler.
 * Veritabanında düz metin saklanmaz.
 */
export function encryptApiKey(plaintext: string): string {
  return CryptoJS.AES.encrypt(plaintext, getKey()).toString();
}

/**
 * Şifrelenmiş API key'i çözer.
 */
export function decryptApiKey(ciphertext: string): string {
  const bytes = CryptoJS.AES.decrypt(ciphertext, getKey());
  return bytes.toString(CryptoJS.enc.Utf8);
}

/**
 * JWT refresh token için SHA-256 hash (veritabanında sadece hash saklanır).
 */
export function hashToken(token: string): string {
  return CryptoJS.SHA256(token).toString(CryptoJS.enc.Hex);
}

/**
 * Rastgele güvenli token üretir.
 */
export function generateSecureToken(length = 64): string {
  const words = CryptoJS.lib.WordArray.random(length);
  return words.toString(CryptoJS.enc.Hex);
}
