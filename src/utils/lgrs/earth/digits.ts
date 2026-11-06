const DIGITS_1: string[] = [];
const DIGITS_2: string[] = [];
const DIGITS_3: string[] = [];
for (let value = 0; value < 1000; value++) {
  if (value < 10) DIGITS_1.push(String(value));
  if (value < 100) DIGITS_2.push(value < 10 ? `0${value}` : String(value));
  DIGITS_3.push(value < 10 ? `00${value}` : value < 100 ? `0${value}` : String(value));
}

/** Zero-padded `value` (an integer, 0 ≤ value < 10^count) with `count` (0–5) digits. */
export function fixedDigits(value: number, count: number): string {
  switch (count) {
    case 1:
      return DIGITS_1[value];
    case 2:
      return DIGITS_2[value];
    case 3:
      return DIGITS_3[value];
    case 4:
      return DIGITS_2[Math.floor(value / 100)] + DIGITS_2[value % 100];
    case 5:
      return DIGITS_2[Math.floor(value / 1000)] + DIGITS_3[value % 1000];
    default:
      return "";
  }
}
