/* Shared top navigation for the sub-pages (changes, changelog, account).
 *
 * Each sub-page keeps its own content dictionary and language switcher; this
 * translates the nav links, marks the current page, and builds the same mobile
 * menu the landing page has — listening to the same #langs buttons and the same
 * "bf.site.lang" key the pages use.
 */
(function () {
  const LABELS = {
    en: { features: "Features", benchmark: "Before/after test", honesty: "Honesty", pricing: "Pricing", faq: "FAQ", changes: "What it changes", changelog: "Changelog", account: "Account", download: "Download" },
    hu: { features: "Funkciók", benchmark: "Előtte–utána teszt", honesty: "Őszinteség", pricing: "Árazás", faq: "GYIK", changes: "Mit módosít", changelog: "Újdonságok", account: "Fiók", download: "Letöltés" },
    de: { features: "Funktionen", benchmark: "Vorher-nachher-Test", honesty: "Ehrlichkeit", pricing: "Preise", faq: "FAQ", changes: "Was es ändert", changelog: "Änderungen", account: "Konto", download: "Download" },
  };

  const nav = document.querySelector("nav.nav-sub");
  if (!nav) return;

  // Mobile menu: the same links plus the account / download buttons.
  const menu = document.createElement("div");
  menu.className = "mobile-menu";
  menu.innerHTML =
    nav.querySelector(".nav-links").innerHTML +
    `<div class="m-btns">
       <a href="account.html" class="btn-ghost" data-nav="account"></a>
       <a href="index.html#download" class="btn-primary" data-nav="download"></a>
     </div>`;
  const burger = document.createElement("button");
  burger.className = "hamburger";
  burger.setAttribute("aria-label", "Menu");
  burger.setAttribute("aria-expanded", "false");
  burger.innerHTML = "<span></span><span></span><span></span>";
  nav.appendChild(burger);
  nav.after(menu);
  const setMenu = (open) => {
    menu.classList.toggle("open", open);
    burger.classList.toggle("open", open);
    burger.setAttribute("aria-expanded", String(open));
    document.body.style.overflow = open ? "hidden" : "";
  };
  burger.addEventListener("click", () => setMenu(!menu.classList.contains("open")));
  menu.addEventListener("click", (e) => {
    if (e.target.closest("a")) setMenu(false);
  });

  function label(lang) {
    const d = LABELS[lang] || LABELS.en;
    document.querySelectorAll("[data-nav]").forEach((el) => {
      el.textContent = d[el.dataset.nav] || "";
    });
  }

  const page = location.pathname.split("/").pop().replace(/\.html$/, "");
  document.querySelectorAll(".nav-links [data-nav], .mobile-menu [data-nav]").forEach((a) => {
    if (a.getAttribute("href").replace(/\.html$/, "") === page) a.classList.add("active");
  });

  document.querySelectorAll("#langs button").forEach((b) => b.addEventListener("click", () => label(b.dataset.lang)));

  let saved = null;
  try {
    saved = localStorage.getItem("bf.site.lang");
  } catch (e) {
    /* private mode — fall back to the browser language */
  }
  const sys = (navigator.language || "en").slice(0, 2);
  label(saved || (["hu", "de"].includes(sys) ? sys : "en"));
})();
