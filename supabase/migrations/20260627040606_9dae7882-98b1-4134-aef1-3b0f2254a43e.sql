-- Storage policies for banners + media buckets
DROP POLICY IF EXISTS "Banner images are publicly readable" ON storage.objects;
CREATE POLICY "Banner images are publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'banners');

DROP POLICY IF EXISTS "Admins can upload banner images" ON storage.objects;
CREATE POLICY "Admins can upload banner images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'banners' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update banner images" ON storage.objects;
CREATE POLICY "Admins can update banner images"
ON storage.objects FOR UPDATE
USING (bucket_id = 'banners' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can delete banner images" ON storage.objects;
CREATE POLICY "Admins can delete banner images"
ON storage.objects FOR DELETE
USING (bucket_id = 'banners' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Media files are publicly readable" ON storage.objects;
CREATE POLICY "Media files are publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'media');

DROP POLICY IF EXISTS "Authenticated users can upload media" ON storage.objects;
CREATE POLICY "Authenticated users can upload media"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'media'
  AND auth.uid() IS NOT NULL
  AND auth.uid()::text = (storage.foldername(name))[2]
);

DROP POLICY IF EXISTS "Users can update own media" ON storage.objects;
CREATE POLICY "Users can update own media"
ON storage.objects FOR UPDATE
USING (bucket_id = 'media' AND auth.uid()::text = (storage.foldername(name))[2]);

DROP POLICY IF EXISTS "Users can delete own media" ON storage.objects;
CREATE POLICY "Users can delete own media"
ON storage.objects FOR DELETE
USING (bucket_id = 'media' AND auth.uid()::text = (storage.foldername(name))[2]);

ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS image_url TEXT;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  meta jsonb := NEW.raw_user_meta_data;
  profile_user_type public.user_type;
  profile_approval public.approval_status := 'pending';
BEGIN
  IF meta->>'first_name' IS NULL OR meta->>'last_name' IS NULL OR meta->>'user_type' IS NULL THEN
    RETURN NEW;
  END IF;
  profile_user_type := (meta->>'user_type')::public.user_type;
  IF lower(NEW.email) = 'sheethappenswithjaa@gmail.com' THEN
    profile_approval := 'approved';
    profile_user_type := COALESCE(profile_user_type, 'teacher'::public.user_type);
  END IF;
  INSERT INTO public.profiles (user_id, first_name, last_name, email, contact_number, user_type, school, grade_level, school_level, subject_taught, approval_status)
  VALUES (NEW.id, meta->>'first_name', meta->>'last_name', NEW.email, COALESCE(meta->>'contact_number',''), profile_user_type, NULLIF(meta->>'school',''), NULLIF(meta->>'grade_level',''), NULLIF(meta->>'school_level','')::public.school_level, NULLIF(meta->>'subject_taught',''), profile_approval)
  ON CONFLICT (user_id) DO NOTHING;
  IF lower(NEW.email) = 'sheethappenswithjaa@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id,'admin'),(NEW.id,'teacher') ON CONFLICT (user_id,role) DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.create_user_profile(_first_name text,_last_name text,_contact_number text,_user_type public.user_type,_school text DEFAULT NULL,_grade_level text DEFAULT NULL,_school_level public.school_level DEFAULT NULL,_subject_taught text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); user_email text; profile_approval public.approval_status := 'pending'; profile_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT email INTO user_email FROM auth.users WHERE id = uid;
  IF lower(user_email) = 'sheethappenswithjaa@gmail.com' THEN profile_approval := 'approved'; END IF;
  INSERT INTO public.profiles (user_id, first_name, last_name, email, contact_number, user_type, school, grade_level, school_level, subject_taught, approval_status)
  VALUES (uid,_first_name,_last_name,user_email,_contact_number,_user_type,_school,_grade_level,_school_level,_subject_taught,profile_approval)
  ON CONFLICT (user_id) DO UPDATE SET first_name=EXCLUDED.first_name,last_name=EXCLUDED.last_name,contact_number=EXCLUDED.contact_number,user_type=EXCLUDED.user_type,school=EXCLUDED.school,grade_level=EXCLUDED.grade_level,school_level=EXCLUDED.school_level,subject_taught=EXCLUDED.subject_taught,
  approval_status = CASE WHEN lower(EXCLUDED.email)='sheethappenswithjaa@gmail.com' THEN 'approved'::public.approval_status ELSE public.profiles.approval_status END,
  updated_at=now() RETURNING id INTO profile_id;
  IF lower(user_email)='sheethappenswithjaa@gmail.com' THEN
    PERFORM public.grant_admin_role(uid);
    INSERT INTO public.user_roles (user_id, role) VALUES (uid,'teacher') ON CONFLICT (user_id,role) DO NOTHING;
  END IF;
  RETURN profile_id;
END; $$;

GRANT EXECUTE ON FUNCTION public.create_user_profile(text,text,text,public.user_type,text,text,public.school_level,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.grant_admin_role(_user_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role) VALUES (_user_id,'admin') ON CONFLICT (user_id,role) DO NOTHING;
  UPDATE public.profiles SET approval_status='approved', approved_by=COALESCE(approved_by,_user_id), updated_at=now() WHERE user_id=_user_id;
  RETURN TRUE;
END; $$;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_data text;
ALTER TABLE public.section_messages ADD COLUMN IF NOT EXISTS sender_name text;

CREATE OR REPLACE FUNCTION public.is_bootstrap_admin(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE user_id=_user_id AND lower(email)='sheethappenswithjaa@gmail.com')
$$;

CREATE OR REPLACE FUNCTION public.admin_set_user_role(_target_user_id UUID,_role public.app_role,_grant BOOLEAN)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF public.is_bootstrap_admin(_target_user_id) THEN RAISE EXCEPTION 'Cannot modify the default admin account'; END IF;
  IF _grant THEN INSERT INTO public.user_roles (user_id, role) VALUES (_target_user_id,_role) ON CONFLICT (user_id,role) DO NOTHING;
  ELSE DELETE FROM public.user_roles WHERE user_id=_target_user_id AND role=_role; END IF;
  RETURN TRUE;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_delete_user(_target_user_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF public.is_bootstrap_admin(_target_user_id) THEN RAISE EXCEPTION 'Cannot delete the default admin account'; END IF;
  IF _target_user_id = auth.uid() THEN RAISE EXCEPTION 'Cannot delete your own account from the admin dashboard'; END IF;
  DELETE FROM auth.users WHERE id=_target_user_id;
  RETURN TRUE;
END; $$;

GRANT EXECUTE ON FUNCTION public.admin_set_user_role(UUID,public.app_role,BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(UUID) TO authenticated;

DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
CREATE POLICY "Admins can update any profile" ON public.profiles FOR UPDATE
USING (public.has_role(auth.uid(),'admin') AND lower(email)<>'sheethappenswithjaa@gmail.com');

DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
CREATE POLICY "Admins can delete roles" ON public.user_roles FOR DELETE
USING (public.has_role(auth.uid(),'admin') AND NOT public.is_bootstrap_admin(user_id));

CREATE TABLE IF NOT EXISTS public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT '',
  content TEXT,
  image_data TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.events TO authenticated;
GRANT SELECT ON public.events TO anon;
GRANT ALL ON public.events TO service_role;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view active events" ON public.events;
CREATE POLICY "Anyone can view active events" ON public.events FOR SELECT USING (is_active = true);
DROP POLICY IF EXISTS "Admins can view all events" ON public.events;
CREATE POLICY "Admins can view all events" ON public.events FOR SELECT USING (public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "Admins can insert events" ON public.events;
CREATE POLICY "Admins can insert events" ON public.events FOR INSERT WITH CHECK (public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "Admins can update events" ON public.events;
CREATE POLICY "Admins can update events" ON public.events FOR UPDATE USING (public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "Admins can delete events" ON public.events;
CREATE POLICY "Admins can delete events" ON public.events FOR DELETE USING (public.has_role(auth.uid(),'admin'));
DROP TRIGGER IF EXISTS update_events_updated_at ON public.events;
CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.events; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.event_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  image_data TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_images TO authenticated;
GRANT SELECT ON public.event_images TO anon;
GRANT ALL ON public.event_images TO service_role;
CREATE INDEX IF NOT EXISTS event_images_event_id_idx ON public.event_images(event_id);

INSERT INTO public.event_images (event_id, image_data, sort_order)
SELECT id, image_data, 0 FROM public.events
WHERE image_data IS NOT NULL AND trim(image_data) <> '';

ALTER TABLE public.events DROP COLUMN IF EXISTS image_data;
ALTER TABLE public.event_images ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view images of active events" ON public.event_images;
CREATE POLICY "Anyone can view images of active events" ON public.event_images FOR SELECT
USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id=event_images.event_id AND e.is_active=true));
DROP POLICY IF EXISTS "Admins can view all event images" ON public.event_images;
CREATE POLICY "Admins can view all event images" ON public.event_images FOR SELECT USING (public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "Admins can insert event images" ON public.event_images;
CREATE POLICY "Admins can insert event images" ON public.event_images FOR INSERT WITH CHECK (public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "Admins can update event images" ON public.event_images;
CREATE POLICY "Admins can update event images" ON public.event_images FOR UPDATE USING (public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "Admins can delete event images" ON public.event_images;
CREATE POLICY "Admins can delete event images" ON public.event_images FOR DELETE USING (public.has_role(auth.uid(),'admin'));
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.event_images; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.section_messages
  ADD COLUMN IF NOT EXISTS recipient_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS reply_to_id uuid REFERENCES public.section_messages(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_section_messages_private ON public.section_messages (section_id, recipient_id, created_at);
CREATE INDEX IF NOT EXISTS idx_section_messages_reply ON public.section_messages (reply_to_id);

DROP POLICY IF EXISTS "Members and adviser view section messages" ON public.section_messages;
DROP POLICY IF EXISTS "Members and adviser send messages" ON public.section_messages;
DROP POLICY IF EXISTS "View section group and private messages" ON public.section_messages;
DROP POLICY IF EXISTS "Send section group and private messages" ON public.section_messages;

CREATE POLICY "View section group and private messages" ON public.section_messages FOR SELECT
USING (
  (recipient_id IS NULL AND (public.is_section_member(section_id, auth.uid()) OR public.is_section_owner(section_id, auth.uid())))
  OR (recipient_id IS NOT NULL AND (auth.uid()=user_id OR auth.uid()=recipient_id)
      AND (public.is_section_member(section_id, auth.uid()) OR public.is_section_owner(section_id, auth.uid())))
);
CREATE POLICY "Send section group and private messages" ON public.section_messages FOR INSERT
WITH CHECK (
  auth.uid()=user_id
  AND (public.is_section_member(section_id, auth.uid()) OR public.is_section_owner(section_id, auth.uid()))
  AND (recipient_id IS NULL OR (recipient_id<>auth.uid()
       AND (public.is_section_member(section_id, recipient_id) OR public.is_section_owner(section_id, recipient_id))))
);

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER TABLE public.sections ADD COLUMN IF NOT EXISTS join_passcode_hash TEXT;
UPDATE public.sections SET join_passcode_hash = extensions.crypt('0000', extensions.gen_salt('bf')) WHERE join_passcode_hash IS NULL;
REVOKE SELECT (join_passcode_hash) ON public.sections FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.hash_join_passcode(p_passcode text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF p_passcode IS NULL OR p_passcode !~ '^\d{4}$' THEN RAISE EXCEPTION 'Passcode must be exactly 4 digits'; END IF;
  RETURN extensions.crypt(p_passcode, extensions.gen_salt('bf'));
END; $$;

CREATE OR REPLACE FUNCTION public.set_section_join_passcode(p_section_id uuid, p_passcode text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (public.is_section_owner(p_section_id, auth.uid()) OR public.has_role(auth.uid(),'admin')) THEN
    RAISE EXCEPTION 'Not authorized to set section passcode';
  END IF;
  UPDATE public.sections SET join_passcode_hash = public.hash_join_passcode(p_passcode) WHERE id = p_section_id;
END; $$;

CREATE OR REPLACE FUNCTION public.verify_section_join_passcode(p_section_id uuid, p_passcode text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sections s
    WHERE s.id=p_section_id AND s.is_active=true AND s.join_passcode_hash IS NOT NULL
      AND s.join_passcode_hash = extensions.crypt(p_passcode, s.join_passcode_hash)
  );
$$;

CREATE OR REPLACE FUNCTION public.request_section_join(p_section_id uuid, p_passcode text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_status public.approval_status;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.has_role(auth.uid(),'student') THEN RAISE EXCEPTION 'Only students can request to join sections'; END IF;
  IF NOT public.verify_section_join_passcode(p_section_id, p_passcode) THEN RAISE EXCEPTION 'Invalid passcode'; END IF;
  IF EXISTS (SELECT 1 FROM public.section_members WHERE section_id=p_section_id AND student_id=auth.uid()) THEN
    RAISE EXCEPTION 'You are already a member of this section';
  END IF;
  SELECT status INTO v_status FROM public.section_join_requests WHERE section_id=p_section_id AND student_id=auth.uid();
  IF v_status='pending' THEN RAISE EXCEPTION 'Request already sent'; END IF;
  IF v_status='rejected' THEN
    UPDATE public.section_join_requests SET status='pending', reviewed_at=NULL, reviewed_by=NULL, updated_at=now()
    WHERE section_id=p_section_id AND student_id=auth.uid();
    RETURN;
  END IF;
  IF v_status IS NULL THEN
    INSERT INTO public.section_join_requests (section_id, student_id, status) VALUES (p_section_id, auth.uid(),'pending');
  END IF;
END; $$;

REVOKE ALL ON FUNCTION public.hash_join_passcode(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_section_join_passcode(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_section_join(uuid, text) TO authenticated;

DROP POLICY IF EXISTS "Students can create their own requests" ON public.section_join_requests;

ALTER TABLE public.sections ADD COLUMN IF NOT EXISTS cover_image_data text;

CREATE TABLE IF NOT EXISTS public.student_term_grades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_subject_id UUID NOT NULL REFERENCES public.section_subjects(id) ON DELETE CASCADE,
  student_id UUID NOT NULL,
  term SMALLINT NOT NULL CHECK (term IN (1,2,3)),
  final_average NUMERIC(5,2) NOT NULL CHECK (final_average >= 0 AND final_average <= 100),
  entered_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (section_subject_id, student_id, term)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_term_grades TO authenticated;
GRANT ALL ON public.student_term_grades TO service_role;
CREATE INDEX IF NOT EXISTS student_term_grades_ss_student_idx ON public.student_term_grades (section_subject_id, student_id);
ALTER TABLE public.student_term_grades ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS update_student_term_grades_updated_at ON public.student_term_grades;
CREATE TRIGGER update_student_term_grades_updated_at BEFORE UPDATE ON public.student_term_grades FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP POLICY IF EXISTS "Students view own term grades" ON public.student_term_grades;
CREATE POLICY "Students view own term grades" ON public.student_term_grades FOR SELECT USING (auth.uid()=student_id);
DROP POLICY IF EXISTS "Assigned teachers view term grades" ON public.student_term_grades;
CREATE POLICY "Assigned teachers view term grades" ON public.student_term_grades FOR SELECT USING (public.can_manage_section_subject(section_subject_id, auth.uid()));
DROP POLICY IF EXISTS "Admins view all term grades" ON public.student_term_grades;
CREATE POLICY "Admins view all term grades" ON public.student_term_grades FOR SELECT USING (public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "Assigned teachers manage term grades" ON public.student_term_grades;
CREATE POLICY "Assigned teachers manage term grades" ON public.student_term_grades FOR INSERT WITH CHECK (public.can_manage_section_subject(section_subject_id, auth.uid()) AND entered_by=auth.uid());
DROP POLICY IF EXISTS "Assigned teachers update term grades" ON public.student_term_grades;
CREATE POLICY "Assigned teachers update term grades" ON public.student_term_grades FOR UPDATE USING (public.can_manage_section_subject(section_subject_id, auth.uid()));
DROP POLICY IF EXISTS "Assigned teachers delete term grades" ON public.student_term_grades;
CREATE POLICY "Assigned teachers delete term grades" ON public.student_term_grades FOR DELETE USING (public.can_manage_section_subject(section_subject_id, auth.uid()));
DROP POLICY IF EXISTS "Admins manage term grades" ON public.student_term_grades;
CREATE POLICY "Admins manage term grades" ON public.student_term_grades FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));