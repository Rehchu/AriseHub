import { createServer } from "node:http";
import { readFileSync } from "node:fs";
createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(readFileSync(new URL("./repro.html", import.meta.url)));
}).listen(4599, () => console.log("up on 4599"));
