import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/lab", "/ask", "/workbench", "/demo", "/strategy", "/app", "/workspace"],
    },
  };
}
