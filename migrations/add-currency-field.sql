-- Add currency field to profiles table for multi-currency support across Africa
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'ZAR';

-- Update existing rows to have ZAR as default currency
UPDATE profiles SET currency = 'ZAR' WHERE currency IS NULL OR currency = '';

-- Add comment to explain the currency field
COMMENT ON COLUMN profiles.currency IS 'ISO 4217 currency code (ZAR, USD, EUR, KES, NGN, etc.) for user preferred currency';
