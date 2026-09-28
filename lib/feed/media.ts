export const MAX_FEED_IMAGE_BYTES = 8 * 1024 * 1024;

export interface FeedImagePayload {
  data: Buffer;
  mimeType: "image/gif" | "image/jpeg" | "image/png" | "image/webp";
  byteSize: number;
}

export function detectImageMimeType(
  data: Uint8Array,
): FeedImagePayload["mimeType"] | null {
  if (
    data.length >= 3 &&
    data[0] === 0xff &&
    data[1] === 0xd8 &&
    data[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    data.length >= 8 &&
    data[0] === 0x89 &&
    data[1] === 0x50 &&
    data[2] === 0x4e &&
    data[3] === 0x47 &&
    data[4] === 0x0d &&
    data[5] === 0x0a &&
    data[6] === 0x1a &&
    data[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    data.length >= 12 &&
    String.fromCharCode(...data.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...data.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  if (data.length >= 6) {
    const signature = String.fromCharCode(...data.slice(0, 6));
    if (signature === "GIF87a" || signature === "GIF89a") return "image/gif";
  }
  return null;
}

export function prepareFeedImage(data: Uint8Array): FeedImagePayload | null {
  if (data.byteLength === 0 || data.byteLength > MAX_FEED_IMAGE_BYTES)
    return null;
  const mimeType = detectImageMimeType(data);
  if (!mimeType) return null;
  const buffer = Buffer.from(data);
  return { data: buffer, mimeType, byteSize: buffer.byteLength };
}
