import {
  createSocialImage,
  SOCIAL_IMAGE_ALT,
  SOCIAL_IMAGE_CONTENT_TYPE,
  SOCIAL_IMAGE_SIZE,
} from "@/lib/social-image";

/**
 * Image Open Graph du site (convention Next.js) — rendue par `next/og`,
 * partagée avec `twitter-image.tsx` via `createSocialImage`.
 */

export const alt = SOCIAL_IMAGE_ALT;
export const size = SOCIAL_IMAGE_SIZE;
export const contentType = SOCIAL_IMAGE_CONTENT_TYPE;

export default function OpenGraphImage() {
  return createSocialImage();
}
