-- Repair the bootstrap admin account when its profile row is missing.
--
-- The app used to only *update* an existing profiles row when granting admin
-- access, so an account created before the auth trigger (or re-created /
-- migrated outside signup) stayed on the "Complete your profile" screen even
-- though it was the configured admin. This makes grant_admin_role create a
-- default profile for the bootstrap admin and keeps it approved.

CREATE OR REPLACE FUNCTION public.grant_admin_role(_user_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  target_email TEXT;
BEGIN
  SELECT lower(email) INTO target_email FROM auth.users WHERE id = _user_id;

  -- This RPC is executable by any signed-in user, so enforce the same
  -- restriction the UI already assumes: only the configured admin account.
  IF target_email IS DISTINCT FROM 'sheethappenswithjaa@gmail.com' THEN
    RAISE EXCEPTION 'Admin access is restricted to the authorized account';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_user_id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Only the configured bootstrap admin is auto-provisioned. Other accounts
  -- still have to complete their profile themselves.
  INSERT INTO public.profiles (
    user_id, first_name, last_name, email, contact_number,
    user_type, subject_taught, approval_status
  )
  SELECT u.id, 'BNHS', 'Admin', u.email, '', 'teacher', 'Administration', 'approved'
  FROM auth.users u
  WHERE u.id = _user_id
    AND lower(u.email) = 'sheethappenswithjaa@gmail.com'
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_user_id, 'teacher')
  ON CONFLICT (user_id, role) DO NOTHING;

  UPDATE public.profiles
  SET approval_status = 'approved',
      approved_by = COALESCE(approved_by, _user_id),
      updated_at = now()
  WHERE user_id = _user_id;

  RETURN TRUE;
END; $$;

GRANT EXECUTE ON FUNCTION public.grant_admin_role(uuid) TO authenticated;
