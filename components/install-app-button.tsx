"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{outcome:"accepted"|"dismissed"}>;
}

export function InstallAppButton(){
  const [prompt,setPrompt]=useState<InstallPromptEvent|null>(null);const [help,setHelp]=useState(false);const [installed,setInstalled]=useState(false);
  useEffect(()=>{
    if("serviceWorker" in navigator)void navigator.serviceWorker.register("/controles-varios-sk/sw.js");
    const standalone=window.matchMedia("(display-mode: standalone)").matches||(navigator as Navigator&{standalone?:boolean}).standalone===true;setInstalled(standalone);
    const ready=(event:Event)=>{event.preventDefault();setPrompt(event as InstallPromptEvent);};const done=()=>{setInstalled(true);setPrompt(null);};
    window.addEventListener("beforeinstallprompt",ready);window.addEventListener("appinstalled",done);return()=>{window.removeEventListener("beforeinstallprompt",ready);window.removeEventListener("appinstalled",done);};
  },[]);
  if(installed)return null;
  async function install(){if(prompt){await prompt.prompt();const choice=await prompt.userChoice;if(choice.outcome==="accepted")setPrompt(null);}else setHelp(true);}
  return <><Button type="button" onClick={install} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-[#0d2c3e] shadow-sm hover:bg-slate-100"><Download className="h-4 w-4"/><span>INSTALAR APP</span></Button><Dialog open={help} onOpenChange={setHelp}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>INSTALAR APP</DialogTitle></DialogHeader><div className="space-y-3 text-sm text-slate-600"><p><b>En iPhone o iPad:</b> abra Compartir y seleccione <b>Añadir a pantalla de inicio</b>.</p><p><b>En Android:</b> abra el menú del navegador y seleccione <b>Instalar aplicación</b> o <b>Añadir a pantalla principal</b>.</p><p><b>En Edge para Windows:</b> abra el menú de tres puntos (⋯), entre en <b>Más herramientas → Aplicaciones → Instalar este sitio como aplicación</b>. También puede usar el icono de instalación de la barra de direcciones si aparece.</p><p>Después de instalarla, puede crear el icono del escritorio desde <b>edge://apps</b>. «Crear acceso directo» solo abre una página del navegador.</p></div><Button type="button" onClick={()=>setHelp(false)} className="bg-[#0d2c3e]">ENTENDIDO</Button></DialogContent></Dialog></>;
}
