import { describe, expect, it } from "vitest";
import { decodePeopleFileBytes, detectFileEncoding } from "./file-encoding";

function encodeUtf32Be(text: string) {
  const bytes = new Uint8Array(text.length * 4);
  for (let index = 0; index < text.length; index += 1) {
    bytes[index * 4 + 3] = text.charCodeAt(index);
  }
  return bytes;
}

describe("people file encoding", () => {
  it("detects UTF-32 BE without a BOM from VDM-style padding", () => {
    const bytes = encodeUtf32Be("record_month,employee_number\n");
    expect(detectFileEncoding(bytes)).toBe("utf-32be");
  });

  it("decodes UTF-32 BE CSV text used by VDM extracts", () => {
    const source = '"record_month","employee_number"\n2015-02-28,27376\n';
    const { encoding, text } = decodePeopleFileBytes(encodeUtf32Be(source));
    expect(encoding).toBe("utf-32be");
    expect(text).toContain("record_month");
    expect(text).toContain("2015-02-28,27376");
  });

  it("leaves UTF-8 recruiting files unchanged", () => {
    const source = "candidate_id,requisition_id\nC1,R1\n";
    const { encoding, text } = decodePeopleFileBytes(
      new TextEncoder().encode(source),
    );
    expect(encoding).toBe("utf-8");
    expect(text).toBe(source);
  });
});
