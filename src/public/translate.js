// Google Translate Element Initialization
window.googleTranslateElementInit = function() {
  new google.translate.TranslateElement({
    pageLanguage: 'en',
    includedLanguages: 'kn',
    layout: google.translate.TranslateElement.InlineLayout.SIMPLE
  }, 'google_translate_element');
};

// Load Google Translate Script dynamically
(function() {
  // Create off-screen element container for Google Translate (display:none can prevent initialization)
  const el = document.createElement('div');
  el.id = 'google_translate_element';
  el.style.position = 'absolute';
  el.style.top = '-9999px';
  el.style.left = '-9999px';
  el.style.width = '1px';
  el.style.height = '1px';
  el.style.overflow = 'hidden';
  document.body.appendChild(el);

  // Load the script
  const script = document.createElement('script');
  script.type = 'text/javascript';
  script.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
  document.head.appendChild(script);
})();

// Language switching logic
document.addEventListener('DOMContentLoaded', () => {
  const langToggle = document.getElementById('lang-toggle');
  const langText = document.getElementById('lang-text');
  
  // Check active language from cookie
  const getCookie = (name) => {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
  };

  const currentTrans = getCookie('googtrans');
  // Google Translate can store it as '/en/kn' or just '/en/kn' with other parameters
  const isKannada = currentTrans && currentTrans.includes('/en/kn');

  if (langText) {
    langText.textContent = isKannada ? 'English' : 'ಕನ್ನಡ';
  }

  if (langToggle) {
    langToggle.addEventListener('click', () => {
      if (isKannada) {
        // Switch to English: clear the cookie
        document.cookie = "googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
        // Clear for current domain too
        document.cookie = "googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=" + window.location.hostname;
      } else {
        // Switch to Kannada: set the cookie
        document.cookie = "googtrans=/en/kn; path=/";
      }
      window.location.reload();
    });
  }
});
