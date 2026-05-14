-- Create role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Admins can view all roles
CREATE POLICY "Admins can view roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Create pre_decided_results table
CREATE TABLE public.pre_decided_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  results INTEGER[] NOT NULL CHECK (array_length(results, 1) = 6),
  used BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.pre_decided_results ENABLE ROW LEVEL SECURITY;

-- Only admins can manage pre-decided results
CREATE POLICY "Admins can view pre_decided_results"
ON public.pre_decided_results FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert pre_decided_results"
ON public.pre_decided_results FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update pre_decided_results"
ON public.pre_decided_results FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete pre_decided_results"
ON public.pre_decided_results FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Function to get and mark the next pre-decided result
CREATE OR REPLACE FUNCTION public.get_next_predecided_result()
RETURNS INTEGER[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result_row pre_decided_results;
BEGIN
  SELECT * INTO result_row
  FROM pre_decided_results
  WHERE used = false
  ORDER BY sort_order ASC, created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;
  
  IF result_row IS NULL THEN
    RETURN NULL;
  END IF;
  
  UPDATE pre_decided_results SET used = true WHERE id = result_row.id;
  
  RETURN result_row.results;
END;
$$;