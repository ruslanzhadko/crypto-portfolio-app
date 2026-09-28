import { describe, expect, it } from "vitest";
import {
  MAX_FEED_IMAGE_BYTES,
  detectImageMimeType,
  prepareFeedImage,
} from "./media";

describe("feed image validation", () => {
  it("recognizes supported image signatures", () => {
    expect(detectImageMimeType(Uint8Array.from([0xff, 0xd8, 0xff, 0x00]))).toBe(
      "image/jpeg",
    );
    expect(
      detectImageMimeType(
        Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
    ).toBe("image/png");
    expect(detectImageMimeType(Buffer.from("RIFF0000WEBP"))).toBe("image/webp");
    expect(detectImageMimeType(Buffer.from("GIF89a"))).toBe("image/gif");
  });

  it("rejects unknown, empty, and oversized payloads", () => {
    expect(prepareFeedImage(new Uint8Array())).toBeNull();
    expect(prepareFeedImage(Buffer.from("not-an-image"))).toBeNull();
    expect(
      prepareFeedImage(new Uint8Array(MAX_FEED_IMAGE_BYTES + 1)),
    ).toBeNull();
  });

  it("returns storage metadata for a valid image", () => {
    const payload = prepareFeedImage(Uint8Array.from([0xff, 0xd8, 0xff, 0x00]));
    expect(payload).toMatchObject({ mimeType: "image/jpeg", byteSize: 4 });
    expect(Buffer.isBuffer(payload?.data)).toBe(true);
  });
});
