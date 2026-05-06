import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx,html}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        ink: "#111827",
        mist: "#f7f8fb",
        focus: "#2563eb",
        line: "#d8dee9"
      },
      boxShadow: {
        palette: "0 18px 60px rgba(15, 23, 42, 0.22)"
      }
    }
  },
  plugins: []
} satisfies Config;
