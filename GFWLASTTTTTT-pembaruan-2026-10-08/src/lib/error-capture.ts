// Captures the original Error out-of-band so server.ts can recover the stack
// when h3 has already swallowed the throw into a generic 500 Response.
//
// M-2 (laporan audit): dulu hanya ada satu tempat penyimpanan (lastCapturedError), sehingga galat dari permintaan
// berikutnya menimpa galat permintaan sebelumnya. Sesuai rekomendasi PDF, galat kini disimpan di Map berbatas ukuran
// (LRU) dengan kunci ID permintaan. ID permintaan yang sedang berjalan dibawa lewat AsyncLocalStorage.
import { AsyncLocalStorage } from "node:async_hooks";

type CapturedError = { error: unknown; at: number };

const TTL_MS = 5_000;
const MAX_ENTRIES = 100;
const UNSCOPED = "tanpa-request-id";

const requestContext = new AsyncLocalStorage<string>();
const capturedErrors = new Map<string, CapturedError>();

function record(error: unknown) {
  // T-62: galat di luar scope permintaan diberi kunci unik, supaya galat kedua tidak menimpa galat pertama.
  const requestId = requestContext.getStore() ?? `${UNSCOPED}:${crypto.randomUUID()}`;
  // Hapus lalu isi lagi supaya kunci ini menjadi yang paling baru (urutan Map = urutan pemakaian).
  capturedErrors.delete(requestId);
  capturedErrors.set(requestId, { error, at: Date.now() });
  while (capturedErrors.size > MAX_ENTRIES) {
    const oldest = capturedErrors.keys().next().value;
    if (oldest === undefined) break;
    capturedErrors.delete(oldest);
  }
}

if (typeof globalThis.addEventListener === "function") {
  globalThis.addEventListener("error", (event) => record((event as ErrorEvent).error ?? event));
  globalThis.addEventListener("unhandledrejection", (event) =>
    record((event as PromiseRejectionEvent).reason),
  );
}

// Menjalankan fn dengan ID permintaan tertentu, supaya galat yang tertangkap selama fn berjalan tercatat di ID itu.
export function runWithRequestId<T>(requestId: string, fn: () => T): T {
  return requestContext.run(requestId, fn);
}

// K-19: listener error/unhandledrejection global bisa berjalan di luar scope runWithRequestId, sehingga galatnya
// tercatat tanpa ID permintaan. Jika tidak ada galat dengan ID ini, dipakai galat tanpa ID yang paling baru
// (masih dalam TTL), supaya stack asli tetap bisa ditampilkan di log server.
function newestUnscopedKey(): string | undefined {
  let found: string | undefined;
  for (const key of capturedErrors.keys()) if (key.startsWith(`${UNSCOPED}:`)) found = key;
  return found;
}

export function consumeCapturedError(requestId: string): unknown {
  const key = capturedErrors.has(requestId) ? requestId : newestUnscopedKey();
  const entry = key === undefined ? undefined : capturedErrors.get(key);
  if (key === undefined || !entry) return undefined;
  capturedErrors.delete(key);
  if (Date.now() - entry.at > TTL_MS) return undefined;
  return entry.error;
}
