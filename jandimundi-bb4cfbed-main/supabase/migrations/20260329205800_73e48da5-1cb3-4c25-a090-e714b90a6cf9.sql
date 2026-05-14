CREATE OR REPLACE FUNCTION public.get_next_predecided_result()
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
  ORDER BY sort_order ASC, created_at ASC
  LIMIT 1;
  
  IF result_row IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Do NOT mark as used - keep returning the same result every roll
  RETURN result_row.results;
END;
$function$