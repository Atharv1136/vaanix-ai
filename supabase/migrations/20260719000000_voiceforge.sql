-- === schema pivot for VoiceForge AI ===
DROP TABLE IF EXISTS public.call_transcripts CASCADE;
DROP TABLE IF EXISTS public.calls CASCADE;
DROP TABLE IF EXISTS public.call_lines CASCADE;
DROP TABLE IF EXISTS public.kb_sections CASCADE;
DROP TABLE IF EXISTS public.common_queries CASCADE;
DROP TABLE IF EXISTS public.app_settings CASCADE;

CREATE TABLE public.assistants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  first_message TEXT,
  model TEXT NOT NULL DEFAULT 'claude-3-haiku-20240307',
  voice_provider TEXT NOT NULL DEFAULT 'elevenlabs',
  voice_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_published BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE public.tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  tool_type TEXT NOT NULL,
  config_json JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE public.assistant_tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assistant_id UUID NOT NULL REFERENCES public.assistants(id) ON DELETE CASCADE,
  tool_id UUID NOT NULL REFERENCES public.tools(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(assistant_id, tool_id)
);

CREATE TABLE public.phone_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  twilio_sid TEXT,
  phone_number TEXT NOT NULL,
  assistant_id UUID REFERENCES public.assistants(id) ON DELETE SET NULL,
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assistant_id UUID REFERENCES public.assistants(id) ON DELETE SET NULL,
  phone_number_id UUID REFERENCES public.phone_numbers(id) ON DELETE SET NULL,
  direction TEXT NOT NULL DEFAULT 'inbound',
  student_or_caller_number TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  outcome TEXT NOT NULL DEFAULT 'in_progress',
  cost_estimate NUMERIC(10, 4) DEFAULT 0.0000
);

CREATE TABLE public.call_transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID NOT NULL REFERENCES public.calls(id) ON DELETE CASCADE,
  turn_index INTEGER NOT NULL,
  speaker TEXT NOT NULL,
  text TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.kb_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_id UUID NOT NULL REFERENCES public.tools(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash TEXT NOT NULL,
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);

-- RLS Policies
ALTER TABLE public.assistants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phone_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kb_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assistants TO authenticated;
GRANT ALL ON public.assistants TO service_role;
CREATE POLICY "assistants read all" ON public.assistants FOR SELECT TO authenticated USING (true);
CREATE POLICY "assistants write all" ON public.assistants FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tools TO authenticated;
GRANT ALL ON public.tools TO service_role;
CREATE POLICY "tools read all" ON public.tools FOR SELECT TO authenticated USING (true);
CREATE POLICY "tools write all" ON public.tools FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.assistant_tools TO authenticated;
GRANT ALL ON public.assistant_tools TO service_role;
CREATE POLICY "assistant_tools read all" ON public.assistant_tools FOR SELECT TO authenticated USING (true);
CREATE POLICY "assistant_tools write all" ON public.assistant_tools FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.phone_numbers TO authenticated;
GRANT ALL ON public.phone_numbers TO service_role;
CREATE POLICY "phone_numbers read all" ON public.phone_numbers FOR SELECT TO authenticated USING (true);
CREATE POLICY "phone_numbers write all" ON public.phone_numbers FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.calls TO authenticated;
GRANT ALL ON public.calls TO service_role;
CREATE POLICY "calls read all" ON public.calls FOR SELECT TO authenticated USING (true);
CREATE POLICY "calls write all" ON public.calls FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.call_transcripts TO authenticated;
GRANT ALL ON public.call_transcripts TO service_role;
CREATE POLICY "call_transcripts read all" ON public.call_transcripts FOR SELECT TO authenticated USING (true);
CREATE POLICY "call_transcripts write all" ON public.call_transcripts FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kb_documents TO authenticated;
GRANT ALL ON public.kb_documents TO service_role;
CREATE POLICY "kb_documents read all" ON public.kb_documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "kb_documents write all" ON public.kb_documents FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_keys TO authenticated;
GRANT ALL ON public.api_keys TO service_role;
CREATE POLICY "api_keys read all" ON public.api_keys FOR SELECT TO authenticated USING (true);
CREATE POLICY "api_keys write all" ON public.api_keys FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Seed Data
INSERT INTO public.assistants (id, name, system_prompt, first_message, model, voice_provider, voice_id, is_published) VALUES
('a0000000-0000-0000-0000-000000000001', 'College Admissions Assistant', 'You are a helpful college admissions assistant. Keep answers brief and conversational.', 'Hello, this is the College Admissions Assistant. How can I help you today?', 'claude-3-haiku-20240307', 'elevenlabs', 'pNInz6obbfDQGcgMyIGC', true),
('a0000000-0000-0000-0000-000000000002', 'Support Triage', 'You are an IT support triage bot. Your goal is to figure out the issue and route the call appropriately.', 'Hi, IT support here. What seems to be the issue?', 'claude-3-haiku-20240307', 'elevenlabs', 'XrExE9yKIg1WjnnlVkGX', false);

INSERT INTO public.tools (id, name, description, tool_type) VALUES
('t0000000-0000-0000-0000-000000000001', 'Search Admissions KB', 'Search the college admissions knowledge base for cutoffs, dates, and fees.', 'knowledge_base'),
('t0000000-0000-0000-0000-000000000002', 'Transfer to Human', 'Transfer the call to a human agent.', 'transfer_call'),
('t0000000-0000-0000-0000-000000000003', 'End Call', 'End the call when the conversation is finished.', 'end_call');

INSERT INTO public.assistant_tools (assistant_id, tool_id, enabled) VALUES
('a0000000-0000-0000-0000-000000000001', 't0000000-0000-0000-0000-000000000001', true),
('a0000000-0000-0000-0000-000000000001', 't0000000-0000-0000-0000-000000000002', true),
('a0000000-0000-0000-0000-000000000001', 't0000000-0000-0000-0000-000000000003', true),
('a0000000-0000-0000-0000-000000000002', 't0000000-0000-0000-0000-000000000002', true);

INSERT INTO public.kb_documents (tool_id, title, content) VALUES
('t0000000-0000-0000-0000-000000000001', 'B.Tech Tuition Fees', 'The tuition fee for B.Tech is ₹1,42,000 per year.'),
('t0000000-0000-0000-0000-000000000001', 'CAP Round 1 Cutoffs', 'CE: 96.8 percentile. ME: 88.2 percentile.');
