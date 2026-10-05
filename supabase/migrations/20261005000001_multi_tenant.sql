-- =====================================================================
-- VAANIX Phase A: Multi-tenant isolation
-- ---------------------------------------------------------------------
-- Before this migration every table used RLS `USING (true)` and had no
-- owner column, so every signed-in user saw (and could edit) every other
-- user's agents, calls, numbers and API keys. Some tables were even open
-- to the `anon` role.
--
-- This migration:
--   1. Adds `user_id` (DEFAULT auth.uid()) to all parent tables.
--   2. Backfills existing rows to the original owner account.
--   3. Replaces all permissive policies with owner-scoped policies.
--      Child tables are scoped through their parent row.
--   4. Adds safety-net triggers so service-role inserts made by the voice
--      server inherit the owner from the related assistant.
--   5. Creates `business_profiles` (one row per user) + auto-create trigger.
--
-- Unrelated tables that live in the same project (devices, pairings,
-- pairing_codes, stream_signaling, app_updates) are intentionally untouched.
-- =====================================================================

-- Original owner of all pre-existing data (atharvbhosale00@gmail.com)
DO $$ BEGIN
  PERFORM 1 FROM auth.users WHERE id = '7c35b67f-3652-4dd6-9184-52923754f039';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Owner account not found; aborting tenant migration.';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 1. Owner columns on parent tables
-- ---------------------------------------------------------------------
ALTER TABLE public.assistants          ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();
ALTER TABLE public.phone_numbers       ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();
ALTER TABLE public.calls               ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();
ALTER TABLE public.tools               ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();
ALTER TABLE public.ai_provider_keys    ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();
ALTER TABLE public.bulk_call_campaigns ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();
ALTER TABLE public.api_keys            ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();

-- Real Twilio CallSid (calls.id is our own UUID); needed for live transfer.
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS twilio_call_sid text;

-- ---------------------------------------------------------------------
-- 2. Backfill existing data to the original owner
-- ---------------------------------------------------------------------
UPDATE public.assistants          SET user_id = '7c35b67f-3652-4dd6-9184-52923754f039' WHERE user_id IS NULL;
UPDATE public.phone_numbers       SET user_id = '7c35b67f-3652-4dd6-9184-52923754f039' WHERE user_id IS NULL;
UPDATE public.calls               SET user_id = '7c35b67f-3652-4dd6-9184-52923754f039' WHERE user_id IS NULL;
UPDATE public.tools               SET user_id = '7c35b67f-3652-4dd6-9184-52923754f039' WHERE user_id IS NULL;
UPDATE public.ai_provider_keys    SET user_id = '7c35b67f-3652-4dd6-9184-52923754f039' WHERE user_id IS NULL;
UPDATE public.bulk_call_campaigns SET user_id = '7c35b67f-3652-4dd6-9184-52923754f039' WHERE user_id IS NULL;
UPDATE public.api_keys            SET user_id = '7c35b67f-3652-4dd6-9184-52923754f039' WHERE user_id IS NULL;

-- Tables that are always created with an owner can now be NOT NULL.
-- (calls stays nullable: a few legacy server paths may insert without an
--  assistant; the trigger below fills it whenever possible. tools stays
--  nullable: user_id IS NULL = shared read-only system template.)
ALTER TABLE public.assistants          ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.phone_numbers       ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.ai_provider_keys    ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.bulk_call_campaigns ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.api_keys            ALTER COLUMN user_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_assistants_user          ON public.assistants(user_id);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_user       ON public.phone_numbers(user_id);
CREATE INDEX IF NOT EXISTS idx_calls_user_started       ON public.calls(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_tools_user               ON public.tools(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_provider_keys_user    ON public.ai_provider_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_bulk_campaigns_user      ON public.bulk_call_campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_user            ON public.api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_assistant_qas_assistant  ON public.assistant_qas(assistant_id);
CREATE INDEX IF NOT EXISTS idx_call_transcripts_call    ON public.call_transcripts(call_id);
CREATE INDEX IF NOT EXISTS idx_bulk_contacts_campaign   ON public.bulk_call_contacts(campaign_id);

-- ---------------------------------------------------------------------
-- 3. Safety-net triggers: service-role inserts inherit the owner
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.vx_fill_owner_from_assistant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.user_id IS NULL AND NEW.assistant_id IS NOT NULL THEN
    SELECT a.user_id INTO NEW.user_id FROM public.assistants a WHERE a.id = NEW.assistant_id;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.vx_fill_call_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.user_id IS NULL AND NEW.assistant_id IS NOT NULL THEN
    SELECT a.user_id INTO NEW.user_id FROM public.assistants a WHERE a.id = NEW.assistant_id;
  END IF;
  IF NEW.user_id IS NULL AND NEW.phone_number_id IS NOT NULL THEN
    SELECT p.user_id INTO NEW.user_id FROM public.phone_numbers p WHERE p.id = NEW.phone_number_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_calls_owner ON public.calls;
CREATE TRIGGER trg_calls_owner BEFORE INSERT ON public.calls
  FOR EACH ROW EXECUTE FUNCTION public.vx_fill_call_owner();

DROP TRIGGER IF EXISTS trg_bulk_campaign_owner ON public.bulk_call_campaigns;
CREATE TRIGGER trg_bulk_campaign_owner BEFORE INSERT ON public.bulk_call_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.vx_fill_owner_from_assistant();

-- ---------------------------------------------------------------------
-- 4. Replace every permissive policy with owner-scoped policies
-- ---------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname, tablename FROM pg_policies
    WHERE schemaname = 'public' AND tablename IN (
      'assistants','phone_numbers','calls','tools','ai_provider_keys',
      'bulk_call_campaigns','api_keys','assistant_qas','assistant_tools',
      'call_transcripts','bulk_call_contacts','kb_documents',
      'app_settings','common_queries'
    )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- Revoke anon access entirely on tenant tables
REVOKE ALL ON public.assistants, public.phone_numbers, public.calls, public.tools,
  public.ai_provider_keys, public.bulk_call_campaigns, public.api_keys,
  public.assistant_qas, public.assistant_tools, public.call_transcripts,
  public.bulk_call_contacts, public.kb_documents, public.app_settings,
  public.common_queries FROM anon;

-- Parent tables: direct owner check
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['assistants','phone_numbers','calls','ai_provider_keys','bulk_call_campaigns','api_keys'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())', t || '_owner', t);
  END LOOP;
END $$;

-- tools: own rows + read-only shared system templates (user_id IS NULL)
ALTER TABLE public.tools ENABLE ROW LEVEL SECURITY;
CREATE POLICY tools_read ON public.tools FOR SELECT TO authenticated
  USING (user_id IS NULL OR user_id = auth.uid());
CREATE POLICY tools_write ON public.tools FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY tools_update ON public.tools FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY tools_delete ON public.tools FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Child tables: scoped through the parent row
ALTER TABLE public.assistant_qas ENABLE ROW LEVEL SECURITY;
CREATE POLICY assistant_qas_owner ON public.assistant_qas FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.assistants a WHERE a.id = assistant_id AND a.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.assistants a WHERE a.id = assistant_id AND a.user_id = auth.uid()));

