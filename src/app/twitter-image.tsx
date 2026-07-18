import {
  createSocialImage,
  SOCIAL_IMAGE_ALT,
  SOCIAL_IMAGE_CONTENT_TYPE,
  SOCIAL_IMAGE_SIZE,
} from "@/lib/social-image";

/**
 * Image de carte Twitter/X (convention Next.js) — même visuel que l'image
 * Open Graph pour des aperçus identiques sur tous les réseaux.
 */

export const alt = SOCIAL_IMAGE_ALT;
export const size = SOCIAL_IMAGE_SIZE;
export const contentType = SOCIAL_IMAGE_CONTENT_TYPE;

export default function TwitterImage() {
  return createSocialImage();
}
