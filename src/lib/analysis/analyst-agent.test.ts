import { describe, expect, it } from "vitest";
import { isLeadershipLabel } from "./people-intelligence";

describe("leadership value matching", () => {
  it.each(["Manager", "Director", "VP", "总监", "经理", "领导"])(
    "treats %s as leadership",
    (value) => {
      expect(isLeadershipLabel(value)).toBe(true);
    },
  );

  it.each(["Individual Contributor", "工程师", "专员"])(
    "does not treat %s as leadership",
    (value) => {
      expect(isLeadershipLabel(value)).toBe(false);
    },
  );
});
