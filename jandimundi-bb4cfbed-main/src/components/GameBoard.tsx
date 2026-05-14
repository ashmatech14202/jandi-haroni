import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Volume2, Info } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  ClubSymbol,
  CrownSymbol,
  SpadeSymbol,
  DiamondSymbol,
  FlagSymbol,
  HeartSymbol,
} from "./JhandiSymbols";
import { Dice3D, getFaceRotation } from "./Dice3D";


const SYMBOLS = [
  { name: "Crown", Component: CrownSymbol },
  { name: "Diamond", Component: DiamondSymbol },
  { name: "Heart", Component: HeartSymbol },
  { name: "Spade", Component: SpadeSymbol },
  { name: "Flag", Component: FlagSymbol },
  { name: "Club", Component: ClubSymbol },
];

// Shared AudioContext for the roll
let rollAudioCtx: AudioContext | null = null;

// Play continuous dice shaking sound for 5 seconds with individual lock-in thuds
const playRollSound = (lockTimesMs: number[], ctx: AudioContext) => {
  try {
    rollAudioCtx = ctx;
    if (ctx.state === "suspended") ctx.resume();
    const sampleRate = ctx.sampleRate;
    const duration = 5;

    // === Main rolling/shaking sound ===
    const bufLen = Math.floor(sampleRate * duration);
    const buf = ctx.createBuffer(1, bufLen, sampleRate);
    const d = buf.getChannelData(0);

    // Rapid ticking clicks — like wooden dice tumbling on a hard surface
    let clickTimer = 0;
    for (let i = 0; i < bufLen; i++) {
      const t = i / sampleRate;
      clickTimer += 1 / sampleRate;

      // Click rate: fast initially, slows toward the end
      const baseInterval = 0.012;
      const slowFactor = t > 3.5 ? 1 + (t - 3.5) * 2.5 : 1;
      const currentInterval = baseInterval * slowFactor;

      // Volume fades as dice lock in
      const volumeEnv = t > 3.5 ? Math.max(0, 1 - (t - 3.5) / 1.5) : 1;

      if (clickTimer >= currentInterval) {
        clickTimer = 0;
        // Sharp wooden click
        const clickLen = Math.min(Math.floor(sampleRate * 0.005), bufLen - i);
        const pitch = 300 + Math.random() * 600; // varied pitch
        for (let j = 0; j < clickLen && (i + j) < bufLen; j++) {
          const env = Math.exp(-j / (sampleRate * 0.002));
          // Mix of noise + tone for wooden character
          d[i + j] += ((Math.random() * 2 - 1) * 0.4 + Math.sin(j / sampleRate * pitch * Math.PI * 2) * 0.3) * env * 0.25 * volumeEnv;
        }
      }

      // Subtle surface rumble
      const rumbleEnv = t > 3.5 ? Math.max(0, 1 - (t - 3.5) / 1.5) : 0.8;
      d[i] += Math.sin(t * 80 * Math.PI * 2) * 0.015 * rumbleEnv;
    }

    const src = ctx.createBufferSource();
    src.buffer = buf;

    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1500;
    bp.Q.value = 1.2;

    const gain = ctx.createGain();
    gain.gain.value = 0.7;

    src.connect(bp);
    bp.connect(gain);
    gain.connect(ctx.destination);
    src.start();

    // === Individual lock-in "thud" sounds for each die ===
    lockTimesMs.forEach((lockTime, idx) => {
      setTimeout(() => {
        try {
          const thudLen = Math.floor(sampleRate * 0.12);
          const thudBuf = ctx.createBuffer(1, thudLen, sampleRate);
          const td = thudBuf.getChannelData(0);
          const basePitch = 100 + Math.random() * 80; // slight pitch variation per die
          for (let i = 0; i < thudLen; i++) {
            const env = Math.exp(-i / (sampleRate * 0.03));
            // Deep thud + surface hit
            td[i] = (
              Math.sin(i / sampleRate * basePitch * Math.PI * 2) * 0.4 +
              (Math.random() * 2 - 1) * 0.3
            ) * env;
          }
          const thudSrc = ctx.createBufferSource();
          thudSrc.buffer = thudBuf;
          const thudGain = ctx.createGain();
          thudGain.gain.value = 0.6;
          thudSrc.connect(thudGain);
          thudGain.connect(ctx.destination);
          thudSrc.start();
        } catch (e) {
          return;
        }
      }, lockTime);
    });
  } catch (e) {
    // Audio not available
  }
};

