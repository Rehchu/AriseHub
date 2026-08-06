/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Arise church brand red, sampled from the arisecenla.church logo.
        brand: {
          50: "#fdf2f2",
          100: "#fce4e4",
          200: "#f8c6c9",
          300: "#f0989d",
          400: "#e36570",
          500: "#d2303b",
          600: "#b3222c",
          700: "#8f1b23",
          800: "#6b141a",
          900: "#4a0d11",
        },
        // Near-black chrome for the sidebar/header, matching the site's dark theme.
        ink: {
          50: "#f5f5f6",
          100: "#e5e5e8",
          200: "#cbcbcf",
          300: "#a3a3aa",
          400: "#7a7a82",
          500: "#55555c",
          600: "#3a3a40",
          700: "#26262a",
          800: "#17171a",
          900: "#0b0b0c",
          950: "#050506",
        },
        // Warm gold accent, sampled from secondary tones on the site.
        gold: {
          100: "#f3e9dd",
          300: "#d9bd9c",
          500: "#b89778",
          700: "#8a6f56",
        },
      },
      fontFamily: {
        display: ["Poppins", "sans-serif"],
        sans: ["Inter", "Helvetica", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [],
};
