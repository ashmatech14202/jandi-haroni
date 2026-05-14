import { motion } from "framer-motion";
import {
  ClubSymbol,
  CrownSymbol,
  SpadeSymbol,
  DiamondSymbol,
  FlagSymbol,
  HeartSymbol,
} from "./JhandiSymbols";

// Index matches GameBoard SYMBOLS order: Crown, Diamond, Heart, Spade, Flag, Club
const FACE_SYMBOLS = [
  CrownSymbol,
  DiamondSymbol,
  HeartSymbol,
  SpadeSymbol,
  FlagSymbol,
  ClubSymbol,
];

// Rotation needed to bring face index i to the front
// Faces order: 0=front, 1=back, 2=right, 3=left, 4=top, 5=bottom
const FACE_ROTATIONS: { rx: number; ry: number }[] = [
  { rx: 0, ry: 0 },       // Crown - front
  { rx: 0, ry: 180 },     // Diamond - back
  { rx: 0, ry: -90 },     // Heart - right
  { rx: 0, ry: 90 },      // Spade - left
  { rx: -90, ry: 0 },     // Flag - top
  { rx: 90, ry: 0 },      // Club - bottom
];

interface Dice3DProps {
  size?: number;
  rotateX: number;
  rotateY: number;
  rotateZ?: number;
  x?: number;
  y?: number;
  isLocked: boolean;
  scaleAnim?: number[];
}

export const Dice3D: React.FC<Dice3DProps> = ({
  size = 90,
  rotateX,
  rotateY,
  rotateZ = 0,
  x = 0,
  y = 0,
  isLocked,
  scaleAnim,
}) => {
  const half = size / 2;
  const radius = Math.max(12, size * 0.18);

  const baseFace: React.CSSProperties = {
    position: "absolute",
    width: size,
    height: size,
    borderRadius: radius,
    backfaceVisibility: "hidden",
    background:
      "radial-gradient(circle at 30% 25%, #ffffff 0%, #fafaf7 55%, #ececea 100%)",
    boxShadow:
      "inset 0 0 0 1px rgba(0,0,0,0.06), inset 0 -10px 22px rgba(0,0,0,0.08), inset 0 10px 18px rgba(255,255,255,0.7)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  const faces = [
    `translateZ(${half}px)`,                    // front
    `rotateY(180deg) translateZ(${half}px)`,    // back
    `rotateY(90deg) translateZ(${half}px)`,     // right
    `rotateY(-90deg) translateZ(${half}px)`,    // left
    `rotateX(90deg) translateZ(${half}px)`,     // top
    `rotateX(-90deg) translateZ(${half}px)`,    // bottom
  ];

  return (
    <motion.div
      style={{
        width: size,
        height: size,
        perspective: size * 7,
        display: "inline-block",
        filter: "drop-shadow(0 12px 14px rgba(0,0,0,0.32))",
      }}
      animate={{ x, y }}
      transition={{ duration: isLocked ? 0.4 : 0.18, ease: isLocked ? "easeOut" : "easeInOut" }}
    >
      <motion.div
        style={{
          width: size,
          height: size,
          position: "relative",
          transformStyle: "preserve-3d",
        }}
        animate={{
          rotateX,
          rotateY,
          rotateZ,
          scale: scaleAnim ?? 1,
        }}
        transition={
          isLocked
            ? { duration: 0.5, type: "spring", stiffness: 180, damping: 16 }
            : { duration: 0.2, ease: "linear" }
        }
      >
        {faces.map((transform, idx) => {
          const Symbol = FACE_SYMBOLS[idx];
          return (
            <div key={idx} style={{ ...baseFace, transform }}>
              <Symbol size={Math.floor(size * 0.72)} />
            </div>
          );
        })}
      </motion.div>
    </motion.div>
  );
};

export const getFaceRotation = (symbolIndex: number) => FACE_ROTATIONS[symbolIndex];
