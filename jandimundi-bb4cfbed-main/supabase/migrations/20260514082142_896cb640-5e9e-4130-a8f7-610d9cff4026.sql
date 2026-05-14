CREATE TABLE public.live_predictions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  results integer[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.live_predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert live predictions"
  ON public.live_predictions FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can view live predictions"
  ON public.live_predictions FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can delete live predictions"
  ON public.live_predictions FOR DELETE
  TO anon, authenticated
  USING (true);

ALTER TABLE public.live_predictions REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_predictions;

CREATE INDEX live_predictions_created_at_idx ON public.live_predictions (created_at DESC);