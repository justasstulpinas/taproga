/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#f7f4ef",
        bgSoft: "#ece5d7",
        textPrimary: "#1f1c18",
        textSecondary: "#5c5148",
        accentMuted: "#8f7f6f",
        action: "#151311",
        actionActive: "#111111",
        borderSoft: "rgba(31, 28, 24, 0.1)",
        borderStrong: "rgba(31, 28, 24, 0.2)",
      },
      maxWidth: {
        layout: "64rem",
        text: "46rem",
        hero: "40rem",
      },
      borderRadius: {
        lg: "1.5rem",
        md: "1rem",
        pill: "999px",
      },
      boxShadow: {
        soft: "0 0.7rem 1.8rem rgba(24, 20, 16, 0.08)",
        flow: "0 1.8rem 4rem rgba(24, 20, 16, 0.12)",
      },
      fontFamily: {
        serif: ["Cormorant Garamond", "serif"],
        sans: ["Syne", "sans-serif"],
      },
    },
  },
  plugins: [],
};
