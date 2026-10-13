// HTTP Basic authentication keeps credentials off the downloadable website.
// Use a unique, randomly generated password of at least 20 characters.
const encoder = new TextEncoder();

async function equalCredentials(actual: string, expected: string) {
  const [left, right] = await Promise.all(
    [actual, expected].map((value) =>
      crypto.subtle.digest("SHA-256", encoder.encode(value)),
    ),
  );
  const a = new Uint8Array(left),
    b = new Uint8Array(right);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

export async function authenticate(request: Request, password: unknown) {
  if (typeof password !== "string" || password.length < 20)
    return "unconfigured";
  const header = request.headers.get("Authorization") || "";
  if (header.length > 4096 || !/^Basic /i.test(header)) return "denied";
  try {
    const bytes = Uint8Array.from(atob(header.slice(6).trim()), (char) =>
      char.charCodeAt(0),
    );
    const credentials = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
    return (await equalCredentials(credentials, `owner:${password}`))
      ? "allowed"
      : "denied";
  } catch {
    return "denied";
  }
}
