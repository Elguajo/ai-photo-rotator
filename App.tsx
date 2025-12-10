import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { getRotationPrompts, generateRotatedImage, ModelMode } from './services/geminiService';
import { GridCell } from './components/GridCell';
import { Lightbox, LightboxImage } from './components/Lightbox';
import { UploadIcon, DownloadIcon, ResetIcon, CameraIcon, ObjectIcon, SparklesIcon, LockIcon } from './components/Icons';

// This is required to use JSZip from CDN
declare const JSZip: any;

interface GeneratedImage {
  src: string;
  prompt: string;
}

const STYLES = ['Realistic', 'Clay 3D', 'Cyberpunk', 'Sketch', 'Low Poly'];
const ASPECT_RATIOS = [
    { label: 'Square (1:1)', value: '1:1' },
    { label: 'Landscape (16:9)', value: '16:9' },
    { label: 'Portrait (9:16)', value: '9:16' },
];

const App: React.FC = () => {
  const [modelMode, setModelMode] = useState<ModelMode>('standard');
  const [hasApiKey, setHasApiKey] = useState<boolean>(false);
  const [checkingKey, setCheckingKey] = useState<boolean>(true);

  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [isObjectRotationOnly, setIsObjectRotationOnly] = useState<boolean>(false);
  
  // New Tool States
  const [selectedStyle, setSelectedStyle] = useState<string>('Realistic');
  const [selectedRatio, setSelectedRatio] = useState<string>('1:1');

  // Lightbox State
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    checkApiKey();
  }, []);

  const checkApiKey = async () => {
    const win = window as any;
    if (win.aistudio && win.aistudio.hasSelectedApiKey) {
      const hasKey = await win.aistudio.hasSelectedApiKey();
      setHasApiKey(hasKey);
    } else {
      setHasApiKey(true);
    }
    setCheckingKey(false);
  };

  const handleSelectKey = async () => {
    const win = window as any;
    if (win.aistudio && win.aistudio.openSelectKey) {
        try {
            await win.aistudio.openSelectKey();
            setHasApiKey(true);
        } catch (e) {
            console.error("Key selection failed", e);
            setError("Failed to select API key. Please try again.");
        }
    }
  };

  const resetState = () => {
    setOriginalImage(null);
    setGeneratedImages([]);
    setIsLoading(false);
    setStatus('');
    setError('');
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    resetState();
    setIsLoading(true);
    setStatus('Reading image...');
    
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64Image = (reader.result as string).split(',')[1];
      setOriginalImage(`data:${file.type};base64,${base64Image}`);
      await processImage(base64Image, file.type);
    };
    reader.onerror = () => {
        setError('Failed to read the image file.');
        setIsLoading(false);
        setStatus('');
    };
    reader.readAsDataURL(file);
  };

  const processImage = async (base64Image: string, mimeType: string) => {
    try {
      // Clear previous error
      setError('');
      
      const analysisModelName = modelMode === 'pro' ? 'Gemini 3.0 Pro' : 'Gemini 2.5 Flash';
      const genModelName = modelMode === 'pro' ? 'Gemini 3.0 Pro' : 'Gemini 2.5 Flash';

      setStatus(`Analyzing scene geometry...`);
      const prompts = await getRotationPrompts(base64Image, mimeType, isObjectRotationOnly, modelMode);

      if (!prompts || prompts.length < 3) {
        throw new Error("Could not determine rotation angles. Please try another image.");
      }

      const newImages: GeneratedImage[] = [];
      for (let i = 0; i < 3; i++) {
        setStatus(`Generating view ${i + 1} of 3...`);
        // Pass style and ratio
        const generatedImage = await generateRotatedImage(
            base64Image, 
            mimeType, 
            prompts[i], 
            modelMode,
            selectedStyle,
            selectedRatio
        );
        newImages.push({ src: generatedImage, prompt: prompts[i] });
        setGeneratedImages([...newImages]);
      }
      setStatus('Complete');
    } catch (err) {
      console.error(err);
      if (err instanceof Error && (err.message.includes('RESOURCE_EXHAUSTED') || err.message.includes('429'))) {
         setError("Quota exhausted. The free tier may have been used up.");
      } else if (err instanceof Error && (err.message.includes('503') || err.message.includes('overloaded'))) {
         setError("The AI model is currently overloaded. Please try again shortly.");
      } else if (err instanceof Error && err.message.includes('Requested entity was not found')) {
         setError("API Key Error. Please re-select your key.");
         if (modelMode === 'pro') setHasApiKey(false);
      } else {
         setError(err instanceof Error ? err.message : 'Processing failed.');
      }
      setStatus('Failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadZip = async () => {
    if (!originalImage || generatedImages.length < 3) return;

    setStatus('Zipping...');
    try {
        const zip = new JSZip();
        const originalBlob = await fetch(originalImage).then(r => r.blob());
        zip.file("original.png", originalBlob);

        for (let i = 0; i < generatedImages.length; i++) {
            const generatedBlob = await fetch(generatedImages[i].src).then(r => r.blob());
            zip.file(`generated_${i + 1}.png`, generatedBlob);
        }

        const content = await zip.generateAsync({ type: 'blob' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(content);
        link.download = 'rotated-views.zip';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setStatus('Saved');
    } catch (err) {
        setError("Failed to create ZIP.");
    }
  };

  // Combine images for Lightbox
  const lightboxImages: LightboxImage[] = useMemo(() => {
    const imgs: LightboxImage[] = [];
    if (originalImage) {
        imgs.push({ src: originalImage, label: 'Original Input' });
    }
    generatedImages.forEach((img, idx) => {
        imgs.push({ src: img.src, label: `View ${idx + 1}`, prompt: img.prompt });
    });
    return imgs;
  }, [originalImage, generatedImages]);

  const handleCellClick = (index: number) => {
    // Determine the correct index in lightboxImages
    // Grid: Original (0) -> View 1 (1) -> View 2 (2) -> View 3 (3)
    // The grid mapping matches the lightboxImages order if Original exists.
    if (!originalImage && index === 0) return; // Should not happen in UI logic but safety
    setLightboxIndex(index);
  };


  if (checkingKey) {
    return (
        <div className="min-h-screen bg-black flex items-center justify-center text-zinc-400">
            <div className="animate-pulse flex items-center gap-2 text-sm font-medium">
                <div className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce"></div>
                Initializing...
            </div>
        </div>
    );
  }

  const isFinished = !isLoading && generatedImages.length === 3;
  const isProModeLocked = modelMode === 'pro' && !hasApiKey;

  return (
    <div className="min-h-screen bg-black text-zinc-100 font-sans selection:bg-white selection:text-black antialiased flex flex-col">
      {/* Lightbox Overlay */}
      {lightboxIndex !== null && (
        <Lightbox 
            images={lightboxImages} 
            initialIndex={lightboxIndex} 
            onClose={() => setLightboxIndex(null)} 
        />
      )}

      {/* Navbar */}
      <nav className="w-full border-b border-zinc-800 bg-black/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-gradient-to-tr from-zinc-100 to-zinc-500 rounded-md flex items-center justify-center">
                <CameraIcon className="w-4 h-4 text-black" />
            </div>
            <span className="font-bold tracking-tight text-sm sm:text-base">ObjectRotator</span>
          </div>

          <div className="flex bg-zinc-900/80 p-1 rounded-lg border border-zinc-800/50">
            <button
              onClick={() => setModelMode('standard')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${
                modelMode === 'standard' 
                  ? 'bg-zinc-700 text-white shadow-sm' 
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Standard
            </button>
            <button
              onClick={() => setModelMode('pro')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-all duration-200 ${
                modelMode === 'pro' 
                  ? 'bg-white text-black shadow-sm' 
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Pro
              <SparklesIcon className={`w-3 h-3 ${modelMode === 'pro' ? 'text-amber-500' : 'text-zinc-500'}`} />
            </button>
          </div>
        </div>
      </nav>

      <main className="flex-grow flex flex-col items-center justify-start pt-10 sm:pt-16 px-6 pb-20 max-w-5xl mx-auto w-full">
        
        {/* Header Text */}
        <div className="text-center mb-12 max-w-2xl">
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4 bg-gradient-to-b from-white to-zinc-400 bg-clip-text text-transparent pb-1">
                Generate new perspectives.
            </h1>
            <p className="text-zinc-500 text-lg">
                Upload an image. AI analyzes the geometry and generates the missing angles.
            </p>
        </div>

        {/* Content Area */}
        <div className="w-full">
          {isProModeLocked ? (
            <div className="w-full aspect-[2/1] min-h-[400px] flex flex-col items-center justify-center bg-zinc-900/30 rounded-2xl border border-zinc-800 relative overflow-hidden group">
                {/* Background Glow */}
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/80 z-0"></div>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-amber-500/10 blur-[100px] rounded-full z-0"></div>
                
                <div className="relative z-10 text-center max-w-md px-6">
                    <div className="w-12 h-12 bg-zinc-800 rounded-xl border border-zinc-700 flex items-center justify-center mx-auto mb-6 shadow-xl">
                        <LockIcon className="w-5 h-5 text-amber-500" />
                    </div>
                    <h2 className="text-xl font-semibold text-white mb-2">Unlock Professional Grade</h2>
                    <p className="text-zinc-400 text-sm mb-8 leading-relaxed">
                        Gemini 3.0 Pro offers superior geometry understanding, realistic lighting, and higher resolution outputs. Requires a paid API key.
                    </p>
                    
                    <div className="flex flex-col sm:flex-row gap-3 justify-center w-full">
                        <button 
                            onClick={handleSelectKey}
                            className="h-10 px-6 bg-white hover:bg-zinc-200 text-black text-sm font-medium rounded-lg transition-colors shadow-[0_0_20px_rgba(255,255,255,0.1)]"
                        >
                            Connect API Key
                        </button>
                        <button 
                            onClick={() => setModelMode('standard')}
                            className="h-10 px-6 bg-transparent hover:bg-zinc-800 text-zinc-400 hover:text-white text-sm font-medium rounded-lg transition-colors border border-transparent hover:border-zinc-700"
                        >
                            Use Standard
                        </button>
                    </div>
                    
                    <div className="mt-8">
                        <a 
                            href="https://ai.google.dev/gemini-api/docs/billing" 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
                        >
                            Learn about billing →
                        </a>
                    </div>
                </div>
            </div>
          ) : (
            <div className="space-y-6">
                
                {/* Main Grid */}
                <div className={`grid grid-cols-2 gap-4 ${selectedRatio === '1:1' ? '' : selectedRatio === '9:16' ? 'auto-rows-[minmax(0,1fr)]' : ''}`}>
                    {/* Original Upload Cell */}
                    <div className={`relative ${selectedRatio === '16:9' ? 'aspect-video' : selectedRatio === '9:16' ? 'aspect-[9/16]' : 'aspect-square'}`}>
                         <GridCell 
                            label="Original" 
                            onClick={originalImage ? () => handleCellClick(0) : undefined}
                         >
                            {!originalImage ? (
                                <label className="cursor-pointer w-full h-full flex flex-col items-center justify-center bg-zinc-900/30 border border-dashed border-zinc-800 hover:border-zinc-600 hover:bg-zinc-900/50 rounded-xl transition-all duration-300 group relative overflow-hidden">
                                    <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-5 pointer-events-none"></div>
                                    <div className="p-4 bg-zinc-900 rounded-full mb-4 group-hover:scale-110 transition-transform duration-300 border border-zinc-800">
                                        <UploadIcon className="w-6 h-6 text-zinc-400 group-hover:text-white transition-colors" />
                                    </div>
                                    <span className="text-sm font-medium text-zinc-300 group-hover:text-white transition-colors">Upload Image</span>
                                    <span className="text-xs text-zinc-500 mt-1">PNG, JPG up to 5MB</span>
                                    <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} disabled={isLoading} />
                                </label>
                            ) : (
                                <img src={originalImage} alt="Original" className="w-full h-full object-contain p-2" />
                            )}
                        </GridCell>
                    </div>

                    {/* Generated Cells */}
                    {[0, 1, 2].map((idx) => (
                        <div key={idx} className={`relative ${selectedRatio === '16:9' ? 'aspect-video' : selectedRatio === '9:16' ? 'aspect-[9/16]' : 'aspect-square'}`}>
                             <GridCell 
                                prompt={generatedImages[idx]?.prompt} 
                                label={`View ${idx + 1}`} 
                                isLoading={isLoading && !generatedImages[idx]}
                                onClick={generatedImages[idx] ? () => handleCellClick(idx + 1) : undefined}
                             >
                                {generatedImages[idx] ? (
                                    <img src={generatedImages[idx].src} alt={`Generated ${idx}`} className="w-full h-full object-contain p-2" />
                                ) : null}
                            </GridCell>
                        </div>
                    ))}
                </div>

                {/* Toolbar */}
                <div className="bg-zinc-900/40 backdrop-blur-sm border border-zinc-800 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 sticky bottom-6 z-40 shadow-2xl shadow-black/50">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full sm:w-auto">
                        
                        {/* Tool: Toggle Object/Scene */}
                        {!originalImage && (
                            <label className="flex items-center cursor-pointer group select-none">
                                <div className="relative">
                                    <input
                                        type="checkbox"
                                        checked={isObjectRotationOnly}
                                        onChange={(e) => setIsObjectRotationOnly(e.target.checked)}
                                        disabled={isLoading}
                                        className="sr-only peer"
                                    />
                                    <div className="w-10 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-zinc-400 after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-zinc-100 peer-checked:after:bg-black peer-checked:after:border-transparent"></div>
                                </div>
                                <span className="ml-3 text-sm font-medium text-zinc-400 group-hover:text-zinc-200 transition-colors">
                                    {isObjectRotationOnly ? 'Isolate Object' : 'Rotate Scene'}
                                </span>
                            </label>
                        )}

                        <div className="h-6 w-px bg-zinc-800 hidden sm:block"></div>

                        {/* Tool: Style Selector */}
                        <div className="relative">
                             <select 
                                value={selectedStyle}
                                onChange={(e) => setSelectedStyle(e.target.value)}
                                disabled={isLoading || !!originalImage}
                                className="appearance-none bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-medium py-1.5 pl-3 pr-8 rounded-lg border border-zinc-700 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                             >
                                {STYLES.map(s => <option key={s} value={s}>{s}</option>)}
                             </select>
                             <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-zinc-400">
                                <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                             </div>
                        </div>

                         {/* Tool: Aspect Ratio Selector */}
                         <div className="relative">
                             <select 
                                value={selectedRatio}
                                onChange={(e) => setSelectedRatio(e.target.value)}
                                disabled={isLoading || !!originalImage}
                                className="appearance-none bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-medium py-1.5 pl-3 pr-8 rounded-lg border border-zinc-700 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                             >
                                {ASPECT_RATIOS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                             </select>
                             <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-zinc-400">
                                <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                             </div>
                        </div>


                        {status && (
                             <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 rounded-full border border-zinc-800 sm:ml-auto">
                                <div className={`w-1.5 h-1.5 rounded-full ${error ? 'bg-red-500' : 'bg-blue-500 animate-pulse'}`}></div>
                                <span className={`text-xs ${error ? 'text-red-400' : 'text-zinc-400'}`}>
                                    {error || status}
                                </span>
                             </div>
                        )}
                    </div>

                    {isFinished && (
                        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                            <button 
                                onClick={resetState} 
                                className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white transition-colors"
                            >
                                Reset
                            </button>
                            <button 
                                onClick={handleDownloadZip} 
                                className="px-4 py-2 bg-white text-black text-sm font-medium rounded-lg hover:bg-zinc-200 transition-colors flex items-center gap-2 shadow-lg shadow-white/5"
                            >
                                <DownloadIcon className="w-4 h-4" />
                                Assets
                            </button>
                        </div>
                    )}
                </div>

            </div>
          )}
        </div>
      </main>

      {/* Simple Footer */}
      <footer className="w-full border-t border-zinc-900 py-6 text-center">
        <p className="text-xs text-zinc-600">
          Powered by <span className={modelMode === 'pro' ? 'text-zinc-400' : 'text-zinc-600'}>{modelMode === 'pro' ? 'Gemini 3.0' : 'Gemini 2.5'}</span>.
        </p>
      </footer>
    </div>
  );
};

export default App;