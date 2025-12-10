import React, { useEffect, useCallback, useState } from 'react';
import { CloseIcon, ChevronLeftIcon, ChevronRightIcon, DownloadIcon, CopyIcon } from './Icons';

export interface LightboxImage {
  src: string;
  label: string;
  prompt?: string;
}

interface LightboxProps {
  images: LightboxImage[];
  initialIndex: number;
  onClose: () => void;
}

export const Lightbox: React.FC<LightboxProps> = ({ images, initialIndex, onClose }) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [copied, setCopied] = useState(false);

  // Sync internal state if prop changes (though usually we just mount/unmount)
  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex]);

  const handleNext = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % images.length);
  }, [images.length]);

  const handlePrev = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
  }, [images.length]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'ArrowRight') handleNext();
    if (e.key === 'ArrowLeft') handlePrev();
  }, [onClose, handleNext, handlePrev]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'auto';
    };
  }, [handleKeyDown]);

  const handleDownload = async () => {
    const currentImg = images[currentIndex];
    try {
      const blob = await fetch(currentImg.src).then((r) => r.blob());
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${currentImg.label.toLowerCase().replace(' ', '_')}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Download failed', e);
    }
  };

  const handleCopyPrompt = () => {
    const prompt = images[currentIndex].prompt;
    if (prompt) {
      navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const currentImage = images[currentIndex];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-xl animate-fade-in">
      
      {/* Controls: Close */}
      <button 
        onClick={onClose}
        className="absolute top-6 right-6 p-2 text-zinc-400 hover:text-white bg-zinc-900/50 rounded-full border border-white/10 transition-colors z-20"
      >
        <CloseIcon className="w-6 h-6" />
      </button>

      {/* Controls: Nav */}
      <button 
        onClick={handlePrev}
        className="absolute left-4 sm:left-8 p-3 text-zinc-400 hover:text-white bg-zinc-900/50 hover:bg-zinc-800 rounded-full border border-white/10 transition-colors z-20"
      >
        <ChevronLeftIcon className="w-6 h-6" />
      </button>

      <button 
        onClick={handleNext}
        className="absolute right-4 sm:right-8 p-3 text-zinc-400 hover:text-white bg-zinc-900/50 hover:bg-zinc-800 rounded-full border border-white/10 transition-colors z-20"
      >
        <ChevronRightIcon className="w-6 h-6" />
      </button>

      {/* Main Content */}
      <div className="w-full h-full flex flex-col items-center justify-center p-4 sm:p-12">
        <div className="relative max-w-5xl max-h-[80vh] flex items-center justify-center">
             <img 
                src={currentImage.src} 
                alt={currentImage.label} 
                className="max-w-full max-h-[80vh] object-contain shadow-2xl rounded-sm"
             />
             <div className="absolute top-4 left-4 px-3 py-1 bg-black/60 backdrop-blur-md rounded border border-white/10 text-xs font-bold text-white uppercase tracking-wider">
                {currentImage.label}
             </div>
        </div>

        {/* Action Bar */}
        <div className="mt-8 flex items-center gap-4">
             <button 
                onClick={handleDownload}
                className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-medium rounded-lg transition-colors border border-zinc-700"
             >
                <DownloadIcon className="w-4 h-4" />
                Download Image
             </button>

             {currentImage.prompt && (
                <button 
                    onClick={handleCopyPrompt}
                    className="flex items-center gap-2 px-4 py-2 bg-transparent hover:bg-zinc-800 text-zinc-400 hover:text-white text-sm font-medium rounded-lg transition-colors border border-zinc-800"
                >
                    <CopyIcon className="w-4 h-4" />
                    {copied ? 'Copied!' : 'Copy Prompt'}
                </button>
             )}
        </div>
      </div>
    </div>
  );
};