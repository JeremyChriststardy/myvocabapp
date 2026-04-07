import React from "react";
import { View, Dimensions } from "react-native";
import Svg, { Rect, Path } from "react-native-svg";

type Mode = "real" | "game";

interface ScanningFrameProps {
  mode: Mode;
  size?: number;
}

export function ScanningFrame({ mode, size = 220 }: ScanningFrameProps) {
  const isGame = mode === "game";

  const realAccent = "white";   // changed to white
  const gameNeon = "white";     // changed to white
  const gameGlowSoft = "rgba(170, 70, 240, 0.07)";

  const gameBlockSize = 7;
  const gameBlockGap = 2;
  const gameStroke = 1.6;

  const { width: screenWidth, height: screenHeight } = Dimensions.get("window");

  const HollowPixel = ({
    x,
    y,
    size,
    color,
    strokeWidth,
  }: {
    x: number;
    y: number;
    size: number;
    color: string;
    strokeWidth: number;
  }) => (
    <Rect
      x={x + strokeWidth / 2}
      y={y + strokeWidth / 2}
      width={size - strokeWidth}
      height={size - strokeWidth}
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      rx={1}
    />
  );

  const buildGameCorner = (corner: "tl" | "tr" | "bl" | "br") => {
    const offsets: [number, number][] = [
      [2, 0], [3, 0], [4, 0],
      [1, 1],
      [0, 2], [0, 3], [0, 4],
    ];

    return offsets.map(([col, row], idx) => {
      let x = 0;
      let y = 0;
      const step = gameBlockSize + gameBlockGap;

      switch (corner) {
        case "tl":
          x = col * step;
          y = row * step;
          break;
        case "tr":
          x = size - gameBlockSize - col * step;
          y = row * step;
          break;
        case "bl":
          x = col * step;
          y = size - gameBlockSize - row * step;
          break;
        case "br":
          x = size - gameBlockSize - col * step;
          y = size - gameBlockSize - row * step;
          break;
      }

      return (
        <HollowPixel
          key={`${corner}-${idx}`}
          x={x}
          y={y}
          size={gameBlockSize}
          color={gameNeon}
          strokeWidth={gameStroke}
        />
      );
    });
  };

  return (
    <View
      style={{
        position: "absolute",
        width: size,
        height: size,
        left: (screenWidth - size) / 2,    // center horizontally
        top: (screenHeight - size) / 2,    // center vertically
        justifyContent: "center",
        alignItems: "center",
        pointerEvents: "none",
      }}
    >
      {isGame ? (
        <Svg width={size} height={size}>
          {["tl", "tr", "bl", "br"].map((c) => buildGameCorner(c as any))}
        </Svg>
      ) : (
        <Svg width={size} height={size}>
          <Path
            d={`M 2 32 L 2 10 Q 2 2 10 2 L 32 2`}
            stroke={realAccent}
            strokeWidth={2}
            fill="none"
            strokeLinecap="round"
          />
          <Path
            d={`M ${size - 32} 2 L ${size - 10} 2 Q ${size - 2} 2 ${size - 2} 10 L ${size - 2} 32`}
            stroke={realAccent}
            strokeWidth={2}
            fill="none"
            strokeLinecap="round"
          />
          <Path
            d={`M 2 ${size - 32} L 2 ${size - 10} Q 2 ${size - 2} 10 ${size - 2} L 32 ${size - 2}`}
            stroke={realAccent}
            strokeWidth={2}
            fill="none"
            strokeLinecap="round"
          />
          <Path
            d={`M ${size - 32} ${size - 2} L ${size - 10} ${size - 2} Q ${size - 2} ${size - 2} ${size - 2} ${size - 10} L ${size - 2} ${size - 32}`}
            stroke={realAccent}
            strokeWidth={2}
            fill="none"
            strokeLinecap="round"
          />
        </Svg>
      )}
    </View>
  );
}