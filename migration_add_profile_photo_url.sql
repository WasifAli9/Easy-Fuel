-- Add profile_photo_url column to profiles table
-- This column stores the path/URL to the user's profile picture

ALTER TABLE "profiles" 
ADD COLUMN IF NOT EXISTS "profile_photo_url" text;

-- Add a comment to the column for documentation
COMMENT ON COLUMN "profiles"."profile_photo_url" IS 'URL or path to the user profile picture stored in object storage';
