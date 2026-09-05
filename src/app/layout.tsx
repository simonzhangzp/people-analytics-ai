import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "PeopleAnalyticsAI",
    template: "%s · PeopleAnalyticsAI",
  },
  description:
    "Trusted People data. Governed metrics. AI-ready workforce intelligence. A working enterprise People Data & AI environment.",
  metadataBase: new URL("https://peopleanalyticsai.net"),
  openGraph: {
    title: "PeopleAnalyticsAI · Enterprise People Data & AI",
    description:
      "A working enterprise People Data & AI environment showing how data foundations, governance, workforce analytics, and AI support trusted workforce decisions.",
    type: "website",
    images: [{ url: "/og-peopleanalyticsai.png", width: 1200, height: 630, alt: "PeopleAnalyticsAI" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "PeopleAnalyticsAI · Enterprise People Data & AI",
    description:
      "A working enterprise People Data & AI environment showing how data foundations, governance, workforce analytics, and AI support trusted workforce decisions.",
    images: ["/og-peopleanalyticsai.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#f7f8fa",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body className={geist.variable}>{children}</body>
    </html>
  );
}
