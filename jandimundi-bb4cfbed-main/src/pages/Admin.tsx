import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { LogOut, Save, Trash2, Shuffle, CheckCircle2, Zap, Radio } from "lucide-react";
import {
  ClubSymbol,
  CrownSymbol,
  SpadeSymbol,
  DiamondSymbol,
  FlagSymbol,
  HeartSymbol,
} from "@/components/JhandiSymbols";

const SYMBOLS = [
  { name: "Crown", Component: CrownSymbol },
  { name: "Diamond", Component: DiamondSymbol },
  { name: "Heart", Component: HeartSymbol },
  { name: "Spade", Component: SpadeSymbol },
  { name: "Flag", Component: FlagSymbol },
  { name: "Club", Component: ClubSymbol },
];

const PRESETS = [
  // 2x one symbol + 4 singles
  { label: "2 Crown + singles", result: [0, 0, 1, 2, 3, 4] },
  { label: "2 Diamond + singles", result: [1, 1, 0, 2, 3, 4] },
  { label: "2 Heart + singles", result: [2, 2, 0, 1, 3, 4] },
  { label: "2 Spade + singles", result: [3, 3, 0, 1, 2, 4] },
  { label: "2 Flag + singles", result: [4, 4, 0, 1, 2, 3] },
  { label: "2 Club + singles", result: [5, 5, 0, 1, 2, 3] },
  // 3+3 combos
  { label: "3 Crown + 3 Heart", result: [0, 0, 0, 2, 2, 2] },
  { label: "3 Diamond + 3 Spade", result: [1, 1, 1, 3, 3, 3] },
  { label: "3 Flag + 3 Club", result: [4, 4, 4, 5, 5, 5] },
  { label: "3 Crown + 3 Diamond", result: [0, 0, 0, 1, 1, 1] },
  { label: "3 Heart + 3 Flag", result: [2, 2, 2, 4, 4, 4] },
  { label: "3 Spade + 3 Club", result: [3, 3, 3, 5, 5, 5] },
  // Others
  { label: "4 Crown + 2 Heart", result: [0, 0, 0, 0, 2, 2] },
  { label: "4 Diamond + 2 Flag", result: [1, 1, 1, 1, 4, 4] },
  { label: "5 Spade + 1 Club", result: [3, 3, 3, 3, 3, 5] },
  { label: "All Different", result: [0, 1, 2, 3, 4, 5] },
  { label: "🎲 Random", result: "random" as const },
];

const normalizePrediction = (value: unknown): Record<string, number> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key, count]) => key !== "__syncAt" && typeof count === "number" && count > 0)
      .map(([key, count]) => [key, count as number])
  );
};

const getPredictionSyncAt = (value: unknown, fallback: string) => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const syncAt = (value as Record<string, unknown>).__syncAt;
    if (typeof syncAt === "number") return syncAt;
  }

  return new Date(fallback).getTime();
};

const getPredictionId = (row: { id?: string }) => row.id ?? "";

