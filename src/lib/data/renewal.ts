import { decimalParts } from "./decimal.ts";

export function renewalTrap(intro: number | null, renewal: number) {
  if (intro === null || renewal <= intro) return null;
  if (intro === 0) return { level: "warn", kind: "trial" } as const;

  const [introUnits, introPower] = decimalParts(intro);
  const [renewalUnits, renewalPower] = decimalParts(renewal);
  const power = Math.min(introPower, renewalPower);
  const initial = introUnits * 10n ** BigInt(introPower - power);
  const recurring = renewalUnits * 10n ** BigInt(renewalPower - power);
  // Compare the original decimal prices before rounding the displayed ratio.
  if (recurring * 5n < initial * 6n) return null;
  return {
    level: recurring >= initial * 10n ? "warn" : "caution",
    kind: "multiplier",
    multiplier: renewal / intro,
  } as const;
}
