(function () {
  // Figure lightbox
  var box = document.createElement("div");
  box.className = "lightbox";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-label", "Expanded figure");
  var img = document.createElement("img");
  img.alt = "";
  box.appendChild(img);
  document.addEventListener("DOMContentLoaded", function () {
    document.body.appendChild(box);
    document.querySelectorAll(".figure img").forEach(function (el) {
      el.addEventListener("click", function () {
        img.src = el.src;
        img.alt = el.alt || "";
        box.classList.add("open");
      });
    });
    box.addEventListener("click", function () {
      box.classList.remove("open");
      img.src = "";
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        box.classList.remove("open");
        img.src = "";
      }
    });
  });
})();
