import { describe, expect, it } from "vitest";
import { Api } from "teleproto";
import { compatiblePhotoThumb } from "./telegram-photo";

describe("Telegram progressive photo compatibility", () => {
  it("preserves the download location and full byte count in an accepted thumb type", () => {
    const thumb = compatiblePhotoThumb(new Api.PhotoSizeProgressive({
      type: "y", w: 1280, h: 720, sizes: [10000, 50000, 120000],
    }));
    expect(thumb).toBeInstanceOf(Api.PhotoSize);
    expect(thumb).toMatchObject({ type: "y", w: 1280, h: 720, size: 120000 });
  });
});
