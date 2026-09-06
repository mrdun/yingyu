const daisyThemes = require("daisyui/src/theming/themes");

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: [],
  theme: {
    extend: {
      boxShadow: {
        "even-md": "0 0px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);",
        "even-lg": "0 2px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);",
        "even-xl": "0 4px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);",
        soft: "0 10px 22px rgba(47, 91, 234, 0.04)",
        "soft-lg": "0 18px 36px rgba(47, 91, 234, 0.10)",
      },
      animation: {
        wink: "wink 1s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        shake: "shake 0.5s cubic-bezier(0.36, 0.07, 0.19, 0.97)",
      },
      keyframes: {
        wink: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0" },
        },
        shake: {
          "10%, 90%": {
            transform: "translate3d(-1px, 0, 0)",
          },
          "20%, 80%": {
            transform: "translate3d(2px, 0, 0)",
          },
          "30%, 50%, 70%": {
            transform: "translate3d(-4px, 0, 0)",
          },
          "40%, 60%": {
            transform: "translate3d(4px, 0, 0)",
          },
        },
      },
      backgroundColor: {
        "theme-dark": "#05051d",
        cream: "#f7f4ee",
      },
      colors: {
        "theme-dark": "#05051d",
        cream: "#f7f4ee",
        terra: {
          DEFAULT: "#b66a48",
          light: "#d38a5f",
        },
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
        // 一键把旧「紫」主题映射到品牌蓝（juyouqu 参照），避免逐个文件改 purple-*
        purple: {
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
        serif: [
          '"Songti SC"',
          '"STSong"',
          '"Noto Serif CJK SC"',
          "Georgia",
          "serif",
        ],
        customFont: [
          '"PingFang SC"',
          '"Hiragino Sans GB"',
          '"Microsoft YaHei"',
          '"Helvetica Neue"',
          "Arial",
          "sans-serif",
        ],
      },
      borderColor: {
        "theme-dark": "#05051d",
        cream: "#f7f4ee",
      },
    },
  },
  plugins: [
    require("daisyui"),
    function ({ addComponents, addUtilities }) {
      const buttons = {
        ".tw-btn-blue": {
          backgroundColor: "#2F5BEA",
          color: "#fff",
          border: "none",
          "&:hover": {
            backgroundColor: "#2448c6",
          },
        },
      };

      addComponents(buttons);

      const scrollbar = {
        ".scrollbar-hide": {
          "-ms-overflow-style": "none" /* 适用于 IE 和 Edge */,
          "scrollbar-width": "none" /* 适用于 Firefox */,
        },
        ".scrollbar-hide::-webkit-scrollbar": {
          display: "none",
        },
      };

      addUtilities(scrollbar, ["responsive"]);
    },
  ],
  daisyui: {
    themes: [
      {
        light: {
          ...daisyThemes["light"],
          primary: "#2F5BEA",
          "primary-content": "#ffffff",
          "base-100": "#f7f4ee",
          "base-200": "#f0ece3",
          "base-300": "#e6e1d6",
        },
        dark: {
          ...daisyThemes["dark"],
          primary: "#6f8bff",
          "primary-content": "#ffffff",
          "base-100": "#0b1220",
          "base-200": "#111a2c",
          "base-300": "#182338",
        },
      },
    ],
  },
};
