import type { Metadata } from "next";

export const OG_IMAGE = "/og-peopleanalyticsai.png";

export function pageMetadata(input: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  const title = input.title;
  const description = input.description;
  return {
    title,
    description,
    alternates: { canonical: input.path },
    openGraph: {
      title,
      description,
      url: input.path,
      siteName: "PeopleAnalyticsAI",
      type: "website",
      images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [OG_IMAGE],
    },
  };
}
