
-- === schema ===
CREATE TABLE public.staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES auth.users ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff TO authenticated;
GRANT ALL ON public.staff TO service_role;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read all" ON public.staff FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff write all" ON public.staff FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.kb_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kb_sections TO authenticated;
GRANT ALL ON public.kb_sections TO service_role;
ALTER TABLE public.kb_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kb read" ON public.kb_sections FOR SELECT TO authenticated USING (true);
CREATE POLICY "kb write" ON public.kb_sections FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.call_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number TEXT NOT NULL,
  label TEXT NOT NULL,
  ai_enabled BOOLEAN NOT NULL DEFAULT true,
  forward_to TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.call_lines TO authenticated;
GRANT ALL ON public.call_lines TO service_role;
ALTER TABLE public.call_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lines read" ON public.call_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY "lines write" ON public.call_lines FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_id UUID REFERENCES public.call_lines ON DELETE SET NULL,
  student_number TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'inbound',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  outcome TEXT NOT NULL DEFAULT 'resolved',
  flagged BOOLEAN NOT NULL DEFAULT false,
  summary TEXT
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calls TO authenticated;
GRANT ALL ON public.calls TO service_role;
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "calls read" ON public.calls FOR SELECT TO authenticated USING (true);
CREATE POLICY "calls write" ON public.calls FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.call_transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID NOT NULL REFERENCES public.calls ON DELETE CASCADE,
  turn_index INTEGER NOT NULL,
  speaker TEXT NOT NULL,
  text TEXT NOT NULL,
  ts TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.call_transcripts TO authenticated;
GRANT ALL ON public.call_transcripts TO service_role;
ALTER TABLE public.call_transcripts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "transcripts read" ON public.call_transcripts FOR SELECT TO authenticated USING (true);
CREATE POLICY "transcripts write" ON public.call_transcripts FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.common_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_text TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  last_asked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.common_queries TO authenticated;
GRANT ALL ON public.common_queries TO service_role;
ALTER TABLE public.common_queries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cq read" ON public.common_queries FOR SELECT TO authenticated USING (true);
CREATE POLICY "cq write" ON public.common_queries FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.app_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  org_name TEXT NOT NULL DEFAULT 'CampusConnect College',
  business_hours_start TIME NOT NULL DEFAULT '09:00',
  business_hours_end TIME NOT NULL DEFAULT '18:00',
  business_days TEXT NOT NULL DEFAULT 'Mon-Sat',
  default_greeting TEXT NOT NULL DEFAULT 'Hello, thank you for calling the admission cell. This is the AI assistant — how can I help you with your CAP round query today?',
  CONSTRAINT settings_singleton CHECK (id = 1)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings read" ON public.app_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "settings write" ON public.app_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- === seed data ===
INSERT INTO public.app_settings (id) VALUES (1);

INSERT INTO public.kb_sections (title, content, category, updated_by) VALUES
('B.Tech Computer Engineering', 'A 4-year undergraduate program with 120 seats. Specializations available in AI/ML and Data Science from the 3rd year onward.', 'courses', 'Prof. Deshpande'),
('B.Tech Mechanical Engineering', 'A 4-year undergraduate program with 60 seats. NBA accredited. Workshops in CAD/CAM and Robotics.', 'courses', 'Prof. Deshpande'),
('B.Tech Civil Engineering', '4-year program, 60 seats. Includes MoU-backed internships with L&T and Afcons.', 'courses', 'Prof. Deshpande'),
('MCA (Master of Computer Applications)', '2-year PG program, 60 seats. Admissions via MAH-MCA CET.', 'courses', 'Ms. Iyer'),
('CAP Round 1 — Cutoff (2025)', 'CE: 96.8 percentile (OPEN), 92.4 (OBC). ME: 88.2 (OPEN), 82.1 (OBC). CV: 82.0 (OPEN), 74.5 (OBC).', 'cutoffs', 'Ms. Iyer'),
('CAP Round 2 — Cutoff (2025)', 'CE: 94.1 (OPEN), 89.7 (OBC). ME: 84.0 (OPEN), 78.3 (OBC). CV: 76.5 (OPEN), 68.0 (OBC).', 'cutoffs', 'Ms. Iyer'),
('Documents Required at Admission', '1) MHT-CET/JEE scorecard, 2) HSC (12th) marksheet, 3) SSC (10th) marksheet, 4) Domicile certificate, 5) Aadhaar card, 6) Caste certificate & non-creamy-layer (if applicable), 7) Passport-size photos (4), 8) Migration certificate if applicable.', 'documents', 'Mr. Kulkarni'),
('CAP Round Dates — 2025', 'Round 1 seat allotment: 22 Jul 2025. Reporting: 23–27 Jul. Round 2 allotment: 05 Aug. Reporting: 06–09 Aug. Round 3 allotment: 18 Aug.', 'cap_dates', 'Ms. Iyer'),
('Tuition Fees — 2025-26', 'B.Tech (all branches): ₹1,42,000 per year. MCA: ₹98,000 per year. Hostel: ₹65,000/year (twin sharing, mess included). EBC/TFWS concessions available per govt norms.', 'fees', 'Mr. Kulkarni'),
('Can I change branch after Round 1?', 'Yes, if you accept a Round 1 seat with the "betterment" option, you remain eligible for Round 2 for a preferred branch. If your Round 2 allotment is higher, it auto-cancels the Round 1 seat.', 'faq', 'Prof. Deshpande'),
('Is hostel available for first-year students?', 'Yes. First-year hostel is guaranteed for all outstation students. Applications open alongside CAP reporting.', 'faq', 'Mr. Kulkarni'),
('What is the last date to freeze my seat?', 'Seat freezing for Round 1 closes at 5:00 PM on 27 Jul 2025. No extensions are given by DTE.', 'faq', 'Ms. Iyer');

