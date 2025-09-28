
export async function logoutAndRedirect(loginPath = "/login/login.html") {
  try {
    const token = localStorage.getItem("token");
    // Remove token immediately
    localStorage.removeItem("token");

    // Call server to revoke token (best-effort)
    if (token) {
      try {
        await fetch("/auth/logout", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + token
          },
          body: JSON.stringify({ token })
        });
      } catch (err) {
        console.warn("Logout: revoke request failed", err);
      }
    }

    // Replace history and go to login
    window.location.replace(loginPath);
  } catch (err) {
    console.error("logout error", err);
    window.location.replace(loginPath);
  }
}