const Admin = () => {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentResult, setCurrentResult] = useState<number[]>([0, 0, 0, 0, 0, 0]);
  const [hasActiveResult, setHasActiveResult] = useState(false);
  const [activeResultId, setActiveResultId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [isRandomModeSelected, setIsRandomModeSelected] = useState(true);
  const [playerPrediction, setPlayerPrediction] = useState<Record<string, number> | null>(null);
  const [playerPredictionAt, setPlayerPredictionAt] = useState<string | null>(null);
  const [playerPredictionId, setPlayerPredictionId] = useState<string | null>(null);
  const navigate = useNavigate();

  // Player prediction subscription (the player's guess for this roll)
  useEffect(() => {
    if (!isAdmin) return;
    let isActive = true;

    const fetchLatest = async () => {
      const { data } = await supabase
        .from("player_predictions")
        .select("id, predictions, created_at")
        .order("created_at", { ascending: false })
        .limit(50);

      if (!isActive) return;

      if (data && data.length > 0) {
        const latest = data.reduce((best, row) => {
          const rowSyncAt = getPredictionSyncAt(row.predictions, row.created_at as string);
          const bestSyncAt = getPredictionSyncAt(best.predictions, best.created_at as string);
          if (rowSyncAt !== bestSyncAt) return rowSyncAt > bestSyncAt ? row : best;
          return getPredictionId(row) > getPredictionId(best) ? row : best;
        }, data[0]);
        setPlayerPrediction(normalizePrediction(latest.predictions));
        setPlayerPredictionAt(latest.created_at as string);
        setPlayerPredictionId(latest.id as string);
      } else {
        setPlayerPrediction(null);
        setPlayerPredictionAt(null);
        setPlayerPredictionId(null);
      }
    };
    fetchLatest();

    const channel = supabase
      .channel("player_predictions_admin")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "player_predictions" },
        () => { fetchLatest(); }
      )
      .subscribe();

    const intervalId = window.setInterval(fetchLatest, 1000);

    return () => {
      isActive = false;
      window.clearInterval(intervalId);
      supabase.removeChannel(channel);
    };
  }, [isAdmin]);

  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/admin-login");
        return;
      }
      const { data } = await supabase.rpc("has_role", {
        _user_id: session.user.id,
        _role: "admin",
      });
      if (!data) {
        await supabase.auth.signOut();
        navigate("/admin-login");
        return;
      }
      setIsAdmin(true);
      setLoading(false);
      fetchActiveResult();
    };
    checkAdmin();
  }, [navigate]);

  const fetchActiveResult = async () => {
    const { data, error } = await supabase
      .from("pre_decided_results")
      .select("*")
      .eq("used", false)
      .order("created_at", { ascending: false })
      .limit(1);

    if (!error && data && data.length > 0) {
      setCurrentResult(data[0].results);
      setHasActiveResult(true);
      setActiveResultId(data[0].id);
      setIsRandomModeSelected(false);
    } else {
      setHasActiveResult(false);
      setActiveResultId(null);
      setIsRandomModeSelected(true);
    }
  };

  const handleClear = async (options?: { showToast?: boolean }) => {
    await supabase.from("pre_decided_results").delete().neq("id", "00000000-0000-0000-0000-000000000000");

    if (options?.showToast !== false) {
      toast.success("Cleared! Rolls will be random now.");
    }

    setHasActiveResult(false);
    setActiveResultId(null);
    setIsRandomModeSelected(true);
    setCurrentResult([0, 0, 0, 0, 0, 0]);
  };

  const handleSave = async () => {
    setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setSaving(false);
      return;
    }

    if (isRandomModeSelected) {
      await handleClear({ showToast: false });
      setSaving(false);
      toast("Okay", { duration: 2000 });
      return;
    }

    await supabase.from("pre_decided_results").delete().neq("id", "00000000-0000-0000-0000-000000000000");

    const { error } = await supabase.from("pre_decided_results").insert({
      results: currentResult,
      created_by: session.user.id,
    });

    setSaving(false);
    if (error) {
      toast.error("Failed to save result");
      return;
    }
    toast("Okay", { duration: 2000 });
    fetchActiveResult();
  };

  const handleQuickSave = async (symbolIndex: number) => {
    const result = [symbolIndex, symbolIndex, symbolIndex, symbolIndex, symbolIndex, symbolIndex];
    setCurrentResult(result);
    setIsRandomModeSelected(false);

    setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setSaving(false);
      return;
    }

    await supabase.from("pre_decided_results").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    const { error } = await supabase.from("pre_decided_results").insert({
      results: result,
      created_by: session.user.id,
    });

    setSaving(false);
    if (error) {
      toast.error("Failed to save");
      return;
    }
    toast("Okay", { duration: 2000 });
    fetchActiveResult();
  };

  const handlePreset = async (preset: typeof PRESETS[number]) => {
    if (preset.result === "random") {
      await handleClear();
      return;
    }

    setIsRandomModeSelected(false);
    setCurrentResult([...preset.result]);
  };

  const handleQuickApplyPreset = async (result: number[]) => {
    setCurrentResult([...result]);
    setIsRandomModeSelected(false);
    setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setSaving(false); return; }
    await supabase.from("pre_decided_results").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    const { error } = await supabase.from("pre_decided_results").insert({
      results: result,
      created_by: session.user.id,
    });
    setSaving(false);
    if (error) { toast.error("Failed to apply"); return; }
    toast.success("Counter result applied!");
    fetchActiveResult();
  };

  const handleSetAll = (symbolIndex: number) => {
    setIsRandomModeSelected(false);
    setCurrentResult([symbolIndex, symbolIndex, symbolIndex, symbolIndex, symbolIndex, symbolIndex]);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/admin-login");
  };

  const handleSymbolChange = (dieIndex: number, symbolIndex: number) => {
    setIsRandomModeSelected(false);
    setCurrentResult((prev) => {
      const next = [...prev];
      next[dieIndex] = symbolIndex;
      return next;
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary/30" />
          <p className="text-muted-foreground text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-background">
      <div className="w-full bg-primary py-3 px-4 flex items-center justify-between shadow-md">
        <h1 className="text-lg font-bold text-primary-foreground tracking-tight">🎲 Admin Panel</h1>
        <Button variant="ghost" size="sm" onClick={handleLogout} className="text-primary-foreground hover:bg-primary-foreground/10">
          <LogOut size={16} className="mr-1" /> Logout
        </Button>
      </div>

      <div className="max-w-md mx-auto p-4 space-y-4">
        {/* LIVE player prediction (the player's guess for this roll) */}
        <div className={`rounded-xl border-2 p-4 transition-colors ${
          playerPrediction && Object.keys(playerPrediction).length > 0
            ? "bg-blue-50 border-blue-400 dark:bg-blue-950/30 dark:border-blue-600"
            : "bg-muted/40 border-dashed border-border"
        }`}>
          <div className="flex items-center gap-2 mb-2">
            <Radio size={16} className={playerPrediction && Object.keys(playerPrediction).length > 0 ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground"} />
            <h2 className="font-bold text-sm text-foreground">Live Player Prediction</h2>
            {playerPredictionAt && (
              <span className="text-[10px] text-muted-foreground ml-auto">
                {new Date(playerPredictionAt).toLocaleTimeString()}
              </span>
            )}
          </div>
          {playerPrediction && Object.keys(playerPrediction).length > 0 ? (
            <>
              <p className="text-xs text-muted-foreground mb-2">
                Player guessed these symbols will appear:
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {Object.entries(playerPrediction).map(([idx, count]) => {
                  const SymComp = SYMBOLS[Number(idx)]?.Component;
                  if (!SymComp) return null;
                  const numWord = ["", "one", "two", "three", "four", "five", "six"][count as number];
                  return (
                    <div
                      key={`${playerPredictionId}-${idx}`}
                      className="flex items-center gap-1.5 rounded-full pl-1.5 pr-3 py-1 border-2 border-blue-400 dark:border-blue-600 bg-card"
                    >
                      <div className="w-7 h-7 flex items-center justify-center bg-muted rounded-full">
                        <SymComp size={22} />
                      </div>
                      <span className="text-foreground font-bold text-sm">{numWord}</span>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-2">
              Waiting for player to predict...
            </p>
          )}

          {playerPrediction && Object.keys(playerPrediction).length > 0 && (() => {
            const scored = PRESETS
              .filter(p => p.result !== "random")
              .map(p => {
                const result = p.result as number[];
                let matched = 0;
                Object.entries(playerPrediction).forEach(([idx, count]) => {
                  const appears = result.filter(r => r === Number(idx)).length;
                  matched += Math.min(appears, count as number);
                });
                return { preset: p, matched };
              })
              .sort((a, b) => a.matched - b.matched)
              .slice(0, 3);

            return (
              <div className="mt-3 pt-3 border-t border-blue-200 dark:border-blue-800">
                <p className="text-[11px] font-bold text-blue-700 dark:text-blue-300 mb-2 uppercase tracking-wide">
                  💡 Counter Suggestions (player loses)
                </p>
                <div className="flex flex-col gap-1.5">
                  {scored.map(({ preset, matched }) => (
                    <button
                      key={preset.label}
                      onClick={() => void handleQuickApplyPreset(preset.result as number[])}
                      className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-card border border-blue-300 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-950/50 active:scale-[0.98] transition-all text-left"
                    >
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        {(preset.result as number[]).map((s, i) => {
                          const SymComp = SYMBOLS[s].Component;
                          return (
                            <div key={i} className="w-6 h-6 flex items-center justify-center shrink-0">
                              <SymComp size={20} />
                            </div>
                          );
                        })}
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                        matched === 0
                          ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                          : "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300"
                      }`}>
                        {matched === 0 ? "✓ All Wrong" : `${matched} hit`}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>

        <div className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
          hasActiveResult
            ? "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800"
            : "bg-muted border-border"
        }`}>
          {hasActiveResult ? (
            <CheckCircle2 className="text-green-600 dark:text-green-400 shrink-0" size={20} />
          ) : (
            <Shuffle className="text-muted-foreground shrink-0" size={20} />
          )}
          <div className="flex-1">
            <p className={`text-sm font-semibold ${hasActiveResult ? "text-green-800 dark:text-green-300" : "text-foreground"}`}>
              {hasActiveResult ? "Result is ACTIVE ✅" : "Random mode is ACTIVE 🎲"}
            </p>
            <p className="text-xs text-muted-foreground">
              {hasActiveResult ? "Every roll shows this result" : "Every roll will be different until you save a fixed result"}
            </p>
          </div>
          {hasActiveResult && (
            <Button variant="outline" size="sm" onClick={() => void handleClear()} className="text-destructive border-destructive/30 hover:bg-destructive/10 h-8 text-xs">
              <Trash2 size={14} className="mr-1" /> Clear
            </Button>
          )}
        </div>

        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Zap size={16} className="text-primary" />
            <h2 className="font-semibold text-foreground text-sm">One-Tap Set & Save</h2>
          </div>
          <p className="text-xs text-muted-foreground">Tap a symbol to instantly set all 6 dice and save:</p>
          <div className="grid grid-cols-6 gap-2">
            {SYMBOLS.map((sym, idx) => (
              <button
                key={sym.name}
                onClick={() => void handleQuickSave(idx)}
                disabled={saving}
                className="flex flex-col items-center gap-1 p-2 rounded-lg border border-border hover:border-primary hover:bg-primary/5 active:scale-95 transition-all disabled:opacity-50"
                title={`Set all to ${sym.name} & save`}
              >
                <sym.Component size={36} />
                <span className="text-[9px] text-muted-foreground font-medium">{sym.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <h2 className="font-semibold text-foreground text-sm">Quick Presets</h2>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                onClick={() => void handlePreset(preset)}
                className="px-3 py-1.5 text-xs font-medium rounded-full border border-border bg-muted/50 hover:bg-primary/10 hover:border-primary/30 active:scale-95 transition-all"
              >
                {preset.result === "random" && <Shuffle size={12} className="inline mr-1 -mt-0.5" />}
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <h2 className="font-semibold text-foreground text-sm">Set Each Die</h2>
          {isRandomModeSelected ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/40 px-4 py-5 text-center">
              <p className="text-sm font-semibold text-foreground">Random mode is on</p>
              <p className="text-xs text-muted-foreground mt-1">
                Every roll will be different. Pick a preset or use one-tap save if you want to control the result again.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-6 gap-2">
              {currentResult.map((symbolIdx, dieIndex) => (
                <div key={dieIndex} className="flex flex-col items-center gap-0.5">
                  <span className="text-[10px] text-muted-foreground font-bold">#{dieIndex + 1}</span>
                  <button
                    onClick={() => handleSymbolChange(dieIndex, (symbolIdx - 1 + 6) % 6)}
                    className="text-muted-foreground hover:text-foreground text-sm leading-none p-1 rounded hover:bg-muted transition-colors"
                  >
                    ▲
                  </button>
                  <div className="w-10 h-10 flex items-center justify-center bg-muted/50 rounded-lg border border-border">
                    {(() => {
                      const SymComp = SYMBOLS[symbolIdx].Component;
                      return <SymComp size={30} />;
                    })()}
                  </div>
                  <button
                    onClick={() => handleSymbolChange(dieIndex, (symbolIdx + 1) % 6)}
                    className="text-muted-foreground hover:text-foreground text-sm leading-none p-1 rounded hover:bg-muted transition-colors"
                  >
                    ▼
                  </button>
                  <span className="text-[8px] text-muted-foreground">{SYMBOLS[symbolIdx].name}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <h2 className="font-semibold text-foreground text-sm">Preview & Save</h2>
          {isRandomModeSelected ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/40 px-4 py-5 text-center">
              <p className="text-sm font-semibold text-foreground">Random mode active 🎲</p>
              <p className="text-xs text-muted-foreground mt-1">
                Nothing fixed is stored now, so every roll will show a different result automatically.
              </p>
            </div>
          ) : (
            <>
              <div className="flex justify-center gap-2 py-1">
                {currentResult.map((symbolIdx, i) => {
                  const SymComp = SYMBOLS[symbolIdx].Component;
                  return (
                    <div key={i} className="w-11 h-11 flex items-center justify-center bg-muted rounded-lg border border-border">
                      <SymComp size={34} />
                    </div>
                  );
                })}
              </div>
              <Button onClick={handleSave} className="w-full h-11" disabled={saving}>
                <Save size={16} className="mr-1.5" />
                {saving ? "Saving..." : "Save This Result"}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Admin;
