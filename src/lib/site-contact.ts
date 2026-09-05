/** Recruiter-facing contact. Override with NEXT_PUBLIC_BUILDER_* env if the defaults drift. */

export const BUILDER_NAME = "Simon Zhang";
export const BUILDER_HEADLINE =
  "People Analytics systems where HR domain knowledge, data science, and enterprise data governance sit in front of AI.";
export const BUILDER_LINKEDIN =
  process.env.NEXT_PUBLIC_BUILDER_LINKEDIN?.trim() || "https://www.linkedin.com/in/simonzp";
export const BUILDER_EMAIL = process.env.NEXT_PUBLIC_BUILDER_EMAIL?.trim() || "";
