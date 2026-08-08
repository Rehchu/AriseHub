import postcss from "postcss";
import tw from "@tailwindcss/postcss";
import fs from "node:fs";
const css = fs.readFileSync("./app/globals.css", "utf8");
const res = await postcss([tw()]).process(css, { from: "./app/globals.css" });
fs.writeFileSync("./public/__probe.css", res.css);
console.log("ok", res.css.length);
