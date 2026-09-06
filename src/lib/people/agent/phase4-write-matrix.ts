/**
 * Local-only gate for writing docs/phase4/phase4_llm_invocation_matrix.json.
 * Never treat PHASE4_WRITE_MATRIX as a production LLM bypass.
 */
export function phase4WriteMatrixEnabled(
  env: NodeJS.Dict<string | undefined> = process.env,
): boolean {
  if (env.NODE_ENV === "production") return false;
  return env.PHASE4_WRITE_MATRIX === "1";
}