const GameBoard: React.FC = () => {
  const [results, setResults] = useState<number[]>([]);
  const [isRolling, setIsRolling] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [shufflingSymbols, setShufflingSymbols] = useState<number[]>([0, 1, 2, 3, 4, 5]);
  const [diceRotX, setDiceRotX] = useState<number[]>([0, 0, 0, 0, 0, 0]);
  const [diceRotY, setDiceRotY] = useState<number[]>([0, 0, 0, 0, 0, 0]);
  const [shuffleOffsets, setShuffleOffsets] = useState<{x:number;y:number}[]>(
    [{x:0,y:0},{x:0,y:0},{x:0,y:0},{x:0,y:0},{x:0,y:0},{x:0,y:0}]
  );
  const [lockedDice, setLockedDice] = useState<boolean[]>([false, false, false, false, false, false]);
  const lockedRef = useRef<boolean[]>([false, false, false, false, false, false]);
  const [finalResults, setFinalResults] = useState<number[]>([]);
  const finalResultsRef = useRef<number[]>([]);
  const shuffleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rollStartRef = useRef<number>(0);
  const lockTimesRef = useRef<number[]>([]);
  const lockOrderRef = useRef<number[]>([]);
  const lastPresetKeyRef = useRef<string>("loading");
  const hasLoadedPresetRef = useRef(false);
  const hasSyncedPredictionRef = useRef(false);

  // Player's predictions: symbol index -> count guessed
  const [predictions, setPredictions] = useState<Record<number, number>>({});

  const addPrediction = (symIdx: number) => {
    if (isRolling) return;
    setPredictions((prev) => {
      const current = prev[symIdx] ?? 0;
      if (current >= 6) return prev;
      return { ...prev, [symIdx]: current + 1 };
    });
  };

  const removePrediction = (symIdx: number) => {
    setPredictions((prev) => {
      const current = prev[symIdx] ?? 0;
      if (current <= 1) {
        const next = { ...prev };
        delete next[symIdx];
        return next;
      }
      return { ...prev, [symIdx]: current - 1 };
    });
  };

  const clearPredictions = () => setPredictions({});

  const totalPredicted = Object.values(predictions).reduce((a, b) => a + b, 0);

  // Sync player predictions to Supabase so admin sees them live.
  // Include a client timestamp so admin can ignore stale writes that arrive late.
  useEffect(() => {
    const hasPrediction = Object.keys(predictions).length > 0;
    if (!hasPrediction && !hasSyncedPredictionRef.current) return;

    hasSyncedPredictionRef.current = true;
    const payload = { ...predictions, __syncAt: Date.now() };

    const handle = setTimeout(async () => {
      try {
        await supabase
          .from("player_predictions")
          .insert({ predictions: payload })
          .select("id")
          .single();
      } catch {
        return;
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [predictions]);

  // Poll active preset changes so players also see updates
  useEffect(() => {
    let isActive = true;

    const checkForPresetChange = async () => {
      const { data, error } = await supabase.rpc("get_active_predecided_result");
      if (!isActive || error) return;

      const nextPresetKey = Array.isArray(data) && data.length === 6
        ? data.join("-")
        : "random";

      if (!hasLoadedPresetRef.current) {
        hasLoadedPresetRef.current = true;
        lastPresetKeyRef.current = nextPresetKey;
        return;
      }

      if (lastPresetKeyRef.current !== nextPresetKey) {
        lastPresetKeyRef.current = nextPresetKey;
        toast("🎲 Game Updated!", { duration: 4000 });
      }
    };

    checkForPresetChange();
    const intervalId = window.setInterval(checkForPresetChange, 1500);

    return () => {
      isActive = false;
      window.clearInterval(intervalId);
    };
  }, []);

  // Rapidly shuffle symbols during rolling phase
  useEffect(() => {
    if (isRolling) {
      rollStartRef.current = Date.now();
      
      // Use pre-set results from rollDice (may be pre-decided or random)
      const newFinalResults = finalResultsRef.current;
      const initLocked = [false, false, false, false, false, false];
      setLockedDice(initLocked);
      lockedRef.current = initLocked;

      // Use pre-computed lock times from rollDice
      const lockTimes = lockTimesRef.current.length > 0 ? lockTimesRef.current : [4400, 4500, 4600, 4700, 4800, 4900];
      const lockOrder = lockOrderRef.current.length > 0 ? lockOrderRef.current : [0, 1, 2, 3, 4, 5].sort(() => Math.random() - 0.5);
      
      lockOrder.forEach((dieIndex, i) => {
        setTimeout(() => {
          lockedRef.current = [...lockedRef.current];
          lockedRef.current[dieIndex] = true;
          setLockedDice([...lockedRef.current]);
          setShufflingSymbols(prev => {
            const next = [...prev];
            next[dieIndex] = newFinalResults[dieIndex];
            return next;
          });
          // Snap to the final face rotation, with extra full spins for a nice settle
          const finalFace = getFaceRotation(newFinalResults[dieIndex]);
          setDiceRotX(prev => {
            const next = [...prev];
            const spins = Math.round(prev[dieIndex] / 360) * 360;
            next[dieIndex] = spins + 360 + finalFace.rx;
            return next;
          });
          setDiceRotY(prev => {
            const next = [...prev];
            const spins = Math.round(prev[dieIndex] / 360) * 360;
            next[dieIndex] = spins + 360 + finalFace.ry;
            return next;
          });
          setShuffleOffsets(prev => {
            const next = [...prev];
            next[dieIndex] = { x: 0, y: 0 };
            return next;
          });
        }, lockTimes[i]);
      });

      const updateShuffle = () => {
        const elapsed = (Date.now() - rollStartRef.current) / 1000;
        // Slower frame rate so each face is briefly readable
        const speed = Math.min(280, 200 + (elapsed / 5) * 80);

        setDiceRotX(prev =>
          prev.map((val, i) => lockedRef.current[i] ? val : val + 60 + Math.random() * 40)
        );
        setDiceRotY(prev =>
          prev.map((val, i) => lockedRef.current[i] ? val : val + 60 + Math.random() * 40)
        );
        setShuffleOffsets(prev =>
          prev.map((val, i) => lockedRef.current[i]
            ? { x: 0, y: 0 }
            : { x: (Math.random() - 0.5) * 60, y: (Math.random() - 0.5) * 50 }
          )
        );

        if (elapsed < 5) {
          shuffleRef.current = setTimeout(updateShuffle, speed);
        }
      };
      updateShuffle();
    } else {
      if (shuffleRef.current) {
        clearTimeout(shuffleRef.current);
        shuffleRef.current = null;
      }
    }
    return () => {
      if (shuffleRef.current) clearTimeout(shuffleRef.current);
    };
  }, [isRolling]);

  // Update shuffle to respect locked dice
  const rollDice = useCallback(async () => {
    if (isRolling) return;
    if (totalPredicted === 0) {
      toast("Please set a prediction first");
      return;
    }

    // Create AudioContext synchronously inside the user gesture so browsers allow playback
    const ctx = new AudioContext();
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        return;
      }
    }

    setResults([]);
    
    // Pre-compute lock times and order — dice land nearly together
    const lockTimes = [4400, 4500, 4600, 4700, 4800, 4900];
    const lockOrder = [0, 1, 2, 3, 4, 5].sort(() => Math.random() - 0.5);
    lockTimesRef.current = lockTimes;
    lockOrderRef.current = lockOrder;
    
    // Generate random results as default
    const randomResults = Array.from({ length: 6 }, () => Math.floor(Math.random() * 6));
    finalResultsRef.current = randomResults;
    setFinalResults(randomResults);

    // Admin pre-decided results override random
    try {
      const { data: preDecided } = await supabase.rpc("get_active_predecided_result");
      if (preDecided && Array.isArray(preDecided) && preDecided.length === 6) {
        finalResultsRef.current = preDecided;
        setFinalResults(preDecided);
      }
    } catch {
      // Fall back to random if DB call fails
    }

    // Pass lock times to sound so thuds sync with visual lock-ins
    const actualLockTimes = lockOrder.map((_, i) => lockTimes[i]);
    playRollSound(actualLockTimes, ctx);
    
    setIsRolling(true);

    setTimeout(() => {
      setResults(finalResultsRef.current);
      setIsRolling(false);
      setLockedDice([false, false, false, false, false, false]);
      lockedRef.current = [false, false, false, false, false, false];
      // Keep predictions visible until player manually clicks Clear
    }, 5000);
  }, [isRolling, totalPredicted]);

  const resetGame = () => {
    setResults([]);
    setIsRolling(false);
    setPredictions({});
  };

  // Count occurrences
  const counts: Record<number, number> = {};
  results.forEach((r) => {
    counts[r] = (counts[r] || 0) + 1;
  });

  const getCountLabel = (count: number) => {
    if (count === 1) return "Single";
    if (count === 2) return "Double";
    if (count === 3) return "Triple";
    if (count === 4) return "Four";
    if (count === 5) return "Five";
    if (count === 6) return "Six!";
    return "";
  };

  return (
    <div className="min-h-screen bg-background flex flex-col relative overflow-hidden">
      {/* Header */}
      <div className="w-full bg-primary py-4 px-4 flex items-center justify-center relative">
        <h1 className="text-2xl font-bold text-primary-foreground tracking-wide select-none">
          Jhandi Munda
        </h1>
        <div className="absolute right-4 flex items-center gap-3">
          <button className="text-primary-foreground opacity-80 hover:opacity-100 transition-opacity">
            <Volume2 size={22} />
          </button>
          <button
            className="text-primary-foreground opacity-80 hover:opacity-100 transition-opacity"
            onClick={() => setShowInfo(!showInfo)}
          >
            <Info size={22} />
          </button>
        </div>
      </div>

      {/* Info popup */}
      <AnimatePresence>
        {showInfo && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mx-4 mt-2 p-4 bg-card rounded-xl border border-border text-sm text-foreground"
          >
            <p className="font-bold mb-1">How to play:</p>
            <p className="text-muted-foreground">
              Tap "Roll" to throw 6 dice. Each die shows one of 6 symbols randomly. 
              See how many singles, doubles, triples, or more you get!
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-6 gap-6">
        {/* 6 Symbol grid */}
        <div className="grid grid-cols-3 gap-4 w-full max-w-sm justify-items-center">
          {isRolling
            ? shufflingSymbols.map((_, i) => (
                <Dice3D
                  key={`rolling-${i}`}
                  size={100}
                  rotateX={diceRotX[i]}
                  rotateY={diceRotY[i]}
                  x={shuffleOffsets[i].x}
                  y={shuffleOffsets[i].y}
                  isLocked={lockedDice[i]}
                  scaleAnim={lockedDice[i] ? [1.15, 1] : [1, 0.95, 1]}
                />
              ))
            : results.length > 0
              ? results.map((symbolIndex, i) => {
                  const face = getFaceRotation(symbolIndex);
                  return (
                    <motion.div
                      key={`result-${i}`}
                      initial={{ opacity: 0, scale: 0.2 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.08, duration: 0.4, type: "spring", stiffness: 200 }}
                    >
                      <Dice3D
                        size={100}
                        rotateX={face.rx}
                        rotateY={face.ry}
                        isLocked
                      />
                    </motion.div>
                  );
                })
              : SYMBOLS.map((_, i) => {
                  const face = getFaceRotation(i);
                  return (
                    <motion.div
                      key={`default-${i}`}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                    >
                      <Dice3D
                        size={100}
                        rotateX={face.rx}
                        rotateY={face.ry}
                        isLocked
                      />
                    </motion.div>
                  );
                })}
        </div>

        {/* Result badges */}
        <AnimatePresence>
          {results.length > 0 && !isRolling && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex flex-wrap gap-2 justify-center"
            >
              {Object.entries(counts).map(([idx, count]) => {
                const SymbolComp = SYMBOLS[Number(idx)].Component;
                return (
                  <div
                    key={idx}
                    className="flex items-center gap-1.5 bg-card border border-border rounded-full px-3 py-1.5"
                  >
                    <SymbolComp size={22} />
                    <span className="text-foreground font-bold text-xs">
                      {getCountLabel(count)}
                    </span>
                  </div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Predict section */}
        <div className="w-full max-w-sm flex flex-col gap-2">
          {/* Selected prediction chips */}
          {totalPredicted > 0 && (
            <div className="flex flex-wrap gap-2 justify-center">
              {Object.entries(predictions).map(([idx, count]) => {
                const SymComp = SYMBOLS[Number(idx)].Component;
                const numWord = ["", "one", "two", "three", "four", "five", "six"][count];
                const matched = results.length > 0
                  ? results.filter((r) => r === Number(idx)).length
                  : 0;
                const isCorrect = results.length > 0 && matched >= count;
                return (
                  <button
                    key={idx}
                    onClick={() => removePrediction(Number(idx))}
                    disabled={isRolling}
                    className={`flex items-center gap-1.5 rounded-full pl-1.5 pr-3 py-1 border-2 transition-all ${
                      results.length > 0
                        ? isCorrect
                          ? "border-green-500 bg-green-50 dark:bg-green-950/30"
                          : "border-red-400 bg-red-50 dark:bg-red-950/30 opacity-70"
                        : "border-primary bg-primary/10"
                    }`}
                  >
                    <div className="w-7 h-7 flex items-center justify-center bg-card rounded-full">
                      <SymComp size={22} />
                    </div>
                    <span className="text-foreground font-bold text-sm">{numWord}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Predict picker */}
          <div className="bg-card border border-border rounded-2xl p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-foreground">Your Prediction</p>
              {totalPredicted > 0 && (
                <button
                  onClick={clearPredictions}
                  disabled={isRolling}
                  className="text-xs font-bold text-primary bg-primary/10 hover:bg-primary/20 border border-primary/30 px-3 py-1 rounded-full transition-colors uppercase tracking-wide"
                >
                  ✕ Clear
                </button>
              )}
            </div>
            <div className="grid grid-cols-6 gap-1.5">
              {SYMBOLS.map((sym, i) => {
                const Sym = sym.Component;
                const count = predictions[i] ?? 0;
                return (
                  <button
                    key={i}
                    onClick={() => addPrediction(i)}
                    disabled={isRolling}
                    className={`relative aspect-square flex items-center justify-center rounded-xl border-2 transition-all active:scale-95 ${
                      count > 0
                        ? "border-primary bg-primary/10"
                        : "border-border bg-muted/30 hover:border-primary/40"
                    }`}
                  >
                    <Sym size={32} />
                    {count > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex gap-4 w-full max-w-sm mt-2">
          <motion.button
            onClick={() => {
              if (totalPredicted === 0) {
                toast("Please set a prediction first");
                return;
              }
              rollDice();
            }}
            disabled={isRolling || totalPredicted === 0}
            className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-full bg-primary text-primary-foreground font-bold text-base disabled:opacity-50 disabled:cursor-not-allowed"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
          >
            🎲 Roll
          </motion.button>
          <motion.button
            onClick={resetGame}
            disabled={isRolling || results.length === 0}
            className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-full bg-primary text-primary-foreground font-bold text-base disabled:opacity-40 disabled:cursor-not-allowed"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
          >
            ↻ Reset
          </motion.button>
        </div>
      </div>

      
    </div>
  );
};

export default GameBoard;
