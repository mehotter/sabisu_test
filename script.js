// Sabisu — shared behaviour: mobile menu, booking prefill, form confirmation, review filter.
(() => {
  "use strict";

  /* Mobile menu */
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.getElementById("site-nav");
  if (toggle && nav) {
    const setOpen = (open) => {
      nav.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.textContent = open ? "Close" : "Menu";
    };
    toggle.addEventListener("click", () => setOpen(!nav.classList.contains("is-open")));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && nav.classList.contains("is-open")) {
        setOpen(false);
        toggle.focus();
      }
    });
  }

  /* Dates: nothing earlier than today */
  const localISO = (d) =>
    new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  document.querySelectorAll('input[type="date"]').forEach((input) => {
    input.min = localISO(new Date());
  });

  /* Carry the service and date chosen on another page into the booking form */
  const reserveForm = document.getElementById("reserve-form");
  if (reserveForm) {
    const params = new URLSearchParams(location.search);
    const service = params.get("service");
    const date = params.get("date");
    if (service && reserveForm.elements.service) reserveForm.elements.service.value = service;
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date) && reserveForm.elements.date) {
      reserveForm.elements.date.value = date;
    }
  }

  /* Forms: inline validation, then a confirmation panel.
     NOTE: nothing is sent anywhere yet. Connect `onValid` to your booking
     backend, CRM or email service before launch. */
  const showError = (control, message) => {
    const field = control.closest(".field, .rating");
    if (!field) return;
    let error = field.querySelector(".field-error");
    if (!error) {
      error = document.createElement("p");
      error.className = "field-error";
      error.id = `${control.name}-error`;
      field.appendChild(error);
    }
    error.textContent = message;
    error.hidden = !message;
    field.querySelectorAll("input, select, textarea").forEach((el) => {
      if (message) {
        el.setAttribute("aria-invalid", "true");
        el.setAttribute("aria-describedby", error.id);
      } else {
        el.removeAttribute("aria-invalid");
        el.removeAttribute("aria-describedby");
      }
    });
  };

  const optionLabel = (select) =>
    select && select.selectedIndex > 0 ? select.options[select.selectedIndex].text : "";

  const summaries = {
    reserve(form) {
      const parts = [optionLabel(form.elements.service)];
      if (form.elements.date.value) {
        const [y, m, d] = form.elements.date.value.split("-").map(Number);
        parts.push(
          new Date(y, m - 1, d).toLocaleDateString("en-IN", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })
        );
      }
      const slot = form.querySelector('input[name="window"]:checked');
      if (slot) parts.push(slot.closest("label").textContent.trim().toLowerCase());
      return parts.filter(Boolean).join(", ");
    },
    review(form) {
      const rating = form.querySelector('input[name="rating"]:checked');
      return rating ? `${rating.value} out of 5 for ${optionLabel(form.elements.service).toLowerCase()}` : "";
    },
  };

  document.querySelectorAll("form[data-confirm]").forEach((form) => {
    form.noValidate = true;

    form.addEventListener("input", (e) => {
      if (e.target.matches("[aria-invalid]") && e.target.validity.valid) showError(e.target, "");
    });

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const seen = new Set();
      let firstInvalid = null;
      Array.from(form.elements).forEach((control) => {
        if (!control.willValidate || seen.has(control.name)) return;
        seen.add(control.name);
        const ok = control.validity.valid;
        showError(control, ok ? "" : control.dataset.error || control.validationMessage);
        if (!ok && !firstInvalid) firstInvalid = control;
      });
      if (firstInvalid) {
        firstInvalid.focus();
        return;
      }

      const panel = document.getElementById(form.dataset.confirm);
      const summary = panel.querySelector("[data-summary]");
      const build = summaries[form.dataset.kind];
      if (summary && build) summary.textContent = build(form);
      form.hidden = true;
      panel.hidden = false;
      panel.focus();
    });
  });

  /* Reviews: average, count and filter by service */
  const reviews = Array.from(document.querySelectorAll(".review[data-service]"));
  if (reviews.length) {
    const ratings = reviews.map((r) => Number(r.dataset.rating));
    const average = ratings.reduce((a, b) => a + b, 0) / ratings.length;
    const avgEl = document.getElementById("score-average");
    const countEl = document.getElementById("score-count");
    if (avgEl) avgEl.textContent = average.toFixed(1);
    if (countEl) countEl.textContent = `${reviews.length} reviews`;

    const status = document.getElementById("filter-status");
    const chips = Array.from(document.querySelectorAll(".chip[data-filter]"));
    chips.forEach((chip) => {
      chip.addEventListener("click", () => {
        const filter = chip.dataset.filter;
        chips.forEach((c) => c.setAttribute("aria-pressed", String(c === chip)));
        let shown = 0;
        reviews.forEach((review) => {
          const match = filter === "all" || review.dataset.service === filter;
          review.hidden = !match;
          if (match) shown += 1;
        });
        if (status) {
          const noun = shown === 1 ? "review" : "reviews";
          status.textContent =
            filter === "all"
              ? `Showing all ${shown} reviews`
              : `Showing ${shown} ${noun} for ${chip.textContent.trim().toLowerCase()}`;
        }
      });
    });
  }

  /* Carousels: arrow buttons scroll the strip they point at */
  document.querySelectorAll(".arrow[data-scroll]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const strip = document.getElementById(btn.dataset.scroll);
      if (!strip) return;
      const step = strip.firstElementChild.getBoundingClientRect().width + 18;
      strip.scrollBy({ left: btn.dataset.dir === "prev" ? -step : step, behavior: "smooth" });
    });
  });

  /* Footer year */
  document.querySelectorAll("[data-year]").forEach((el) => {
    el.textContent = new Date().getFullYear();
  });
})();


// Appear on scroll: sections and cards fade and slide in as they enter the screen.
(() => {
  "use strict";
  if (!("IntersectionObserver" in window)) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const groups = [
    [".hero2-grid > :first-child, .page-head-row > :first-child, .split > :first-child, .teaser > :first-child, .hive-layout > :first-child, .contact-grid > :first-child", "reveal-left"],
    [".hero2-grid > :last-child, .split > :last-child, .teaser > :last-child, .contact-grid > :last-child", "reveal-right"],
    [".hive li, .page-head .seal, .swatch", "reveal-zoom"],
    [".band-head, .head-row, .trust, .tile, .card, .service, .commitment, .steps li, .belief, .review, .table-wrap, .table-note, .closing, .reach a, .photo-row .ph, .video-ph, .score, .chips, .sample-note, .footer-grid > *", ""],
  ];
  const seen = new Set();
  const items = [];
  groups.forEach(([selector, variant]) => {
    document.querySelectorAll(selector).forEach((el) => {
      if (seen.has(el) || el.closest(".reveal")) return;
      seen.add(el);
      el.classList.add("reveal");
      if (variant) el.classList.add(variant);
      const index = Array.prototype.indexOf.call(el.parentElement.children, el);
      el.style.setProperty("--reveal-delay", Math.min(index, 5) * 80 + "ms");
      items.push(el);
    });
  });

  const done = (el) => {
    el.classList.remove("reveal", "reveal-left", "reveal-right", "reveal-zoom", "in");
    el.style.removeProperty("--reveal-delay");
  };
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      observer.unobserve(el);
      el.classList.add("in");
      setTimeout(() => done(el), 1400);
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
  items.forEach((el) => observer.observe(el));
})();
