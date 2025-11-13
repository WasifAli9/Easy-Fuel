import { useEffect, useRef, useState, type CanvasHTMLAttributes } from "react";
import { Button } from "@/components/ui/button";
import clsx from "clsx";

interface SignaturePadProps {
  value?: string | null;
  onChange?: (dataUrl: string | null) => void;
  height?: number;
  className?: string;
  clearLabel?: string;
  disabled?: boolean;
  canvasProps?: CanvasHTMLAttributes<HTMLCanvasElement>;
}

export function SignaturePad({
  value = null,
  onChange,
  height = 150,
  className,
  clearLabel = "Clear Signature",
  disabled = false,
  canvasProps,
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Adjust for device pixel ratio for sharper lines
    const dpi = window.devicePixelRatio || 1;
    const width = canvas.clientWidth * dpi;
    const heightPx = height * dpi;

    if (canvas.width !== width || canvas.height !== heightPx) {
      canvas.width = width;
      canvas.height = heightPx;
      ctx.scale(dpi, dpi);
    }

    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#000000";

    if (value) {
      const image = new Image();
      image.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0, canvas.clientWidth, height);
      };
      image.src = value;
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, [value, height]);

  const getCoordinates = (
    event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();

    if ("touches" in event) {
      const touch = event.touches[0];
      if (!touch) return null;
      return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
      };
    }

    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  };

  const handleStart = (
    event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    if (disabled) return;
    event.preventDefault();

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const coordinates = getCoordinates(event);
    if (!coordinates) return;

    ctx.beginPath();
    ctx.moveTo(coordinates.x, coordinates.y);
    setIsDrawing(true);
  };

  const handleMove = (
    event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    if (!isDrawing || disabled) return;
    event.preventDefault();

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const coordinates = getCoordinates(event);
    if (!coordinates) return;

    ctx.lineTo(coordinates.x, coordinates.y);
    ctx.stroke();
  };

  const handleEnd = () => {
    if (!isDrawing) return;
    setIsDrawing(false);

    const canvas = canvasRef.current;
    if (!canvas) return;

    onChange?.(canvas.toDataURL());
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    onChange?.(null);
  };

  return (
    <div className={clsx("space-y-2", className)}>
      <canvas
        ref={canvasRef}
        height={height}
        className={clsx(
          "border rounded cursor-crosshair w-full touch-none bg-white",
          disabled && "cursor-not-allowed opacity-50"
        )}
        onMouseDown={handleStart}
        onMouseMove={handleMove}
        onMouseUp={handleEnd}
        onMouseLeave={handleEnd}
        onTouchStart={handleStart}
        onTouchMove={handleMove}
        onTouchEnd={handleEnd}
        aria-label="Signature pad"
        {...canvasProps}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleClear}
        disabled={disabled}
      >
        {clearLabel}
      </Button>
    </div>
  );
}

