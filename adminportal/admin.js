import { logoutAndRedirect } from "../logout-auth.js";

document.addEventListener("DOMContentLoaded", function () {
  // ================= Sidebar & Navigation =================
  const openSidebar = document.getElementById("open-sidebar");
  const closeSidebar = document.getElementById("close-sidebar");
  const sidebar = document.querySelector(".sidebar");
  const mainContent = document.querySelector(".main-content");
  const navLinks = document.querySelectorAll(
    '.sidebar a[href^="#"]:not([href="#"])'
  );

  // Overlay for mobile
  const overlay = document.createElement("div");
  overlay.className = "overlay";
  document.body.appendChild(overlay);

  function updateLayout() {
    const isDesktop = window.innerWidth >= 992;
    const sidebarVisible = sidebar.classList.contains("show");
    mainContent.classList.toggle("with-sidebar", isDesktop && sidebarVisible);
  }

  function showSidebar() {
    sidebar.classList.add("show");
    overlay.classList.add("active");
    updateLayout();
  }

  function hideSidebar() {
    sidebar.classList.remove("show");
    overlay.classList.remove("active");
    updateLayout();
  }

  window.addEventListener("resize", updateLayout);
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".sidebar") && !openSidebar.contains(e.target)) {
      hideSidebar();
    }
  });

  openSidebar.addEventListener("click", showSidebar);
  closeSidebar.addEventListener("click", hideSidebar);
  overlay.addEventListener("click", hideSidebar);

  // Dropdowns in sidebar
  const dropdowns = document.querySelectorAll(".dropdown-toggle");
  dropdowns.forEach((dropdown) => {
    dropdown.addEventListener("click", function (e) {
      e.preventDefault();
      dropdowns.forEach((other) => {
        if (other !== this) other.parentElement.classList.remove("active");
      });
      this.parentElement.classList.toggle("active");
    });
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".dropdown")) {
      dropdowns.forEach((d) => d.parentElement.classList.remove("active"));
    }
  });

  // Navigation (hash-based)
  function checkHash() {
    const hash = window.location.hash || "#dashboard";
    const targetSection = document.querySelector(hash);

    document
      .querySelectorAll("section")
      .forEach((sec) => (sec.style.display = "none"));
    if (targetSection) targetSection.style.display = "block";
    else document.querySelector("#dashboard").style.display = "block";

    navLinks.forEach((link) => {
      link.classList.remove("active");
      if (link.getAttribute("href") === hash) {
        link.classList.add("active");
        const dropdown = link.closest(".dropdown");
        if (dropdown) dropdown.classList.add("active");
      }
    });
  }

  navLinks.forEach((link) => {
    link.addEventListener("click", function (e) {
      if (this.hash && this.hash !== "#") {
        e.preventDefault();
        history.pushState(null, null, this.hash);
        checkHash();
        if (window.innerWidth < 992) hideSidebar();
      }
    });
  });
  // date widget
  (function () {
    // Node selectors (matches your HTML classes)
    const dateEl = document.querySelector(".datetime-widget .current-date");
    const timeEl = document.querySelector(".datetime-widget .current-time");

    // Use Manila timezone explicitly
    const TIMEZONE = "Asia/Manila";

    // Formatting options
    const dateOptions = {
      timeZone: TIMEZONE,
      year: "numeric",
      month: "long",
      day: "numeric",
    };

    const timeOptions = {
      timeZone: TIMEZONE,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    };

    function updateDateTime() {
      const now = new Date();

      if (dateEl) {
        dateEl.textContent = now.toLocaleDateString(
          navigator.language || "en-US",
          dateOptions
        );
      }

      if (timeEl) {
        timeEl.textContent = now.toLocaleTimeString(
          navigator.language || "en-US",
          timeOptions
        );
      }
    }
    // Initialize and schedule updates
    updateDateTime();
    // Update every 1 second so the minute flips exactly on time.
    setInterval(updateDateTime, 1000);
  })();

  // calendar widget

  window.addEventListener("hashchange", checkHash);
  checkHash();

  // Logout
  document.getElementById("logout-btn").addEventListener("click", () => {
    logoutAndRedirect("../login/login.html");
  });
});
