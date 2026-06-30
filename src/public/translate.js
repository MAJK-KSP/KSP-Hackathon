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

  // Check active language from localStorage
  const currentLang = localStorage.getItem('pref-lang') || 'en';
  const isKannada = currentLang === 'kn';

  if (langText) {
    langText.textContent = isKannada ? 'English' : 'ಕನ್ನಡ';
  }

  // Function to programmatically trigger Google Translate
  function triggerGoogleTranslate(langCode) {
    const select = document.querySelector('select.goog-te-combo');
    if (select) {
      select.value = langCode;
      select.dispatchEvent(new Event('change'));
    } else {
      // If the select isn't ready yet, retry in 100ms
      setTimeout(() => triggerGoogleTranslate(langCode), 150);
    }
  }

  // If the preferred language is Kannada, trigger it on load
  if (isKannada) {
    triggerGoogleTranslate('kn');
  }

  if (langToggle) {
    langToggle.addEventListener('click', () => {
      const activeLang = localStorage.getItem('pref-lang') || 'en';
      const newLang = activeLang === 'kn' ? 'en' : 'kn';
      localStorage.setItem('pref-lang', newLang);
      
      if (langText) {
        langText.textContent = newLang === 'kn' ? 'English' : 'ಕನ್ನಡ';
      }

      if (newLang === 'kn') {
        triggerGoogleTranslate('kn');
      } else {
        // Reset to English (default) by selecting empty value in Google Translate combo
        triggerGoogleTranslate('');
      }
    });
  }
});
