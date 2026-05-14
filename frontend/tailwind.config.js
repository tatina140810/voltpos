/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#4F46E5",
        "primary-dark": "#3730A3",
        success: "#059669",
        warning: "#D97706",
        danger: "#DC2626",
      },
    },
  },
  plugins: [],
};
