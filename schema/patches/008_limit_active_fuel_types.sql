-- Initial platform fuel configuration:
-- keep only standard Diesel and LPG (gas) enabled.
-- Administrators can change these flags later from Platform Settings.

UPDATE fuel_types
SET active = (code IN ('diesel', 'lpg'));
