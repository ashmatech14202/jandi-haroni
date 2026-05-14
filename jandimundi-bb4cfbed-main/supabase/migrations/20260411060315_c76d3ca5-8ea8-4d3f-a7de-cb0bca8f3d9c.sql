
-- Drop the admin-only select policy
DROP POLICY IF EXISTS "Admins can view pre_decided_results" ON public.pre_decided_results;

-- Allow all authenticated users to read (needed for realtime + game logic)
CREATE POLICY "Anyone can view pre_decided_results"
ON public.pre_decided_results
FOR SELECT
TO authenticated
USING (true);
