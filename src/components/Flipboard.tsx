import { cn } from "@/lib/utils";
import { FlapDisplay, Presets } from "react-split-flap-effect";
import "react-split-flap-effect/extras/themes.css";
import "./Flipboard.css";
import { useMemo } from "react";

export const Flipboard = ({
  rank,
  value,
  points,
  length,
  style,
  obfuscate = false,
  randomize = false,
}: {
  rank?: number;
  length?: number;
  value: string;
  points?: number;
  style?: "XL" | "L" | "M" | "S";
  obfuscate: boolean;
  randomize?: boolean;
}) => {
  const valueToDisplay = useMemo(() => {
    if (!randomize) return value;
    return value
      .split("")
      .sort(() => Math.random() - 0.5)
      .join("");
  }, [value, randomize]);

  return (
    <div className="flex flex-row gap-4">
      {rank && (
        <FlapDisplay
          id={`flipboard_rank_${value}`}
          className={cn("M darkBordered", style)}
          chars={Presets.ALPHANUM}
          length={length || 2}
          value={
            rank !== undefined
              ? `${rank < 10 ? `0${rank}` : rank.toString()}`
              : "   "
          }
          padChar=" "
        />
      )}
      <FlapDisplay
        id={`flipboard_value_${value}`}
        className={cn("M darkBordered", style)}
        chars={Presets.ALPHANUM + "*?"}
        length={length || 12}
        value={obfuscate ? valueToDisplay.replace(/./g, "*") : valueToDisplay}
      />
      {(points || points === 0) && (
        <FlapDisplay
          id={`flipboard_points_${value}`}
          className={cn("M darkBordered", style)}
          chars={Presets.ALPHANUM + "+"}
          length={4}
          value={points <= 0 ? "FREE" : `${points?.toString()}`}
          padChar="0"
        />
      )}
    </div>
  );
};