INSERT INTO public.call_lines (id, phone_number, label, ai_enabled, forward_to) VALUES
('00000000-0000-0000-0000-000000000001', '+91 22 4000 1001', 'Front Desk — CAP Round', true, 'Ms. Iyer (Ext 202)'),
('00000000-0000-0000-0000-000000000002', '+91 22 4000 1002', 'Admission Enquiry', true, 'Mr. Kulkarni (Ext 205)'),
('00000000-0000-0000-0000-000000000003', '+91 22 4000 1003', 'Hostel & Fees', true, 'Accounts (Ext 210)'),
('00000000-0000-0000-0000-000000000004', '+91 22 4000 1004', 'Principal''s Office', false, 'Prof. Deshpande (Ext 101)');

-- calls
INSERT INTO public.calls (id, line_id, student_number, direction, started_at, ended_at, duration_seconds, outcome, flagged, summary) VALUES
('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '+91 98XXXXXX21', 'inbound', now() - interval '25 minutes', now() - interval '22 minutes 10 seconds', 170, 'resolved', false, 'Asked about CE cutoff for Round 2.'),
('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '+91 91XXXXXX07', 'inbound', now() - interval '48 minutes', now() - interval '46 minutes', 120, 'resolved', false, 'Documents required at reporting.'),
('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002', '+91 77XXXXXX40', 'inbound', now() - interval '1 hour 20 minutes', now() - interval '1 hour 16 minutes', 240, 'flagged', true, 'AI gave incorrect hostel fee figure.'),
('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000003', '+91 82XXXXXX99', 'inbound', now() - interval '2 hours 10 minutes', now() - interval '2 hours 8 minutes', 118, 'resolved', false, 'Fee installment options.'),
('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000002', '+91 99XXXXXX13', 'inbound', now() - interval '3 hours', now() - interval '2 hours 58 minutes', 90, 'forwarded', false, 'Student asked to speak to a human.'),
('10000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', '+91 90XXXXXX55', 'inbound', now() - interval '5 hours', now() - interval '4 hours 56 minutes', 210, 'resolved', false, 'Asked about branch change between rounds.'),
('10000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001', '+91 70XXXXXX18', 'inbound', now() - interval '7 hours', now() - interval '6 hours 58 minutes', 95, 'resolved', false, 'MCA CET eligibility.'),
('10000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000003', '+91 93XXXXXX02', 'inbound', now() - interval '1 day', now() - interval '23 hours 57 minutes', 165, 'resolved', false, 'Hostel availability first-year.');

-- transcripts for a couple of calls
INSERT INTO public.call_transcripts (call_id, turn_index, speaker, text) VALUES
('10000000-0000-0000-0000-000000000001', 1, 'ai', 'Hello, thank you for calling the admission cell. How can I help you with your CAP round query today?'),
('10000000-0000-0000-0000-000000000001', 2, 'student', 'Hi, I wanted to know the CE cutoff for Round 2 this year.'),
('10000000-0000-0000-0000-000000000001', 3, 'ai', 'For 2025 CAP Round 2, Computer Engineering closed at 94.1 percentile for OPEN and 89.7 for OBC.'),
('10000000-0000-0000-0000-000000000001', 4, 'student', 'Thanks. And what documents do I need at reporting?'),
('10000000-0000-0000-0000-000000000001', 5, 'ai', 'You will need your CET scorecard, HSC and SSC marksheets, domicile, Aadhaar, four photos, and caste certificate if applicable.'),
('10000000-0000-0000-0000-000000000001', 6, 'student', 'Great, thank you.'),
('10000000-0000-0000-0000-000000000001', 7, 'ai', 'Happy to help. All the best with your admission.'),

('10000000-0000-0000-0000-000000000003', 1, 'ai', 'Hello, thank you for calling. How can I help you?'),
('10000000-0000-0000-0000-000000000003', 2, 'student', 'What is the hostel fee for this year?'),
('10000000-0000-0000-0000-000000000003', 3, 'ai', 'The hostel fee is approximately fifty thousand rupees per year.'),
('10000000-0000-0000-0000-000000000003', 4, 'student', 'Are you sure? Someone told me it was higher.'),
('10000000-0000-0000-0000-000000000003', 5, 'ai', 'That is the figure I have on record.'),
('10000000-0000-0000-0000-000000000003', 6, 'student', 'Okay, I''ll double check with the office. Bye.'),

('10000000-0000-0000-0000-000000000005', 1, 'ai', 'Hello, thank you for calling the admission cell.'),
('10000000-0000-0000-0000-000000000005', 2, 'student', 'Can I talk to a real person please?'),
('10000000-0000-0000-0000-000000000005', 3, 'ai', 'Of course, connecting you to Mr. Kulkarni now. Please hold.');

INSERT INTO public.common_queries (question_text, count, last_asked_at) VALUES
('What is the cutoff for CE this year?', 47, now() - interval '25 minutes'),
('What documents do I need at reporting?', 39, now() - interval '48 minutes'),
('Is first-year hostel guaranteed?', 31, now() - interval '1 day'),
('Can I change branch between rounds?', 24, now() - interval '5 hours'),
('What is the tuition fee for B.Tech?', 22, now() - interval '2 hours'),
('Last date to freeze the seat?', 19, now() - interval '3 hours'),
('MCA CET eligibility criteria?', 14, now() - interval '7 hours'),
('Are TFWS seats available?', 11, now() - interval '1 day 3 hours'),
('Fee installment options available?', 9, now() - interval '2 hours 10 minutes'),
('When will Round 3 allotment be announced?', 7, now() - interval '9 hours');