ALTER TABLE public.assistant_tools ENABLE ROW LEVEL SECURITY;
CREATE POLICY assistant_tools_owner ON public.assistant_tools FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.assistants a WHERE a.id = assistant_id AND a.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.assistants a WHERE a.id = assistant_id AND a.user_id = auth.uid()));

ALTER TABLE public.call_transcripts ENABLE ROW LEVEL SECURITY;
CREATE POLICY call_transcripts_owner ON public.call_transcripts FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.calls c WHERE c.id = call_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.calls c WHERE c.id = call_id AND c.user_id = auth.uid()));

ALTER TABLE public.bulk_call_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY bulk_call_contacts_owner ON public.bulk_call_contacts FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bulk_call_campaigns b WHERE b.id = campaign_id AND b.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.bulk_call_campaigns b WHERE b.id = campaign_id AND b.user_id = auth.uid()));

ALTER TABLE public.kb_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY kb_documents_owner ON public.kb_documents FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tools t WHERE t.id = tool_id AND t.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.tools t WHERE t.id = tool_id AND t.user_id = auth.uid()));

-- Legacy global tables: server-only from now on (no browser policies)
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.common_queries ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 5. business_profiles: one row per account (replaces global app_settings)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.business_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  phone text,
  role text,
  business_name text,
  domain_pack text NOT NULL DEFAULT 'generic',
  team_size text,
  city text,
  timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  working_hours jsonb NOT NULL DEFAULT '{"mon":[["10:00","20:00"]],"tue":[["10:00","20:00"]],"wed":[["10:00","20:00"]],"thu":[["10:00","20:00"]],"fri":[["10:00","20:00"]],"sat":[["10:00","14:00"]],"sun":[]}',
  lunch_break jsonb,
  transfer_number text,
  use_case text,
  monthly_call_volume text,
  primary_language text DEFAULT 'en-IN',
  currency text NOT NULL DEFAULT 'INR',
  default_assistant_id uuid REFERENCES public.assistants(id) ON DELETE SET NULL,
  telephony_provider text DEFAULT 'twilio',
  telephony_account_sid text,
  telephony_auth_token text,
  telephony_phone_number text,
  onboarding_completed boolean NOT NULL DEFAULT false,
  onboarding_step int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.business_profiles ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.business_profiles TO authenticated;
GRANT ALL ON public.business_profiles TO service_role;
DROP POLICY IF EXISTS business_profiles_owner ON public.business_profiles;
CREATE POLICY business_profiles_owner ON public.business_profiles FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Auto-create a profile for every new sign-up
CREATE OR REPLACE FUNCTION public.vx_handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.business_profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created_vx ON auth.users;
CREATE TRIGGER on_auth_user_created_vx AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.vx_handle_new_user();

-- Backfill profiles for existing accounts (everyone re-onboards once)
INSERT INTO public.business_profiles (user_id, full_name)
SELECT u.id, COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1))
FROM auth.users u
ON CONFLICT (user_id) DO NOTHING;

-- Carry the owner's org name over from the legacy singleton settings row
UPDATE public.business_profiles bp
SET business_name = s.org_name
FROM public.app_settings s
WHERE s.id = 1 AND bp.user_id = '7c35b67f-3652-4dd6-9184-52923754f039' AND bp.business_name IS NULL;

-- ---------------------------------------------------------------------
-- 6. Helper RPC functions for campaign increments
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.increment_campaign_called(campaign_id_arg uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE public.bulk_call_campaigns
  SET called_count = COALESCE(called_count, 0) + 1
  WHERE id = campaign_id_arg;
$$;

CREATE OR REPLACE FUNCTION public.increment_campaign_answered(campaign_id_arg uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE public.bulk_call_campaigns
  SET answered_count = COALESCE(answered_count, 0) + 1
  WHERE id = campaign_id_arg;
$$;


-- =====================================================================
-- ROLLBACK (manual, if ever needed):
--   DROP TRIGGER on_auth_user_created_vx ON auth.users;
--   DROP TRIGGER trg_calls_owner ON public.calls;
--   DROP TRIGGER trg_bulk_campaign_owner ON public.bulk_call_campaigns;
--   -- drop the *_owner policies and re-create `FOR ALL USING (true)` ones
--   -- user_id columns can stay; they are harmless when policies are open.
-- =====================================================================
