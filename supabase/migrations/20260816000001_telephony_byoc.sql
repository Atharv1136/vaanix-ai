-- =========================================================
-- Milestone 4: Telephony BYOC (Twilio / Plivo) & Gemini Support
-- =========================================================

ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS telephony_provider TEXT DEFAULT 'twilio';
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS telephony_account_sid TEXT;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS telephony_auth_token TEXT;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS telephony_phone_number TEXT;
