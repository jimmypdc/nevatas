import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "hsl(220 20% 98%)",
        surface: "hsl(0 0% 100%)",
        border: "hsl(220 14% 90%)",
        muted: "hsl(220 12% 95%)",
        ink: "hsl(222 22% 12%)",
        subtle: "hsl(222 12% 42%)",
        brand: {
          DEFAULT: "hsl(222 70% 38%)",
          fg: "hsl(0 0% 100%)",
          muted: "hsl(222 70% 96%)",
        },
        success: "hsl(152 60% 36%)",
        warning: "hsl(36 92% 42%)",
        danger: "hsl(354 70% 46%)",
        // Marketing-only paper tones for the editorial surface. Kept here
        // (not in the app theme) so the operations UI stays sharp/clinical
        // while the marketing surface gets warmer "printed document" depth.
        paper: "hsl(40 30% 97%)",
        ledger: "hsl(40 20% 92%)",
      },
      fontFamily: {
        sans: [
          "var(--font-sans)",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica",
          "Arial",
        ],
        display: [
          "var(--font-display)",
          "ui-serif",
          "Georgia",
          "Cambria",
          "Times New Roman",
          "Times",
          "serif",
        ],
        mono: [
          "var(--font-mono)",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
        ],
      },
      letterSpacing: {
        tightest: "-0.04em",
      },
    },
  },
  plugins: [],
};

export default config;
