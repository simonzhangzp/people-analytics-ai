import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "People Strategy Intelligence",
    template: "%s · People Strategy Intelligence",
  },
  description:
    "Turn people strategy into a trusted measurement system with AI-assisted design and deterministic analytics.",
  metadataBase: new URL("https://peopleanalyticsai.net"),
  openGraph: {
    title: "People Strategy Intelligence",
    description:
      "Strategy → Metrics → Data → Insights → Action, with AI as your co-designer.",
    type: "website",
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
      <body>{children}</body>
    </html>
  );
}
