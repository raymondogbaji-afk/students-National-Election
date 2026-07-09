/**
 * Lightweight device fingerprint: hash of stable browser attributes.
 * NOT for cross-site tracking — used only for tying a vote submission
 * to the device that used a voting code.
 */
export async function getDeviceFingerprint(): Promise<string> {
  if (typeof window === "undefined") return "server";
  const parts = [
    navigator.userAgent,
    navigator.language,
    navigator.hardwareConcurrency ?? "-",
    (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? "-",
    screen.width + "x" + screen.height + "x" + screen.colorDepth,
    new Date().getTimezoneOffset(),
  ].join("|");
  const buf = new TextEncoder().encode(parts);
  const hashBuf = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}
