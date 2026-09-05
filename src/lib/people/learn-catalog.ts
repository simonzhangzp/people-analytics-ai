export type LearnResource = {
  title: string;
  url: string;
  keywords: string[];
};

/** Public Microsoft Learn paths matched to Engineering skill-gap language on Case 3. */
export const MICROSOFT_LEARN_CATALOG: LearnResource[] = [
  {
    title: "Build .NET applications with C#",
    url: "https://learn.microsoft.com/training/paths/build-dotnet-applications-csharp/",
    keywords: ["engineering", "software", "dotnet", "c#"],
  },
  {
    title: "Azure fundamentals",
    url: "https://learn.microsoft.com/training/paths/azure-fundamentals/",
    keywords: ["azure", "cloud", "engineering"],
  },
  {
    title: "Get started with Microsoft Fabric",
    url: "https://learn.microsoft.com/training/paths/get-started-fabric/",
    keywords: ["data", "analytics", "sql", "engineering"],
  },
  {
    title: "Get started with AI applications and agents on Azure",
    url: "https://learn.microsoft.com/training/paths/introduction-generative-ai/",
    keywords: ["ai", "ml", "engineering"],
  },
  {
    title: "Introduction to GitHub Copilot",
    url: "https://learn.microsoft.com/training/modules/introduction-to-github-copilot/",
    keywords: ["github", "copilot", "engineering"],
  },
];

export function learningRecommendationsForGaps(
  rows: Record<string, unknown>[],
  limit = 5,
): LearnResource[] {
  const haystack = rows
    .map((row) =>
      [row.job_family, row.org_id, row.skill_id, row.skill_name, row.onet_skill]
        .map((value) => String(value ?? "").toLowerCase())
        .join(" "),
    )
    .join(" ");
  const scored = MICROSOFT_LEARN_CATALOG.map((item) => ({
    item,
    score: item.keywords.reduce((sum, word) => sum + (haystack.includes(word) ? 1 : 0), 0),
  })).sort((a, b) => b.score - a.score);
  const matched = scored.filter((row) => row.score > 0).map((row) => row.item);
  const picked = matched.length > 0 ? matched : MICROSOFT_LEARN_CATALOG;
  return picked.slice(0, Math.min(5, Math.max(3, limit)));
}
