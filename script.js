
document.addEventListener('DOMContentLoaded', function() {
const openMenu = document.querySelector("#menu-open-button");
const closeMenu = document.querySelector("#menu-close-button");

// toggle menu
openMenu.addEventListener("click", () =>{
    document.body.classList.toggle("show-menu");
});
// close the menu
closeMenu.addEventListener("click", () => openMenu.click());

// for login button that will locate to login page
document.getElementById("loginbtn").addEventListener("click", function(event) {
    event.preventDefault(); // Prevents any default behavior (if it's inside a link or form)
    window.location.href = "login/login.html"; // path for login
});

document.getElementById('applynow').addEventListener("click", function() {
    window.location.href = "applicationform/tcfrom.html";
 
 });
});

    