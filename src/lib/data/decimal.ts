// The snapshot carries up to 15 significant decimal digits.
export function decimalParts(value: number) {
  const [mantissa, power = "0"] = value.toString().split("e");
  const [integer, fraction = ""] = mantissa.split(".");
  return [BigInt(integer + fraction), Number(power) - fraction.length] as const;
}
