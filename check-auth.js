function redirectToLogin() {
  try {
    localStorage.removeItem("token");
  } catch (e) {}
  location.replace("/login/login.html");
}
function checkAuth() {
  const token = localStorage.getItem("token");
  if (!token) return redirectToLogin();
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (payload && payload.exp && Date.now() > payload.exp * 1000)
      return redirectToLogin();
  } catch (e) {
    return redirectToLogin();
  }
}
checkAuth();
window.addEventListener("pageshow", (event) => checkAuth());

// /check-auth.js
