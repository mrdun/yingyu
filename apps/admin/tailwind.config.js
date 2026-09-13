// 刻意复制自 apps/client/tailwind.config.js (跨应用 import 会把两个构建耦合在一起),
// 保持管理后台与用户端同一套设计令牌 (daisyUI 主题 + 品牌蓝 + 米色底)。
const daisyThemes = require("daisyui/src/theming/themes");

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: [
    "./app.vue",
    "./error.vue",
    "./components/**/*.{vue,js,ts}",
    "./layouts/**/*.vue",
    "./pages/**/*.vue",
    "./plugins/**/*.{js,ts}",
    "./composables/**/*.{js,ts}",
    "./utils/**/*.{js,ts}",
    "./stores/**/*.{js,ts}",
  ],
  theme: {
    extend: {
      boxShadow: {
        "even-md": "0 0px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);",
        "even-lg": "0 2px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);",
        soft: "0 10px 22px rgba(47, 91, 234, 0.04)",
        "soft-lg": "0 18px 36px rgba(47, 91, 234, 0.10)",
      },
      colors: {
        "theme-dark": "#05051d",
        cream: "#f7f4ee",
        gold: "#c6a458",
        brand: {
          50: "#eef3ff",
          100: "#d5e0ff",
          200: "#b7c6ff",
          300: "#8fa3ff",
          400: "#6f8bff",
          500: "#4a6bff",
          600: "#2F5BEA",
          700: "#2448c6",
          800: "#1f3a9e",
          900: "#1f2f63",
          950: "#131d42",
        },
      },
      fontFamily: {
        sans: [
          '"PingFang SC"',
          '"Hiragino Sans GB"',
          '"Microsoft YaHei"',
          '"Helvetica Neue"',
          "Arial",
          "sans-serif",
        ],
        mono: ['"JetBrains Mono"', "Consolas", "Menlo", "monospace"],
      },
    },
  },
  plugins: [
    require("daisyui"),
    function ({ addUtilities }) {
      addUtilities(
        {
          ".scrollbar-hide": {
            "-ms-overflow-style": "none",
            "scrollbar-width": "none",
          },
          ".scrollbar-hide::-webkit-scrollbar": {
            display: "none",
          },
        },
        ["responsive"],
      );
    },
  ],
  daisyui: {
    themes: [
      {
        light: {
          ...daisyThemes["light"],
          primary: "#2F5BEA",
          "primary-content": "#ffffff",
          "base-100": "#ffffff",
          "base-200": "#f7f4ee",
          "base-300": "#e6e1d6",
        },
      },
    ],
  },
};
