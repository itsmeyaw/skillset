// Spec #37, User Story 89: every download is limited to 1 MB and 10 s, over https only.
const limit = 1024 * 1024;

export class HttpStatusError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`HTTP ${status}`);
    this.status = status;
  }
}

export const fetchBoundedText = async (start: URL, fetchRemote: typeof fetch): Promise<string> => {
  let url = start;
  const signal = AbortSignal.timeout(10_000);
  // Match fetch's redirect limit to stop loops.
  for (let redirects = 0; redirects <= 20; redirects++) {
    if (url.protocol !== "https:") throw new Error("Redirects must use HTTPS.");
    const response = await fetchRemote(url.toString(), { signal, redirect: "manual" });
    if ([301, 302, 303, 307, 308].includes(response.status) && response.headers.has("location")) {
      await response.body?.cancel().catch(() => undefined);
      url = new URL(response.headers.get("location")!, url);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new HttpStatusError(response.status);
    }
    if (Number(response.headers.get("content-length")) > limit) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error("Body exceeds 1 MB.");
    }
    const reader = response.body?.getReader();
    const chunks: Array<Uint8Array> = [];
    let size = 0;
    if (reader) {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > limit) throw new Error("Body exceeds 1 MB.");
          chunks.push(value);
        }
      } finally {
        await reader.cancel().catch(() => undefined);
      }
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder().decode(bytes);
  }
  throw new Error("Too many redirects.");
};
