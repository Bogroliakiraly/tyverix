/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Tyverix palette — deep neutral surfaces with an electric accent.
        bg: {
          base: "#0a0b0f",
          surface: "#121419",
          elevated: "#181b22",
          hover: "#1f232c",
        },
        border: {
          subtle: "#242833",
          strong: "#2f3441",
        },
        accent: {
          DEFAULT: "#5b8cff",
          hover: "#6f9bff",
          muted: "#2a3a66",
        },
        good: "#3ddc84",
        warn: "#f5b14c",
        bad: "#ff5c5c",
        text: {
          primary: "#eef1f7",
          secondary: "#9aa3b2",
          muted: "#5f6776",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "Segoe UI Variable",
          "Segoe UI",
          "system-ui",
          "sans-serif",
        ],
        mono: ["JetBrains Mono", "Cascadia Code", "Consolas", "monospace"],
      },
      borderRadius: {
        xl: "14px",
        "2xl": "18px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.25)",
        glow: "0 0 0 1px rgba(91,140,255,0.4), 0 0 24px rgba(91,140,255,0.25)",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.25s ease-out",
      },
    },
  },
  plugins: [],
};
