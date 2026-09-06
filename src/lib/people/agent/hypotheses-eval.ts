const CAUSAL =
  /\b(caused|causes|because of|due to|drives|leads to|driving|the reason is)\b|导致|因为|驱动|造成/i;

const INSTRUCTION_LEAK =
  /\bignore previous instructions\b|\byou are now\b|\brun sql\b|\bbypass rls\b/i;

export function numbersInText(text: string): string[] {
  return text.match(/\d+(?:\.\d+)?/g) ?? [];
}

export function scoreHypotheses(input: {
  hypotheses: string[];
  facts: string[];
  headline?: string;
}): { ok: boolean; failures: string[] } {
  const failures: string[] = [];
  const lines = input.hypotheses.map((row) => row.trim()).filter(Boolean);
  if (lines.length === 0) failures.push("hypotheses_empty");
  const factDigits = new Set<string>();
  for (const fact of input.facts) {
    for (const token of numbersInText(fact)) factDigits.add(token);
  }
  for (const line of lines) {
    const digits = numbersInText(line);
    if (digits.length) failures.push("hypothesis_contains_number");
    if (CAUSAL.test(line)) failures.push("hypothesis_causal_claim");
    if (INSTRUCTION_LEAK.test(line)) failures.push("hypothesis_instruction_leak");
    for (const token of digits) {
      if (!factDigits.has(token)) failures.push("hypothesis_number_not_in_facts");
    }
  }
  return { ok: failures.length === 0, failures: [...new Set(failures)] };
}
