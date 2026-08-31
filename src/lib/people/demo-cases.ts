export const CASES = [
  {
    id: "trust" as const,
    href: "/enterprise-demo/trust",
    question: "Can I trust this number?",
    subtitle: "Governed People Data",
    description:
      "See how a Headcount metric moves from source systems through data quality, metric definitions and lineage into trusted reporting.",
  },
  {
    id: "incident" as const,
    href: "/enterprise-demo/incident",
    question: "Why did Headcount suddenly drop?",
    subtitle: "Data Quality & Lineage",
    description:
      "Investigate an apparent APAC workforce decline and discover that it is a failed HRIS feed rather than a business change.",
  },
  {
    id: "attrition" as const,
    href: "/enterprise-demo/attrition",
    question: "Why is Engineering attrition increasing?",
    subtitle: "Workforce Intelligence + AI",
    description:
      "Move from a governed attrition definition through segmentation, evidence and potential workforce actions.",
  },
];

export type DemoCaseId = (typeof CASES)[number]["id"];
