/* Shared chrome: dual-author project identity */
(function () {
  const path = (location.pathname.split("/").pop() || "index.html").replace(/\/$/, "") || "index.html";
  document.querySelectorAll("nav.site a[href]").forEach((a) => {
    const href = a.getAttribute("href");
    if (!href || href.startsWith("http")) return;
    if (href === path || (path === "" && href === "index.html")) a.classList.add("active");
  });
})();
