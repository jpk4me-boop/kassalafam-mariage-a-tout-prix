import "server-only";

import { cache } from "react";

import { resolveProfilePromotionShareToken } from "@/lib/server/profile-promotion-share-links";
import type {
  PublicSharedPhoto,
  PublicSharedProfile,
} from "@/lib/server/public-profile-share";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "profile-photos";
const BIO_MAX_LENGTH = 280;
const MAX_PHOTO_BYTES = 3145728;

const ALLOWED_PHOTO_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export type PublicPromotedProfile = PublicSharedProfile & {
  channel: "facebook" | "instagram" | "snapchat" | "whatsapp";
  expiresAt: string;
};

type PromotionPhotoRow = {
  storage_path: string | null;
  mime_type: string | null;
  size_bytes: number | null;
};

function computeAge(birthDate: string | null): number | null {
  if (!birthDate) return null;

  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;

  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDelta = now.getMonth() - birth.getMonth();

  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < birth.getDate())) {
    age -= 1;
  }

  return age >= 18 && age <= 120 ? age : null;
}

function shortBio(bio: string | null): string | null {
  const trimmed = bio?.trim();
  if (!trimmed) return null;
  if (trimmed.length <= BIO_MAX_LENGTH) return trimmed;
  return `${trimmed.slice(0, BIO_MAX_LENGTH).trimEnd()}…`;
}

function isValidPromotionPhoto(
  photo: PromotionPhotoRow | null,
  profileId: string,
): photo is PromotionPhotoRow & {
  storage_path: string;
  mime_type: string;
  size_bytes: number;
} {
  return Boolean(
    photo?.storage_path &&
      photo.storage_path.startsWith(`${profileId}/`) &&
      photo.mime_type &&
      ALLOWED_PHOTO_MIME_TYPES.has(photo.mime_type) &&
      photo.size_bytes != null &&
      photo.size_bytes >= 1 &&
      photo.size_bytes <= MAX_PHOTO_BYTES,
  );
}

async function loadPublicPromotedProfile(
  token: string,
): Promise<PublicPromotedProfile | null> {
  const resolved = await resolveProfilePromotionShareToken(token);
  if (!resolved) return null;

  const admin = createAdminClient();

  const [profileResult, photoResult] = await Promise.all([
    admin
      .from("profiles")
      .select("first_name, birth_date, city, country, intention, bio, blur_photos")
      .eq("id", resolved.profile_id)
      .maybeSingle(),
    admin
      .from("photos")
      .select("storage_path, mime_type, size_bytes")
      .eq("id", resolved.photo_id)
      .eq("profile_id", resolved.profile_id)
      .maybeSingle(),
  ]);

  const profile = profileResult.data;
  const photo = photoResult.data as PromotionPhotoRow | null;

  if (
    profileResult.error ||
    photoResult.error ||
    !profile ||
    profile.blur_photos ||
    !isValidPromotionPhoto(photo, resolved.profile_id)
  ) {
    return null;
  }

  const age = computeAge(profile.birth_date);
  if (age == null) return null;

  return {
    firstName: profile.first_name?.trim() || null,
    age,
    city: profile.city,
    country: profile.country,
    intention: profile.intention,
    bio: shortBio(profile.bio),
    hasPublicPhoto: true,
    channel: resolved.channel,
    expiresAt: resolved.expires_at,
  };
}

export const getPublicPromotedProfile = cache(loadPublicPromotedProfile);

export async function getPublicPromotedPhoto(
  token: string,
): Promise<PublicSharedPhoto | null> {
  const resolved = await resolveProfilePromotionShareToken(token);
  if (!resolved) return null;

  const admin = createAdminClient();

  const [profileResult, photoResult] = await Promise.all([
    admin
      .from("profiles")
      .select("blur_photos")
      .eq("id", resolved.profile_id)
      .maybeSingle(),
    admin
      .from("photos")
      .select("storage_path, mime_type, size_bytes")
      .eq("id", resolved.photo_id)
      .eq("profile_id", resolved.profile_id)
      .maybeSingle(),
  ]);

  const profile = profileResult.data;
  const photo = photoResult.data as PromotionPhotoRow | null;

  if (
    profileResult.error ||
    photoResult.error ||
    !profile ||
    profile.blur_photos ||
    !isValidPromotionPhoto(photo, resolved.profile_id)
  ) {
    return null;
  }

  const { data: blob, error: downloadError } = await admin.storage
    .from(BUCKET)
    .download(photo.storage_path);

  if (
    downloadError ||
    !blob ||
    blob.size < 1 ||
    blob.size > MAX_PHOTO_BYTES
  ) {
    return null;
  }

  return {
    body: await blob.arrayBuffer(),
    contentType: photo.mime_type,
  };
}