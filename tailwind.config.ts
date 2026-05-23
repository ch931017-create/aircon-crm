import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
       50: "#F2FBF6",
       100: "#DDF7E8",
       500: "#00C773",
       600: "#00A862",
       700: "#008A51",
},
        status: {
          new: "#3b82f6",
          assigned: "#8b5cf6",
          scheduled: "#0ea5e9",
          visiting: "#f59e0b",
          completed: "#10b981",
          cancelled: "#6b7280",
        },
      },
    },
  },
  plugins: [],
};

export default config;
