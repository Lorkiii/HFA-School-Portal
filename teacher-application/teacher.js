import { logoutAndRedirect } from "../logout-auth.js";


document.addEventListener('DOMContentLoaded', () => {
    // DOM elements
    const openSidebar = document.getElementById('open-sidebar');
    const closeSidebar = document.getElementById('close-sidebar');
    const sidebar = document.querySelector('.sidebar');
    const mainContent = document.querySelector('.main-content');
    const navLinks = document.querySelectorAll('.sidebar a[href^="#"]:not([href="#"])'); // Get all sidebar navigation links with href starting with #

    // Create overlay element for mobile
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    document.body.appendChild(overlay);

    function updateLayout() {
        const isDesktop = window.innerWidth >= 992;
        const sidebarVisible = sidebar.classList.contains('show');
        
        [mainContent].forEach(element => {
            element.classList.toggle('with-sidebar', isDesktop && sidebarVisible);
        });
    }

    // Function to open sidebar
    function showSidebar() {
        sidebar.classList.add('show');
        overlay.classList.add('active');
        updateLayout();
    }
    
    // Function to close sidebar
    function hideSidebar() {
        sidebar.classList.remove('show');
        overlay.classList.remove('active');
        updateLayout();
    }

    // Handle window resize
    window.addEventListener('resize', updateLayout);

    // Close sidebar when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.sidebar') && !openSidebar.contains(e.target)) {
            hideSidebar();
        }
    });

    // Event Listeners
    openSidebar.addEventListener('click', showSidebar);
    closeSidebar.addEventListener('click', hideSidebar);
    overlay.addEventListener('click', hideSidebar);

 

    // Smooth scrolling for sidebar links
    navLinks.forEach(link => {  
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href').substring(1);
            const targetElement = document.getElementById(targetId);
            
            if (targetElement) {
                targetElement.scrollIntoView({ behavior: 'smooth' });
                hideSidebar(); // Close sidebar after navigation
            }
        });
    });
    // Close dropdowns when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.sidebar') && !openSidebar.contains(e.target)) {
            hideSidebar();
        }
    });
    // Logout button
      document.getElementById("logout-btn").addEventListener("click", () => {
    logoutAndRedirect("../login/login.html");
  });

});