
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['staff','kb_sections','call_lines','calls','call_transcripts','common_queries','app_settings']) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || ' write', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'staff write all', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'kb write', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'lines write', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'calls write', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'transcripts write', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'cq write', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'settings write', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL)', t || '_ins', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL)', t || '_upd', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL)', t || '_del', t);
  END LOOP;
END$$;
