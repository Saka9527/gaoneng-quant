(function () {
  function fit() {
    if (document.documentElement.getAttribute("data-current-path") !== "/ai-advisory") {
      return;
    }
    var shell = document.querySelector(".aic-shell");
    if (!shell) return;
    var top = shell.getBoundingClientRect().top;
    var next = Math.max(320, Math.floor(window.innerHeight - top));
    shell.style.setProperty("height", next + "px", "important");
  }

  function boot() {
    fit();
    setTimeout(fit, 80);
    setTimeout(fit, 300);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
  window.addEventListener("resize", fit);
  window.addEventListener("mintlify:navigate", boot);
})();
