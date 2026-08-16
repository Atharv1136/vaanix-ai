-- =========================================================
-- Milestone 3: Bulk Calling · Agent Analytics · AI API Key Pool
-- =========================================================

-- -------------------------
-- Phase 3: Bulk Calling
-- -------------------------

CREATE TABLE IF NOT EXISTS public.bulk_call_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  assistant_id UUID REFERENCES public.assistants(id) ON DELETE SET NULL,
  phone_number_id UUID REFERENCES public.phone_numbers(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | running | paused | completed | failed
  total_contacts INTEGER NOT NULL DEFAULT 0,
  called_count INTEGER NOT NULL DEFAULT 0,
  answered_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.bulk_call_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.bulk_call_campaigns(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | calling | answered | no_answer | failed
  call_id UUID REFERENCES public.calls(id) ON DELETE SET NULL,
  position INTEGER NOT NULL,
  attempted_at TIMESTAMPTZ
);

ALTER TABLE public.bulk_call_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bulk_call_contacts ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bulk_call_campaigns TO authenticated;
GRANT ALL ON public.bulk_call_campaigns TO service_role;
CREATE POLICY "bulk_call_campaigns all" ON public.bulk_call_campaigns FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bulk_call_contacts TO authenticated;
GRANT ALL ON public.bulk_call_contacts TO service_role;
CREATE POLICY "bulk_call_contacts all" ON public.bulk_call_contacts FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- -------------------------
-- Phase 4: Agent Analytics
-- -------------------------

ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS ai_summary TEXT;
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS call_sentiment TEXT; -- positive | neutral | negative

-- -------------------------
-- Phase 5: AI API Key Pool
-- -------------------------

CREATE TABLE IF NOT EXISTS public.ai_provider_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL DEFAULT 'openai', -- openai | anthropic | groq | openrouter | together | nvidia | custom
  label TEXT NOT NULL,
  api_key TEXT NOT NULL,
  base_url TEXT,           -- for custom/openrouter providers
  model_override TEXT,     -- optional: force a specific model with this key
  is_active BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NOT NULL DEFAULT 0, -- lower number = tried first in fallback chain
  estimated_tokens_used BIGINT NOT NULL DEFAULT 0,
  estimated_cost_usd NUMERIC(12, 6) NOT NULL DEFAULT 0.000000,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_provider_keys ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_provider_keys TO authenticated;
GRANT ALL ON public.ai_provider_keys TO service_role;
CREATE POLICY "ai_provider_keys all" ON public.ai_provider_keys FOR ALL TO authenticated USING (true) WITH CHECK (true);
