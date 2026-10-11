// Apply the saved theme before first paint (mirrors @sg/theme bootstrapTheme).
// Loaded as a blocking classic script from <head>: kept out of index.html so the
// CSP can drop script-src 'unsafe-inline'.
(function () {
  try {
    var stored = localStorage.getItem("phantix_theme");
    var dark;
    if (stored === "light") dark = false;
    else if (stored === "system")
      dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    else dark = true;
    if (dark) {
      document.documentElement.removeAttribute("data-theme");
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.setAttribute("data-theme", "light");
      document.documentElement.classList.remove("dark");
    }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", dark ? "#000000" : "#F4F6FA");
  } catch (e) {}
})();
