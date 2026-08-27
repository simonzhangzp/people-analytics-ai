export type FileEncoding = "utf-8" | "utf-16le" | "utf-16be" | "utf-32le" | "utf-32be";

function isMostlyNullEvery(bytes: Uint8Array, step: number, offset: number) {
  const limit = Math.min(bytes.length, 64);
  let zeros = 0;
  let seen = 0;
  for (let index = offset; index < limit; index += step) {
    seen += 1;
    if (bytes[index] === 0) zeros += 1;
  }
  return seen >= 4 && zeros / seen >= 0.85;
}

export function detectFileEncoding(bytes: Uint8Array): FileEncoding {
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xfe && bytes[2] === 0 && bytes[3] === 0) {
    return "utf-32le";
  }
  if (bytes.length >= 4 && bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 0xfe && bytes[3] === 0xff) {
    return "utf-32be";
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return "utf-16le";
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return "utf-16be";
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return "utf-8";
  }

  if (
    bytes.length >= 16 &&
    isMostlyNullEvery(bytes, 4, 0) &&
    isMostlyNullEvery(bytes, 4, 1) &&
    isMostlyNullEvery(bytes, 4, 2)
  ) {
    return "utf-32be";
  }
  if (
    bytes.length >= 16 &&
    isMostlyNullEvery(bytes, 4, 1) &&
    isMostlyNullEvery(bytes, 4, 2) &&
    isMostlyNullEvery(bytes, 4, 3)
  ) {
    return "utf-32le";
  }
  if (bytes.length >= 16 && isMostlyNullEvery(bytes, 2, 0)) return "utf-16be";
  if (bytes.length >= 16 && isMostlyNullEvery(bytes, 2, 1)) return "utf-16le";
  return "utf-8";
}

function decodeUtf32(bytes: Uint8Array, littleEndian: boolean) {
  const start =
    bytes.length >= 4 &&
    ((littleEndian && bytes[0] === 0xff && bytes[1] === 0xfe) ||
      (!littleEndian && bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 0xfe))
      ? 4
      : 0;
  const chunks: string[] = [];
  const codes: number[] = [];
  for (let index = start; index + 3 < bytes.length; index += 4) {
    const code = littleEndian
      ? bytes[index] | (bytes[index + 1] << 8) | (bytes[index + 2] << 16) | (bytes[index + 3] << 24)
      : (bytes[index] << 24) | (bytes[index + 1] << 16) | (bytes[index + 2] << 8) | bytes[index + 3];
    const point = code >>> 0;
    if (point === 0) continue;
    codes.push(point);
    if (codes.length === 4_096) {
      chunks.push(String.fromCodePoint(...codes));
      codes.length = 0;
    }
  }
  if (codes.length > 0) chunks.push(String.fromCodePoint(...codes));
  return chunks.join("");
}

export function decodePeopleFileBytes(bytes: Uint8Array) {
  const encoding = detectFileEncoding(bytes);
  if (encoding === "utf-32be") return { encoding, text: decodeUtf32(bytes, false) };
  if (encoding === "utf-32le") return { encoding, text: decodeUtf32(bytes, true) };
  if (encoding === "utf-16le") return { encoding, text: new TextDecoder("utf-16le").decode(bytes) };
  if (encoding === "utf-16be") return { encoding, text: new TextDecoder("utf-16be").decode(bytes) };
  return { encoding, text: new TextDecoder("utf-8").decode(bytes) };
}

export async function readPeopleFileText(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return decodePeopleFileBytes(bytes);
}
