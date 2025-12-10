import React, { useState } from 'react';
import { InfoIcon, CloseIcon } from './Icons';

interface GridCellProps {
  children: React.ReactNode;
  prompt?: string;
  label?: string;
  isLoading?: boolean;
  onClick?: () => void;
}

export const GridCell: React.FC<GridCellProps> = ({ children, prompt, label, isLoading, onClick }) => {
  const [isPromptVisible, setIsPromptVisible] = useState(false);

  return (
    <div 
      className={`relative w-full h-full bg-zinc-900/20 rounded-xl overflow-hidden flex items-center justify-center border border-zinc-800 group transition-all duration-300 hover:border-zinc-700 ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
    >
      
      {/* Label Badge */}
      {label && (
        <div className="absolute top-3 left-3 px-2 py-0.5 bg-black/40 backdrop-blur-md rounded border border-white/10 text-[10px] font-medium text-zinc-400 uppercase tracking-wider z-10 pointer-events-none">
          {label}
        </div>
      )}

      {/* Content */}
      {children}

      {/* Loading State */}
      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900/50 backdrop-blur-sm z-20 cursor-default">
             <div className="w-8 h-8 border-2 border-zinc-800 border-t-zinc-400 rounded-full animate-spin mb-3"></div>
             <span className="text-xs text-zinc-500 animate-pulse">Generating...</span>
        </div>
      )}

      {/* Prompt Button */}
      {prompt && (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsPromptVisible(true);
            }}
            className="absolute bottom-3 right-3 p-1.5 bg-black/60 hover:bg-white hover:text-black rounded-lg text-zinc-400 transition-all duration-200 z-10 border border-white/10 opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0"
            aria-label="Show prompt"
          >
            <InfoIcon className="w-4 h-4" />
          </button>

          {/* Prompt Overlay */}
          {isPromptVisible && (
            <div
              className="absolute inset-0 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center p-6 z-30 animate-fade-in cursor-default"
              onClick={(e) => {
                e.stopPropagation();
                setIsPromptVisible(false);
              }}
            >
              <div
                className="w-full max-h-full overflow-y-auto text-sm relative"
                onClick={(e) => e.stopPropagation()}
              >
                 <div className="flex items-center justify-between mb-4 sticky top-0 bg-transparent">
                    <h4 className="font-medium text-white text-xs uppercase tracking-widest opacity-70">Generation Prompt</h4>
                    <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsPromptVisible(false);
                        }}
                        className="text-zinc-500 hover:text-white transition-colors"
                    >
                        <CloseIcon className="w-4 h-4" />
                    </button>
                 </div>
                <p className="text-zinc-300 text-xs leading-relaxed font-mono whitespace-pre-wrap">{prompt}</p>
              </div>
            </div>
          )}
        </>
      )}
      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: scale(0.98); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-fade-in {
          animation: fade-in 0.15s ease-out forwards;
        }
      `}</style>
    </div>
  );
};