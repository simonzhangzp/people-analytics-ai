export type SuppressionCopy = {
  allHidden: boolean;
  noneHidden: boolean;
  visibleQualifier: string;
  afterMinCell: string;
  hiddenFact: string;
  grain: string;
};

export function suppressionCopy(input: {
  hidden: number;
  total: number;
  minCell: number;
  grain: string;
}): SuppressionCopy {
  const hidden = Math.max(0, input.hidden);
  const total = Math.max(0, input.total);
  const minCell = input.minCell;
  const grain = input.grain;
  if (total > 0 && hidden >= total) {
    return {
      allHidden: true,
      noneHidden: false,
      visibleQualifier: "",
      afterMinCell: "",
      hiddenFact: `All cells hidden at ${grain} (min_cell ${minCell}).`,
      grain,
    };
  }
  if (hidden === 0) {
    return {
      allHidden: false,
      noneHidden: true,
      visibleQualifier: "",
      afterMinCell: "",
      hiddenFact: `No cells hidden at this grain (min_cell ${minCell}).`,
      grain,
    };
  }
  return {
    allHidden: false,
    noneHidden: false,
    visibleQualifier: ` among cells still visible at min_cell ${minCell}`,
    afterMinCell: ` after min_cell ${minCell}`,
    hiddenFact: `${hidden} of ${total} ${grain} cells hidden (min_cell ${minCell}; n is as-of month headcount, not trailing-12m average).`,
    grain,
  };
}
