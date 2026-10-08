"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { Camera, ImagePlus, Loader2, ScanBarcode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

function cameraError(cause: unknown) {
  const name = cause instanceof Error ? cause.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "No se permitió usar la cámara. Habilita el permiso de cámara para esta app o usa una foto del código.";
  if (name === "NotFoundError") return "No se encontró una cámara. Puedes leer el código desde una foto.";
  if (name === "NotReadableError") return "La cámara está ocupada. Cierra otras apps que la estén usando y vuelve a intentar.";
  return "No se pudo abrir la cámara. Inténtalo de nuevo o usa una foto del código.";
}

function Scanner({ onRead }: { onRead: (code: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const controls = useRef<IScannerControls | null>(null);
  const attempt = useRef(0);
  const [state, setState] = useState<"idle" | "starting" | "scanning" | "photo">("idle");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const stop = useCallback(() => {
    attempt.current += 1;
    controls.current?.stop();
    controls.current = null;
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
  }, []);

  useEffect(() => {
    const pause = () => {
      if (document.hidden) {
        stop();
        setState("idle");
        setNotice("Cámara pausada. Toca Abrir cámara para continuar.");
      }
    };
    document.addEventListener("visibilitychange", pause);
    return () => {
      document.removeEventListener("visibilitychange", pause);
      stop();
    };
  }, [stop]);

  async function startCamera() {
    stop();
    setError("");
    setNotice("");
    if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
      setError("La cámara no está disponible aquí. Abre la app desde su enlace HTTPS o usa una foto del código.");
      setState("idle");
      return;
    }
    const current = attempt.current;
    setState("starting");
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
      if (current !== attempt.current || !video.current) {
        media.getTracks().forEach(track => track.stop());
        return;
      }
      stream.current = media;
      const reader = new BrowserMultiFormatReader(undefined, { delayBetweenScanAttempts: 200, delayBetweenScanSuccess: 1000 });
      const scannerControls = await reader.decodeFromStream(media, video.current, (result, _error, activeControls) => {
        if (current !== attempt.current) { activeControls.stop(); return; }
        const code = result?.getText().trim();
        if (!code) return;
        activeControls.stop();
        stop();
        onRead(code);
      });
      if (current !== attempt.current) scannerControls.stop();
      else { controls.current = scannerControls; setState("scanning"); }
    } catch (cause) {
      if (current !== attempt.current) return;
      stop();
      setState("idle");
      setError(cameraError(cause));
    }
  }

  async function readPhoto(file: File) {
    stop();
    const current = attempt.current;
    setError("");
    setNotice("");
    setState("photo");
    const url = URL.createObjectURL(file);
    try {
      const result = await new BrowserMultiFormatReader().decodeFromImageUrl(url);
      if (current !== attempt.current) return;
      const code = result.getText().trim();
      if (!code) throw new Error("empty");
      stop();
      onRead(code);
    } catch {
      if (current === attempt.current) setError("No se pudo leer el código en esa foto. Usa una imagen nítida, de frente, con el código completo y margen a ambos lados.");
    } finally {
      URL.revokeObjectURL(url);
      if (current === attempt.current) setState("idle");
    }
  }

  const cameraActive = state === "starting" || state === "scanning";
  return <div className="min-w-0 space-y-4">
    <div className={cameraActive ? "relative overflow-hidden rounded-xl bg-slate-950" : "hidden"}>
      <video ref={video} muted autoPlay playsInline className="aspect-[4/3] max-h-[40dvh] w-full object-contain" aria-label="Vista de la cámara para escanear" />
      <div className="pointer-events-none absolute inset-x-[8%] top-[25%] h-[50%] rounded-lg border-2 border-amber-400" aria-hidden="true" />
    </div>
    <p className="text-sm text-slate-600" role="status">{state === "starting" ? "Abriendo cámara… Acepta el permiso si tu dispositivo lo solicita." : state === "scanning" ? "Enfoca un solo código completo. Si no lee, aleja un poco el celular y evita reflejos." : state === "photo" ? "Leyendo foto…" : notice || "Usa la cámara trasera o selecciona una foto del código de barras o QR."}</p>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <div className="flex flex-wrap gap-2">
      {cameraActive ? <Button type="button" variant="outline" onClick={() => { stop(); setState("idle"); }}>DETENER CÁMARA</Button> : <Button type="button" className="bg-[#0d2c3e]" disabled={state === "photo"} onClick={() => void startCamera()}><Camera className="h-4 w-4" />ABRIR CÁMARA</Button>}
      <Button type="button" variant="outline" disabled={state === "photo"} onClick={() => { stop(); setState("idle"); fileInput.current?.click(); }}>{state === "photo" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}LEER FOTO</Button>
      <input ref={fileInput} type="file" accept="image/*" className="hidden" aria-label="Foto del código" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void readPhoto(file); }} />
    </div>
    <p className="text-xs text-slate-500">La lectura busca el serial o número de caja. Revisa la coincidencia y marca el check de revista. Los filtros actuales se conservan.</p>
  </div>;
}

export function BarcodeScanner({ onRead }: { onRead: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button type="button" variant="outline" className="h-11 w-full border-[#0d2c3e]/30 bg-white text-[#0d2c3e]"><ScanBarcode className="h-5 w-5" />ESCANEAR CÓDIGO</Button></DialogTrigger>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
      <DialogHeader><DialogTitle>ESCANEAR CÓDIGO</DialogTitle><DialogDescription>Busca un registro para pasar revista. La lectura se realiza en tu dispositivo.</DialogDescription></DialogHeader>
      {open && <Scanner onRead={code => { onRead(code); setOpen(false); }} />}
    </DialogContent>
  </Dialog>;
}
