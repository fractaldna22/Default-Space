import React, { useState, useCallback, useEffect, useRef } from 'react';
import { GripVertical } from 'lucide-react';

interface ResizeDividerProps {
  side: 'left' | 'right';
  onResize: (clientX: number) => void;
  onResizeEnd?: () => void;
  onDoubleClick?: () => void;
  title?: string;
}

export const ResizeDivider: React.FC<ResizeDividerProps> = ({
  side,
  onResize,
  onResizeEnd,
  onDoubleClick,
  title
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    isDraggingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    setIsDragging(true);
    isDraggingRef.current = true;
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      onResize(e.clientX);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDraggingRef.current || !e.touches[0]) return;
      onResize(e.touches[0].clientX);
    };

    const handleMouseUp = () => {
      if (isDraggingRef.current) {
        setIsDragging(false);
        isDraggingRef.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        onResizeEnd?.();
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleMouseUp);
    window.addEventListener('touchcancel', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleMouseUp);
      window.removeEventListener('touchcancel', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, onResize, onResizeEnd]);

  return (
    <div
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      onDoubleClick={onDoubleClick}
      className={`absolute top-0 bottom-0 z-30 w-2.5 hover:w-3 group cursor-col-resize select-none flex items-center justify-center transition-all ${
        side === 'left' ? '-right-1.5' : '-left-1.5'
      }`}
      title={title || "Drag to resize sidebar width (double-click to reset)"}
    >
      {/* Visual divider line */}
      <div
        className={`w-0.5 h-full transition-all ${
          isDragging
            ? 'bg-[#c2a472] shadow-[0_0_8px_#c2a472]'
            : 'bg-transparent group-hover:bg-[#c2a472]/60 group-hover:shadow-[0_0_4px_#c2a472]'
        }`}
      />

      {/* Centered grip badge icon */}
      <div
        className={`absolute top-1/2 -translate-y-1/2 rounded-full p-0.5 flex items-center justify-center transition-all shadow-md ${
          isDragging
            ? 'bg-[#c2a472] text-black scale-110'
            : 'bg-[#1a1a1e] border border-[#2e2e34] text-zinc-500 opacity-0 group-hover:opacity-100 group-hover:text-[#c2a472]'
        }`}
      >
        <GripVertical className="w-2.5 h-3.5" />
      </div>
    </div>
  );
};
