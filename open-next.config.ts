import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// `buildCommand` is not optional here, it is load-bearing.
//
// OpenNext runs the Next build by shelling out, and with nothing set it runs
// `npm run build` (@opennextjs/aws/dist/build/buildNextApp.js). Since this
// package's own `build` script is `opennextjs-cloudflare build` — so that a CI
// system running the conventional `npm run build` produces .open-next/ rather
// than a .next/ the Worker cannot serve — leaving this unset makes the two call
// each other forever. Naming `next build` explicitly breaks the cycle.
export default {
  ...defineCloudflareConfig(),
  buildCommand: "next build",
};
