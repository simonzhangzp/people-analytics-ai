export type HeaderLayout = "single" | "section_then_fields";

export function uniqueHeaders(row: unknown[]): string[] {
  const seen = new Map<string, number>();
  return row.map((value, index) => {
    const raw = String(value ?? "").trim();
    const header = raw || `Column_${index + 1}`;
    const count = (seen.get(header) ?? 0) + 1;
    seen.set(header, count);
    return count === 1 ? header : `${header}_${count}`;
  });
}

export function looksLikeSectionHeaderRow(row: unknown[]): boolean {
  const texts = row.map((value) => String(value ?? "").trim()).filter(Boolean);
  if (texts.length === 0) return false;
  if (texts.some((text) => /section\s*\d+/i.test(text))) return true;
  return texts.length <= 3 && texts.some((text) => text.length > 24);
}

export function looksLikeFieldHeaderRow(row: unknown[]): boolean {
  const named = row
    .map((value) => String(value ?? "").trim())
    .filter((text) => text && !/section\s*\d+/i.test(text) && !/^column_\d+$/i.test(text));
  return named.length >= 4;
}

export function resolveTableHeaders(table: unknown[][]): {
  headers: string[];
  dataStart: number;
  headerLayout: HeaderLayout;
} {
  if (table.length === 0) {
    return { headers: [], dataStart: 0, headerLayout: "single" };
  }

  const first = table[0] ?? [];
  const second = table[1] ?? [];
  if (
    table.length > 2 &&
    looksLikeSectionHeaderRow(first) &&
    looksLikeFieldHeaderRow(second)
  ) {
    return {
      headers: uniqueHeaders(second),
      dataStart: 2,
      headerLayout: "section_then_fields",
    };
  }

  return {
    headers: uniqueHeaders(first),
    dataStart: 1,
    headerLayout: "single",
  };
}

export function stripSectionHeaderLine(text: string): {
  text: string;
  skippedSectionRow: boolean;
} {
  const match = text.match(/^(.*?)(\r?\n)/);
  if (!match) return { text, skippedSectionRow: false };
  if (/section\s*\d+/i.test(match[1])) {
    return { text: text.slice(match[0].length), skippedSectionRow: true };
  }
  return { text, skippedSectionRow: false };
}

export function suggestAskQuestion(fileName: string): string {
  if (/talent|appraisal|pm[_-]|review/i.test(fileName)) {
    return "How complete is this talent review and performance appraisal cycle, and where is review risk concentrated?";
  }
  if (/headcount|snapshot|vdm_headcount/i.test(fileName)) {
    return "How is headcount distributed across the data cuts available in this file?";
  }
  return "What does this file contain, and what business question can it answer with the columns present?";
}
