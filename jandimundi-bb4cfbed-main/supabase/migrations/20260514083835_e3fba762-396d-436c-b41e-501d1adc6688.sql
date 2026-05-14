CREATE TABLE public.player_predictions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  predictions jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.player_predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert player predictions"
  ON public.player_predictions FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can view player predictions"
  ON public.player_predictions FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can delete player predictions"
  ON public.player_predictions FOR DELETE
  TO anon, authenticated
  USING (true);

ALTER TABLE public.player_predictions REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.player_predictions;