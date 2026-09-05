export function formulatorPublicUrl() {
  return process.env.NEXT_PUBLIC_FORMULATOR_URL?.replace(/\/$/, "") ?? "";
}

export function analyzeHref() {
  return "/app";
}
