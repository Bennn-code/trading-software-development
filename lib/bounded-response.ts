export class ResponseTooLargeError extends Error {}

/** Read a request or upstream response without buffering an unbounded body. */
export async function readBoundedBytes(source: Pick<Request, 'headers' | 'body'> | Pick<Response, 'headers' | 'body'>, maxBytes: number): Promise<Uint8Array> {
  const declaredLength = Number(source.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await source.body?.cancel().catch(() => {});
    throw new ResponseTooLargeError();
  }
  if (!source.body) return new Uint8Array();

  const reader = source.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new ResponseTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function readBoundedText(source: Pick<Request, 'headers' | 'body'> | Pick<Response, 'headers' | 'body'>, maxBytes: number): Promise<string> {
  return new TextDecoder('utf-8', { fatal: true }).decode(await readBoundedBytes(source, maxBytes));
}
