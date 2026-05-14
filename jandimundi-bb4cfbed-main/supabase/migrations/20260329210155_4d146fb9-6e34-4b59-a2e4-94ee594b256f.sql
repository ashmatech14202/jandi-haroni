-- Remove old queue data
DELETE FROM pre_decided_results;

-- Drop old function
DROP FUNCTION IF EXISTS public.get_next_predecided_result();

-- Create new function that returns the single active result
CREATE OR REPLACE FUNCTION public.get_active_predecided_result()
 RETURNS integer[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result_row pre_decided_results;
BEGIN
  SELECT * INTO result_row
  FROM pre_decided_results
  WHERE used = false
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF result_row IS NULL THEN
    RETURN NULL;
  END IF;
  
  RETURN result_row.results;
END;
$function$