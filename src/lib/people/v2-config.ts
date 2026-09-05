export function peopleV2Configured(): boolean {
  return Boolean(process.env.PEOPLE_DB_URL?.trim() && process.env.PEOPLE_SERVING_REF?.trim());
}
