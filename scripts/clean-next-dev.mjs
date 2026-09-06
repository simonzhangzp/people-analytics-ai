import { rmSync } from "node:fs";
rmSync(".next/dev", { recursive: true, force: true });
