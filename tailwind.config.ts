import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Design System - "Polished Artisan"
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",

        // Surface hierarchy (CSS vars for dark mode support)
        surface: {
          DEFAULT: "hsl(var(--surface))",
          container: "hsl(var(--surface-container))",
          "container-low": "hsl(var(--surface-container-low))",
          "container-lowest": "hsl(var(--surface-container-lowest))",
          "container-high": "hsl(var(--surface-container-high))",
          "container-highest": "hsl(var(--surface-container-highest))",
          bright: "hsl(var(--surface))",
        },

        // Primary - Deep Navy
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },

        // Secondary - Warm Amber
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },

        // Accent (amber)
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },

        // Semantic
        success: "#10B981",
        warning: "#F59E0B",
        error: "#EF4444",
        info: "#3B82F6",

        // Utility
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",

        // Card
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },

        // Popover
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },

        // Destructive
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },

        // Sidebar (uses surface vars in dark mode via CSS)
        sidebar: {
          DEFAULT: "#0F172A",
          foreground: "#E2E8F0",
          accent: "#F59E0B",
        },

        // Dark mode overrides for hardcoded colors used inline
        dark: {
          bg: "#1E2229",
          card: "#303541",
          sidebar: "#303541",
        },
      },

      borderRadius: {
        "card": "20px",
        "btn": "14px",
        "input": "12px",
        "pill": "9999px",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },

      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },

      fontSize: {
        "display-lg": ["3.5rem", { lineHeight: "1.1", fontWeight: "700", letterSpacing: "-0.02em" }],
        "display": ["2.5rem", { lineHeight: "1.2", fontWeight: "700", letterSpacing: "-0.02em" }],
        "headline": ["1.5rem", { lineHeight: "1.3", fontWeight: "600" }],
        "title": ["1.125rem", { lineHeight: "1.4", fontWeight: "600" }],
        "body-lg": ["1rem", { lineHeight: "1.6", fontWeight: "400" }],
        "body": ["0.875rem", { lineHeight: "1.6", fontWeight: "400" }],
        "label": ["0.75rem", { lineHeight: "1.4", fontWeight: "500", letterSpacing: "0.05em" }],
      },

      boxShadow: {
        "soft": "0 2px 8px rgba(0, 0, 0, 0.04)",
        "ambient": "0 12px 40px rgba(26, 28, 28, 0.04)",
        "card": "0 1px 3px rgba(0, 0, 0, 0.02), 0 4px 12px rgba(0, 0, 0, 0.03)",
        "float": "0 8px 30px rgba(0, 0, 0, 0.06)",
      },

      spacing: {
        "sidebar": "240px",
        "sidebar-collapsed": "72px",
        "topbar": "64px",
      },

      maxWidth: {
        "app": "1440px",
      },

      keyframes: {
        "pulse-dot": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
      },

      animation: {
        "pulse-dot": "pulse-dot 2s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
