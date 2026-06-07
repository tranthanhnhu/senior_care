-- ============================================================
-- Senior Care Assistant - Supabase Schema
-- Chay toan bo file nay trong Supabase SQL Editor
-- ============================================================

-- Bang thuoc
CREATE TABLE IF NOT EXISTS public.medications (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    time        TEXT NOT NULL,          -- dinh dang HH:MM (24h)
    dose        TEXT DEFAULT '',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Bang danh ba
CREATE TABLE IF NOT EXISTS public.contacts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    phone       TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Bang log xac nhan da uong thuoc
CREATE TABLE IF NOT EXISTS public.medication_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    medication_id   UUID NOT NULL REFERENCES public.medications(id) ON DELETE CASCADE,
    taken_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Index tang toc truy van theo user
CREATE INDEX IF NOT EXISTS idx_medications_user ON public.medications(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_user ON public.contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_medication_logs_user ON public.medication_logs(user_id);

-- Bat Row Level Security
ALTER TABLE public.medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medication_logs ENABLE ROW LEVEL SECURITY;

-- Policies: medications
CREATE POLICY "Users read own medications"
    ON public.medications FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users insert own medications"
    ON public.medications FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own medications"
    ON public.medications FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users delete own medications"
    ON public.medications FOR DELETE
    USING (auth.uid() = user_id);

-- Policies: contacts
CREATE POLICY "Users read own contacts"
    ON public.contacts FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users insert own contacts"
    ON public.contacts FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own contacts"
    ON public.contacts FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users delete own contacts"
    ON public.contacts FOR DELETE
    USING (auth.uid() = user_id);

-- Policies: medication_logs
CREATE POLICY "Users read own logs"
    ON public.medication_logs FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users insert own logs"
    ON public.medication_logs FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own logs"
    ON public.medication_logs FOR DELETE
    USING (auth.uid() = user_id);
