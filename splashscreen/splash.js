document.addEventListener('DOMContentLoaded', function() {
    const splashScreen = document.getElementById('splashScreen');
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    
    // Start animation after short delay
    setTimeout(() => {
        splashScreen.querySelector('.splash-content').classList.add('animate');
        
        // Hide splash screen after animation completes
        setTimeout(() => {
            splashScreen.classList.add('hide');
            
            // Remove splash screen after fade out
            setTimeout(() => {
                window.location.href = "../main.html";
                splashScreen.remove();
            }, 800);
      
        }, isMobile ? 2500 : 3000); // duration for mobile
    }, 300);
});