-- Allow anon to EXECUTE RLS helper functions so policy expressions evaluate to false
-- instead of raising "permission denied" (which PostgREST surfaces as HTTP 401).
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon;
GRANT EXECUTE ON FUNCTION public.can_view_section_subject(uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_section_owner(uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_section_member(uuid, uuid) TO anon;
