// The site's Tailwind setup (it used to sit inline in docs/index.html for the Play CDN).
// Forest and cream: Tailwind's green and amber scales are re-pointed at the brand colours,
// so every bg-green-*/text-amber-* class on the site follows the theme.
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["../docs/*.html", "../docs/*.js"],
  theme: { extend: {
    colors: {
      green: { 50: "#EFF5F0", 100: "#D9E8DD", 200: "#B5D2BE", 300: "#87B597", 400: "#559370", 500: "#2F7A55", 600: "#256647", 700: "#1D5239", 800: "#163F2E", 900: "#0F2E21", 950: "#081B13" },
      amber: { 50: "#F8F4EA", 100: "#F6EBCD", 200: "#EED79A", 300: "#E6C265", 400: "#DDAE2B", 500: "#C9961A", 600: "#A87A12", 700: "#855F0E", 800: "#634610", 900: "#47330C" },
      leaf: "#4E9F3A",
    },
    fontFamily: { display: ["Fraunces", "Georgia", "serif"] },
  } },
};
