import type {
  LocalWorkbenchDataset,
  ResolvedQueryIntent,
} from "@/types/workbench";

export function isLeadershipLabel(value: string) {
  return /lead(?:er|ership)?s?|manager|director|\bvp\b|head of|chief|officer|exec|管理|总监|经理|领导|负责人/i.test(
    value,
  );
}

const PEOPLE_NEXT_BEST: Array<{
  canonicalField: string;
  label: string;
}> = [
  { canonicalField: "tenure_band", label: "Tenure" },
  { canonicalField: "seniority_level", label: "Level" },
  { canonicalField: "location", label: "Location" },
  { canonicalField: "job_role", label: "Job function" },
  { canonicalField: "department", label: "Department" },
  { canonicalField: "country", label: "Country" },
  { canonicalField: "performance_rating", label: "Performance" },
  { canonicalField: "compa_ratio", label: "Compensation positioning" },
];

function sourceForCanonical(
  dataset: LocalWorkbenchDataset,
  canonicalField: string,
) {
  return dataset.metadata.columns.find(
    (column) => column.canonicalField === canonicalField,
  )?.sourceName;
}

export function peopleNextBestFollowUps(input: {
  dataset: LocalWorkbenchDataset;
  intent: ResolvedQueryIntent;
  currentDimensions: readonly string[];
}) {
  const used = new Set(input.currentDimensions);
  return PEOPLE_NEXT_BEST.flatMap((candidate) => {
    const sourceName = sourceForCanonical(input.dataset, candidate.canonicalField);
    if (!sourceName || used.has(sourceName)) return [];
    used.add(sourceName);
    return [
      {
        key: `people-cut:${sourceName}`,
        label:
          input.intent.difficulty === "diagnostic"
            ? `Where did the change concentrate by ${candidate.label.toLowerCase()}?`
            : `Break down by ${candidate.label.toLowerCase()}`,
        available: true,
      },
    ];
  }).slice(0, 5);
}
