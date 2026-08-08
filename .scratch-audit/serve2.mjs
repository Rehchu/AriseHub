import { createServer } from "node:http";
import { readFileSync } from "node:fs";
const map = { "/": ["repro.html","text/html; charset=utf-8"], "/app.css": ["app.css","text/css"] };
createServer((req, res) => {
  const k = req.url.split("?")[0];
  const e = map[k];
  if (!e) { res.writeHead(404); return res.end("no"); }
  res.writeHead(200, { "content-type": e[1] });
  res.end(readFileSync(new URL("./" + e[0], import.meta.url)));
}).listen(4599, () => console.log("up on 4600"));
