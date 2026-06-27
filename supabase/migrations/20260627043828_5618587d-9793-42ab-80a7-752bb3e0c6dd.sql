-- 1. profiles_public_adviser_exposure
DROP POLICY IF EXISTS "Anyone can view section adviser profile" ON public.profiles;

-- 2. teachers_can_update_any_student_profile (tighten view + update)
DROP POLICY IF EXISTS "Teachers can update student profiles" ON public.profiles;
DROP POLICY IF EXISTS "Teachers can view student profiles" ON public.profiles;

CREATE POLICY "Teachers view enrolled student profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'teacher'::public.app_role)
  AND user_type = 'student'::public.user_type
  AND EXISTS (
    SELECT 1
    FROM public.sections s
    JOIN public.section_members sm ON sm.section_id = s.id
    WHERE s.teacher_id = auth.uid()
      AND sm.student_id = profiles.user_id
  )
);

CREATE POLICY "Teachers update enrolled student profiles"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'teacher'::public.app_role)
  AND user_type = 'student'::public.user_type
  AND EXISTS (
    SELECT 1
    FROM public.sections s
    JOIN public.section_members sm ON sm.section_id = s.id
    WHERE s.teacher_id = auth.uid()
      AND sm.student_id = profiles.user_id
  )
);

-- 3. sections_passcode_hash_public
REVOKE SELECT (join_passcode_hash) ON public.sections FROM anon, authenticated;

-- 4. user_roles_self_insert
DROP POLICY IF EXISTS "Users can insert their own role" ON public.user_roles;

-- 5. submissions_bucket_public_read + SUPA_public_bucket_allows_listing (submissions)
DROP POLICY IF EXISTS "Submissions are publicly readable" ON storage.objects;

CREATE POLICY "Students read own submissions"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'submissions'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

CREATE POLICY "Teachers read submissions for their activities"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'submissions'
  AND EXISTS (
    SELECT 1
    FROM public.activities a
    JOIN public.section_subjects ss ON ss.id = a.section_subject_id
    WHERE ss.teacher_id = auth.uid()
      AND position(a.id::text in name) > 0
  )
);

-- 6. SUPA_public_bucket_allows_listing (materials)
DROP POLICY IF EXISTS "Materials are publicly readable" ON storage.objects;

CREATE POLICY "Authenticated users read materials"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'materials');

-- 7 + 8. SUPA_{anon,authenticated}_security_definer_function_executable
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', r.sig);
  END LOOP;
END $$;

-- Re-grant only the functions needed by RLS evaluation and client RPCs.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_section_owner(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_section_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_section_subject(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_section_subject(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_approval_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_bootstrap_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_user_profile(text, text, text, public.user_type, text, text, public.school_level, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_section_join(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_section_join_passcode(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_section_join_passcode(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_quiz(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(uuid, public.app_role, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_admin_role(uuid) TO authenticated;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
