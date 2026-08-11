export default {
  plugins: {
    // Tailwind v4 ships its PostCSS integration as a separate package and does
    // its own vendor-prefixing via Lightning CSS, so autoprefixer is no longer
    // needed here.
    "@tailwindcss/postcss": {},
  },
};
