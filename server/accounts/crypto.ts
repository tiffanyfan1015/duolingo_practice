const accountEncoder = new TextEncoder();
const hex = (bytes: ArrayBuffer | Uint8Array) => Array.from(new Uint8Array(bytes), (v) => v.toString(16).padStart(2, "0")).join("");
export const randomSecret = () => hex(crypto.getRandomValues(new Uint8Array(32)));
export async function digestSecret(value: string) {
  return hex(await crypto.subtle.digest("SHA-256", accountEncoder.encode(value)));
}
export async function sameSecret(left: string, right: string) {
  const a = await digestSecret(left), b = await digestSecret(right);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
export async function passwordHash(password: string, salt: string) {
  const key = await crypto.subtle.importKey("raw", accountEncoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: accountEncoder.encode(salt), iterations: 100000 }, key, 256));
}
export async function credentialKey(secret: unknown) {
  if (typeof secret !== "string" || !/^[a-f0-9]{64}$/i.test(secret)) throw new Error("Invalid credential key");
  const bytes = Uint8Array.from(secret.match(/../g)!, (s) => parseInt(s, 16));
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}
export async function sealCredential(token: string, secret: unknown, owner: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: accountEncoder.encode(owner) }, await credentialKey(secret), accountEncoder.encode(token));
  return JSON.stringify({ iv: Array.from(iv), data: Array.from(new Uint8Array(encrypted)) });
}
export async function openCredential(payload: string, secret: unknown, owner: string) {
  const { iv, data } = JSON.parse(payload);
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(iv), additionalData: accountEncoder.encode(owner) }, await credentialKey(secret), new Uint8Array(data)));
}
