import { beforeEach, describe, expect, it } from "vitest";

import { useComboTracker } from "../comboTracker";

describe("useComboTracker", () => {
  beforeEach(() => {
    // Reset combo before each test
    const { resetCombo } = useComboTracker();
    resetCombo();
  });

  it("should start with 0 combo", () => {
    const { getComboCount } = useComboTracker();
    expect(getComboCount()).toBe(0);
  });

  it("should increment combo", () => {
    const { incrementCombo, getComboCount } = useComboTracker();
    incrementCombo();
    expect(getComboCount()).toBe(1);
    incrementCombo();
    expect(getComboCount()).toBe(2);
  });

  it("should reset combo", () => {
    const { incrementCombo, resetCombo, getComboCount } = useComboTracker();
    incrementCombo();
    incrementCombo();
    incrementCombo();
    expect(getComboCount()).toBe(3);
    resetCombo();
    expect(getComboCount()).toBe(0);
  });

  it("should return 1.0x multiplier for 0-2 combo", () => {
    const { incrementCombo, getMultiplier } = useComboTracker();
    expect(getMultiplier()).toBe(1.0);
    incrementCombo();
    expect(getMultiplier()).toBe(1.0);
    incrementCombo();
    expect(getMultiplier()).toBe(1.0);
  });

  it("should return 1.1x multiplier for 3-4 combo", () => {
    const { incrementCombo, getMultiplier } = useComboTracker();
    incrementCombo();
    incrementCombo();
    incrementCombo();
    expect(getMultiplier()).toBe(1.1);
    incrementCombo();
    expect(getMultiplier()).toBe(1.1);
  });

  it("should return 1.2x multiplier for 5-9 combo", () => {
    const { incrementCombo, getMultiplier } = useComboTracker();
    for (let i = 0; i < 5; i++) {
      incrementCombo();
    }
    expect(getMultiplier()).toBe(1.2);
    for (let i = 0; i < 4; i++) {
      incrementCombo();
    }
    expect(getMultiplier()).toBe(1.2);
  });

  it("should return 1.5x multiplier for 10-19 combo", () => {
    const { incrementCombo, getMultiplier } = useComboTracker();
    for (let i = 0; i < 10; i++) {
      incrementCombo();
    }
    expect(getMultiplier()).toBe(1.5);
    for (let i = 0; i < 9; i++) {
      incrementCombo();
    }
    expect(getMultiplier()).toBe(1.5);
  });

  it("should return 2.0x multiplier for 20+ combo", () => {
    const { incrementCombo, getMultiplier } = useComboTracker();
    for (let i = 0; i < 20; i++) {
      incrementCombo();
    }
    expect(getMultiplier()).toBe(2.0);
    incrementCombo();
    expect(getMultiplier()).toBe(2.0);
  });

  it("should return correct multiplier table", () => {
    const { getMultiplierTable } = useComboTracker();
    const table = getMultiplierTable();
    expect(table).toEqual({
      3: 1.1,
      5: 1.2,
      10: 1.5,
      20: 2.0,
    });
  });
});
