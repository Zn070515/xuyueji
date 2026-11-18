import { type Brand, brandNumber } from "@xuyueji/domain";

export type Points = Brand<number, "Points">;

export const asPoints = (value: number): Points => {
  assertInteger(value, "Points");
  return brandNumber(value, "Points");
};

export type AmountFen = Brand<number, "AmountFen">;

export const asAmountFen = (value: number): AmountFen => {
  assertInteger(value, "AmountFen");
  return brandNumber(value, "AmountFen");
};

export function assertInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be a safe integer, received: ${value}`);
  }
}

export function assertPositive(value: number, label: string): void {
  assertInteger(value, label);
  if (value <= 0) {
    throw new RangeError(`${label} must be positive, received: ${value}`);
  }
}

export function addAmounts(left: number, right: number): number {
  assertInteger(left, "Amount");
  assertInteger(right, "Amount");
  return left + right;
}
