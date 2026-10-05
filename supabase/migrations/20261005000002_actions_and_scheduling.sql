-- =====================================================================
-- Migration: 20261005000002_actions_and_scheduling.sql
-- Description: Core schema for Action Engine, Scheduling & Appointments,
--              Resources, Services, Messages, and Double-booking Prevention.
-- =====================================================================

-- Ensure btree_gist extension is available for exclusion constraint
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ---------------------------------------------------------------------
-- 1. Services & Resources
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'staff', -- staff, room, equipment, doctor
  email text,
  phone text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.resources TO authenticated;
GRANT ALL ON public.resources TO service_role;
DROP POLICY IF EXISTS resources_owner ON public.resources;
CREATE POLICY resources_owner ON public.resources FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 30,
  price numeric(10, 2) NOT NULL DEFAULT 0.00,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.services TO authenticated;
GRANT ALL ON public.services TO service_role;
DROP POLICY IF EXISTS services_owner ON public.services;
CREATE POLICY services_owner ON public.services FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 2. Appointments with double-booking prevention constraint
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resource_id uuid REFERENCES public.resources(id) ON DELETE SET NULL,
  service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  customer_email text,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'confirmed', -- confirmed, pending, completed, cancelled, no_show
  notes text,
  call_id uuid REFERENCES public.calls(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT valid_appointment_time CHECK (end_time > start_time)
);

-- Exclusion constraint to guarantee zero double-booking for the same resource
-- when an appointment is confirmed or pending
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'no_double_booking'
  ) THEN
    ALTER TABLE public.appointments
    ADD CONSTRAINT no_double_booking
    EXCLUDE USING gist (
      resource_id WITH =,
      tstzrange(start_time, end_time) WITH &&
    ) WHERE (status IN ('confirmed', 'pending') AND resource_id IS NOT NULL);
  END IF;
END $$;

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.appointments TO authenticated;
GRANT ALL ON public.appointments TO service_role;
DROP POLICY IF EXISTS appointments_owner ON public.appointments;
CREATE POLICY appointments_owner ON public.appointments FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 3. Time Off / Breaks
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.time_off (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resource_id uuid REFERENCES public.resources(id) ON DELETE CASCADE,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.time_off ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.time_off TO authenticated;
GRANT ALL ON public.time_off TO service_role;
DROP POLICY IF EXISTS time_off_owner ON public.time_off;
CREATE POLICY time_off_owner ON public.time_off FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 4. Action Engine (agent_actions and action_runs)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agent_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assistant_id uuid REFERENCES public.assistants(id) ON DELETE CASCADE,
  name text NOT NULL,
  display_name text,
  description text,
  parameters jsonb NOT NULL DEFAULT '[]'::jsonb,
  action_type text NOT NULL DEFAULT 'system', -- system (e.g. book_appointment), webhook, integration
  endpoint text,
  http_method text DEFAULT 'POST',
  headers jsonb DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_actions ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.agent_actions TO authenticated;
GRANT ALL ON public.agent_actions TO service_role;
DROP POLICY IF EXISTS agent_actions_owner ON public.agent_actions;
CREATE POLICY agent_actions_owner ON public.agent_actions FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.action_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_id uuid REFERENCES public.agent_actions(id) ON DELETE SET NULL,
  call_id uuid REFERENCES public.calls(id) ON DELETE SET NULL,
  action_name text NOT NULL,
  input_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_payload jsonb,
  status text NOT NULL DEFAULT 'success', -- success, failed
  error_message text,
  latency_ms integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.action_runs ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.action_runs TO authenticated;
GRANT ALL ON public.action_runs TO service_role;
DROP POLICY IF EXISTS action_runs_owner ON public.action_runs;
CREATE POLICY action_runs_owner ON public.action_runs FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 5. Outbound Messages & Scheduled Jobs
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_phone text NOT NULL,
  content text NOT NULL,
  channel text NOT NULL DEFAULT 'sms', -- sms, whatsapp
  direction text NOT NULL DEFAULT 'outbound',
  status text NOT NULL DEFAULT 'sent', -- pending, sent, failed, delivered
  call_id uuid REFERENCES public.calls(id) ON DELETE SET NULL,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
DROP POLICY IF EXISTS messages_owner ON public.messages;
CREATE POLICY messages_owner ON public.messages FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.scheduled_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_type text NOT NULL, -- reminder_sms, post_call_summary, followup_call
  run_at timestamptz NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending', -- pending, completed, failed, cancelled
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.scheduled_jobs ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.scheduled_jobs TO authenticated;
GRANT ALL ON public.scheduled_jobs TO service_role;
DROP POLICY IF EXISTS scheduled_jobs_owner ON public.scheduled_jobs;
CREATE POLICY scheduled_jobs_owner ON public.scheduled_jobs FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
