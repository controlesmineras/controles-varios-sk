// El navegador puede anunciar la instalación antes de que se valide la sesión.
window.addEventListener("beforeinstallprompt",event=>{
  event.preventDefault();
  window.__explosivosInstallPrompt=event;
  window.dispatchEvent(new Event("explosivosinstallprompt"));
});
window.addEventListener("appinstalled",()=>{window.__explosivosInstallPrompt=null});
