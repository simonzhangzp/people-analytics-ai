import fs from "node:fs";

for (const path of process.argv.slice(2)) {
  const buffer = Buffer.alloc(24);
  const fd = fs.openSync(path, "r");
  fs.readSync(fd, buffer, 0, 24, 0);
  fs.closeSync(fd);
  console.log({
    file: path.split(/[\\/]/).pop(),
    hex: buffer.toString("hex"),
    utf8: buffer.toString("utf8"),
    utf16le: buffer.toString("utf16le"),
  });
}
