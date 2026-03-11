(function loadUnifiedSiteAssistant() {
  if (window.__FLINT_SITE_ASSISTANT_ACTIVE) return;

  const currentScript = document.currentScript;
  const scriptSrc = currentScript && currentScript.src
    ? new URL("../site-assistant/site-assistant.js", currentScript.src).toString()
    : "/assets/site-assistant/site-assistant.js";
  const cssHref = currentScript && currentScript.src
    ? new URL("../site-assistant/site-assistant.css", currentScript.src).toString()
    : "/assets/site-assistant/site-assistant.css";

  if (!document.querySelector('link[href*="site-assistant.css"]')) {
    const style = document.createElement("link");
    style.rel = "stylesheet";
    style.href = cssHref;
    document.head.appendChild(style);
  }

  if (!document.querySelector('script[src*="site-assistant.js"]')) {
    const script = document.createElement("script");
    script.src = scriptSrc;
    script.defer = true;
    document.head.appendChild(script);
  }
}());
