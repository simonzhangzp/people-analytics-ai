import type { Metadata } from "next";
import { AskWorkspace } from "./ask-workspace";

export const metadata: Metadata = {
  title: "Ask a People file",
  description:
    "Upload a local People file, ask one question, and get a calculated answer with columns, formulas, and definitions to confirm.",
};

export default function AskPage() {
  return <AskWorkspace />;
}
