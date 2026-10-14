import { useRef, useState, useEffect } from 'react';
import { Button } from '@/components/ui';
import { SIGNATURE_DG_BASE64 } from '@/assets/signature';

interface SignaturePadProps {
    initialValue?: string | null;
    onSave: (base64: string) => void;
    onClear?: () => void;
}

// Le base64 brut (sans préfixe) est un JPEG → on ajoute le préfixe data-URL
const toDataUrl = (b64: string) => (b64.startsWith('data:') ? b64 : `data:image/jpeg;base64,${b64}`);
const SIGNATURE_DG_DATA_URL = toDataUrl(SIGNATURE_DG_BASE64);

export function SignaturePad({ initialValue, onSave, onClear }: SignaturePadProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const drawing = useRef(false);
    const lastPoint = useRef<{ x: number; y: number } | null>(null);
    const [hasDrawing, setHasDrawing] = useState(!!initialValue);

    // Résolution interne x2 pour un tracé net (écrans rétina/tactiles)
    const W = 500, H = 180, SCALE = 2;

    // Dessine une image dans le cadre, centrée et sans déformation
    const drawImageFit = (src: string) => {
        const ctx = canvasRef.current?.getContext('2d');
        if (!ctx) return;
        const img = new Image();
        img.onload = () => {
            ctx.clearRect(0, 0, W, H);
            const ratio = Math.min(W / img.width, H / img.height);
            const w = img.width * ratio;
            const h = img.height * ratio;
            ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
            setHasDrawing(true);
        };
        img.onerror = () => alert("Image illisible — vérifie que le base64 / le fichier est valide.");
        img.src = src;
    };

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0); // setTransform (et non scale) : pas de double mise à l'échelle en StrictMode
        ctx.lineWidth = 2.2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#1e293b';

        if (initialValue) drawImageFit(initialValue);
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
        ctx.clearRect(0, 0, W, H);
        setHasDrawing(false);
        onClear?.();
    };

    const save = () => {
        // Toujours exporté en PNG (fond transparent conservé)
        onSave(canvasRef.current!.toDataURL('image/png'));
    };

    // Choix d'un fichier image (PNG/JPG) → converti en base64 puis affiché dans le cadre
    const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = ''; // permet de re-choisir le même fichier
        if (!file) return;
        if (file.size > 1024 * 1024) {
            alert('Image trop lourde (max 1 Mo).');
            return;
        }
        const reader = new FileReader();
        reader.onload = () => drawImageFit(reader.result as string);
        reader.readAsDataURL(file);
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

            <p className="text-[11px] text-slate-400">
                Signez avec la souris ou le doigt, ou choisissez une image ci-dessous.
            </p>

            {/* Choix d'une image déjà prête */}
            <div className="flex gap-2 flex-wrap">
                <Button variant="outline" onClick={() => drawImageFit(SIGNATURE_DG_DATA_URL)}>
                    Utiliser la signature du DG
                </Button>
                <Button variant="outline" onClick={() => fileRef.current?.click()}>
                    Importer une image…
                </Button>
                <input ref={fileRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={onFile} />
            </div>

            <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={clear}>Effacer</Button>
                <Button onClick={save} disabled={!hasDrawing}>Enregistrer la signature</Button>
            </div>
        </div>
    );
}