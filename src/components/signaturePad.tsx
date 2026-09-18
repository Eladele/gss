import { useRef, useState, useEffect } from 'react';
import { Button } from '@/components/ui';

interface SignaturePadProps {
  initialValue?: string | null;
  onSave: (base64: string) => void;
  onClear?: () => void;
}

export function SignaturePad({ initialValue, onSave, onClear }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const [hasDrawing, setHasDrawing] = useState(!!initialValue);

  // Résolution interne x2 pour un tracé net (écrans rétina/tactiles)
  const W = 500, H = 180, SCALE = 2;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(SCALE, SCALE);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1e293b';

    if (initialValue) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, W, H);
      img.src = initialValue;
    }
  }, []);

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawing.current = true;
    lastPoint.current = getPos(e);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext('2d')!;
    const p = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPoint.current!.x, lastPoint.current!.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastPoint.current = p;
    setHasDrawing(true);
  };

  const end = () => {
    drawing.current = false;
    lastPoint.current = null;
  };

  const clear = () => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, W * SCALE, H * SCALE);
    setHasDrawing(false);
    onClear?.();
  };

  const save = () => {
    const canvas = canvasRef.current!;
    // Fond transparent conservé (pas de fillRect) -> s'intègre proprement sur fond blanc Excel
    onSave(canvas.toDataURL('image/png'));
  };

  return (
    <div className="space-y-3">
      <div className="border-2 border-dashed border-slate-300 rounded-lg bg-slate-50 inline-block">
        <canvas
          ref={canvasRef}
          width={W * SCALE}
          height={H * SCALE}
          style={{ width: W, height: H, touchAction: 'none', cursor: 'crosshair' }}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
        />
      </div>
      <p className="text-[11px] text-slate-400">Signez avec la souris ou le doigt (tablette/mobile) dans le cadre ci-dessus.</p>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={clear}>Effacer</Button>
        <Button onClick={save} disabled={!hasDrawing}>Enregistrer la signature</Button>
      </div>
    </div>
  );
}