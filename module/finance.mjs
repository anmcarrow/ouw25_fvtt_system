const LEAVE_THRESHOLD = 30_000;
const MAX_LEAVES = 8;

export function pensionProgress(balance) {
  const leaves = Math.min(MAX_LEAVES, Math.floor(balance / LEAVE_THRESHOLD));
  return {
    leaves,
    untilNext: leaves === MAX_LEAVES ? null : (leaves + 1) * LEAVE_THRESHOLD - balance
  };
}

export function pensionBalanceAfterDeposit(balance, input) {
  if (!/^[1-9]\d*$/.test(input.trim())) throw new RangeError("Invalid pension deposit");
  const next = balance + Number(input);
  if (!Number.isSafeInteger(next)) throw new RangeError("Pension balance exceeds the supported range");
  return next;
}
