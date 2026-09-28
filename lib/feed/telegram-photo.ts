import { Api } from "teleproto";

/** Teleproto's explicit thumb selector does not accept PhotoSizeProgressive. */
export function compatiblePhotoThumb(size: Api.TypePhotoSize): Api.TypePhotoSize {
  if (size instanceof Api.PhotoSizeProgressive) {
    return new Api.PhotoSize({
      type: size.type,
      w: size.w,
      h: size.h,
      size: Math.max(0, ...size.sizes),
    });
  }
  return size;
}
