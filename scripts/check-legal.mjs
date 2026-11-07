// Fails while lib/legal.ts still has "[...]" placeholders. Run before launch.
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../lib/legal.ts", import.meta.url), "utf8");
const pending = [...source.matchAll(/^\s*(\w+):\s*"(\[[^"]*\])"/gm)].map(([, key, value]) => `${key} = ${value}`);
if (pending.length > 0) {
	console.error(`lib/legal.ts still has ${pending.length} placeholder(s):\n  ${pending.join("\n  ")}`);
	process.exit(1);
}
console.log("Legal pages: no placeholders left.");
