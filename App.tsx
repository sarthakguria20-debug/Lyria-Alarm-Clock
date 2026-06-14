import React, { useState, useEffect, useRef } from 'react';
import { Clock } from './components/Clock';
import { Visualizer } from './components/Visualizer';
import { AppState } from './types';
import { fetchWeather } from './services/weather';
import { generateMusicalPrompt, generateSong } from './services/genai';
import { Power, Play, Loader2, Signal, MapPin } from 'lucide-react';

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    alarmTime: "07:00",
    isAlarmActive: false,
    agenda: `0800 Drop Ava at nursery
1000 Team meeting
1200 lunch with Amanda
1400 call with Jerry`,
    location: null,
    weather: null,
    status: 'idle',
    errorMessage: null,
    audioSrc: null,
    lyrics: '',
    logs: []
  });

  const audioRef = useRef<HTMLAudioElement>(null);

  // Initialize
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          setState(prev => ({ ...prev, location: `${latitude.toFixed(2)}, ${longitude.toFixed(2)}` })); 
          const weather = await fetchWeather(latitude, longitude);
          setState(prev => ({ ...prev, weather }));
        },
        () => setState(prev => ({ ...prev, location: "Not Found" }))
      );
    }
  }, []);

  // Alarm Check
  useEffect(() => {
    const checkAlarm = () => {
      if (!state.isAlarmActive || state.status !== 'idle') return;
      const now = new Date();
      const currentTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      if (currentTime === state.alarmTime) {
        handleGenerateAndPlay();
      }
    };
    const interval = setInterval(checkAlarm, 1000);
    return () => clearInterval(interval);
  }, [state.isAlarmActive, state.status, state.alarmTime]);

  const handleGenerateAndPlay = async () => {
    // Check for API key first
    if ((window as any).aistudio?.hasSelectedApiKey) {
      const hasKey = await (window as any).aistudio.hasSelectedApiKey();
      if (!hasKey) {
        if ((window as any).aistudio?.openSelectKey) {
          await (window as any).aistudio.openSelectKey();
          // Assume success after triggering the modal to mitigate race condition
        } else {
          setState(prev => ({ ...prev, status: 'error', errorMessage: 'API Key required' }));
          return;
        }
      }
    }

    setState(prev => ({ ...prev, status: 'generating_prompt' }));
    try {
      const musicPrompt = await generateMusicalPrompt(
        state.weather, 
        state.location, 
        state.agenda, 
        new Date(),
        state.alarmTime
      );
      setState(prev => ({ ...prev, status: 'generating_music' }));
      const result = await generateSong(musicPrompt);
      const blob = await (await fetch(`data:${result.mimeType};base64,${result.audioBase64}`)).blob();
      const audioUrl = URL.createObjectURL(blob);
      setState(prev => ({ ...prev, audioSrc: audioUrl, lyrics: result.lyrics, status: 'playing', isAlarmActive: false }));
    } catch (err: any) {
      console.error(err);
      setState(prev => ({ ...prev, status: 'error' }));
    }
  };

  useEffect(() => {
    if (state.status === 'playing' && audioRef.current && state.audioSrc) {
      audioRef.current.src = state.audioSrc;
      audioRef.current.play().catch(console.error);
    }
  }, [state.status, state.audioSrc]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 md:p-8 overflow-hidden select-none">
      
      {/* The Device Case */}
      <div className="relative bg-radio-case w-full max-w-4xl rounded-xl shadow-device border-t border-white/10 p-6 md:p-10 flex flex-col md:flex-row gap-8">
         
         {/* Left: Speaker Grille */}
         <div className="hidden md:block w-24 lg:w-32 flex-shrink-0 relative">
             <div className="absolute inset-0 bg-speaker-grille bg-[length:8px_8px] opacity-80 rounded-lg shadow-inset-screen border border-black"></div>
             {/* Badge */}
             <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[85%] bg-black/80 border border-white/20 py-1.5 rounded text-[7px] lg:text-[9px] font-mono text-radio-dim uppercase tracking-wider text-center z-20 leading-tight">
                MODEL:<br/>LYRIA 3 PRO
             </div>
         </div>

         {/* Right: Main Interface */}
         <div className="flex-1 flex flex-col gap-6 relative z-10">
            
            {/* Top Display Panel */}
            <div className="bg-radio-face border-4 border-radio-dim rounded-lg p-6 relative shadow-inset-screen overflow-hidden min-h-[300px] flex flex-col">
                {/* Glass Glare */}
                <div className="absolute top-0 right-0 w-2/3 h-full bg-gradient-to-l from-white/5 to-transparent pointer-events-none transform skew-x-12 z-20"></div>
                
                <div className="flex flex-col sm:flex-row justify-between items-start gap-4 sm:gap-0 mb-4 relative z-10">
                    <div className="flex flex-col w-full sm:w-auto overflow-hidden">
                        <span className="text-radio-lit text-xs font-mono uppercase tracking-widest opacity-80 flex items-center gap-2 w-full">
                             <MapPin className="w-3 h-3 flex-shrink-0" /> 
                             {state.location ? (
                               <span className="font-digital tracking-widest truncate">{state.location}</span>
                             ) : "ACQUIRING COORDS..."}
                        </span>
                        <div className="flex items-center gap-2 mt-1">
                             <span className="font-digital text-lg text-radio-lit led-text-shadow">
                               {state.weather ? state.weather.temperature : "--"}°C
                             </span>
                        </div>
                    </div>
                    <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto gap-2">
                        <div className="text-radio-lit text-xs font-mono border border-radio-lit/30 px-2 py-0.5 rounded shadow-[0_0_5px_rgba(255,51,51,0.3)] uppercase tracking-widest">
                            {state.status === 'idle' ? 'System Ready' : state.status.replace('_', ' ')}
                        </div>
                        <button 
                            onClick={async () => {
                                if ((window as any).aistudio?.openSelectKey) {
                                    await (window as any).aistudio.openSelectKey();
                                }
                            }}
                            className="text-[10px] font-mono text-gray-400 hover:text-white border border-gray-600 px-2 py-0.5 rounded uppercase tracking-widest transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-radio-lit"
                            aria-label="Select API Key"
                        >
                            API KEY
                        </button>
                    </div>
                </div>

                <div className="flex-grow flex flex-col justify-center">
                    <Clock className="mb-6" isAlarmActive={state.isAlarmActive} />
                    
                    {/* Visualizer Container - always rendered but fades out */}
                    <div className="h-24">
                        <Visualizer isActive={state.status === 'playing'} status={state.status} />
                    </div>

                    {/* Lyrics Display */}
                    {state.lyrics && state.status === 'playing' && (
                      <div className="mt-3 max-h-20 overflow-y-auto scrollbar-thin scrollbar-thumb-amber-900 scrollbar-track-transparent">
                        <p className="text-radio-lit/70 text-xs font-mono text-center whitespace-pre-wrap leading-relaxed">
                          {state.lyrics}
                        </p>
                      </div>
                    )}
                </div>
            </div>

            {/* Middle: Input Slot */}
            <div className="flex flex-col gap-1">
                <label htmlFor="agenda-input" className="text-[10px] font-mono text-radio-dim uppercase tracking-widest pl-1">Daily Agenda</label>
                <div className="bg-neutral-800 rounded border border-white/10 p-2 shadow-inner group transition-colors focus-within:border-white/20 focus-within:ring-1 focus-within:ring-radio-lit">
                    <textarea 
                        id="agenda-input"
                        className="w-full bg-transparent font-mono text-sm text-amber-300 placeholder-yellow-800/30 outline-none px-2 uppercase tracking-wider resize-none h-20 scrollbar-thin scrollbar-thumb-yellow-900 scrollbar-track-transparent"
                        placeholder="ENTER AGENDA DETAILS..." 
                        value={state.agenda}
                        onChange={(e) => setState(prev => ({ ...prev, agenda: e.target.value }))}
                    />
                </div>
            </div>

            {/* Bottom: Control Deck */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mt-auto">
                
                {/* Alarm Time Set */}
                <div className="col-span-2 bg-radio-btn rounded shadow-btn active:shadow-btn-pressed transition-all relative overflow-hidden group border-t border-white/5 focus-within:ring-2 focus-within:ring-radio-lit focus-within:ring-inset">
                     <label htmlFor="wake-time-input" className="absolute top-2 left-3 text-[8px] font-bold text-gray-500 uppercase tracking-wider">Wake Time</label>
                     <input 
                        id="wake-time-input"
                        type="time" 
                        className="w-full h-full bg-transparent text-center font-digital text-gray-200 text-2xl pt-5 cursor-pointer outline-none focus:text-radio-lit transition-colors"
                        value={state.alarmTime}
                        onChange={(e) => setState(prev => ({ ...prev, alarmTime: e.target.value, isAlarmActive: true }))}
                     />
                </div>

                {/* Alarm Toggle */}
                <button 
                    onClick={() => setState(prev => ({ ...prev, isAlarmActive: !prev.isAlarmActive }))}
                    className={`col-span-1 rounded shadow-btn active:shadow-btn-pressed active:translate-y-[2px] transition-all flex flex-col items-center justify-center p-2 border-t border-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-radio-lit focus-visible:ring-inset
                        ${state.isAlarmActive ? 'bg-radio-btn' : 'bg-radio-btn'}
                    `}
                    aria-pressed={state.isAlarmActive}
                    aria-label="Toggle Alarm"
                >
                    <div className={`w-2 h-2 rounded-full mb-1 transition-all duration-300 shadow-[0_0_5px_current] ${state.isAlarmActive ? 'bg-radio-lit shadow-radio-lit' : 'bg-black border border-gray-700 opacity-50'}`}></div>
                    <span className={`text-[10px] font-bold uppercase transition-colors ${state.isAlarmActive ? 'text-gray-200' : 'text-gray-500'}`}>Active</span>
                </button>

                {/* Big Action Button */}
                <button
                   onClick={() => {
                     if (state.status === 'playing') {
                        audioRef.current?.pause();
                        setState(prev => ({ ...prev, status: 'idle' }));
                     } else if (state.status === 'idle') {
                        handleGenerateAndPlay();
                     }
                   }}
                   disabled={state.status !== 'idle' && state.status !== 'playing'}
                   className={`col-span-1 rounded shadow-btn active:shadow-btn-pressed active:translate-y-[2px] transition-all flex flex-col items-center justify-center p-2 border-t border-white/5 bg-neutral-700 hover:bg-neutral-600 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-radio-lit focus-visible:ring-inset`}
                   aria-label={state.status === 'playing' ? 'Stop' : 'Generate'}
                >
                   {state.status === 'playing' ? (
                      <Power className="w-5 h-5 text-red-500 mb-1 drop-shadow-[0_0_3px_rgba(239,68,68,0.5)]" />
                   ) : state.status !== 'idle' ? (
                      <Loader2 className="w-5 h-5 text-yellow-500 animate-spin mb-1" />
                   ) : (
                      <Play className="w-5 h-5 text-green-500 mb-1 drop-shadow-[0_0_3px_rgba(34,197,94,0.5)]" />
                   )}
                   <span className="text-[8px] font-bold text-gray-300 uppercase">
                      {state.status === 'playing' ? 'STOP' : 'GENERATE'}
                   </span>
                </button>
            </div>

         </div>

      </div>

      <audio ref={audioRef} className="hidden" onEnded={() => setState(prev => ({...prev, status: 'idle'}))} />

      {/* Subtle Weather Attribution */}
      {state.weather && (
        <a 
          href="https://open-meteo.com/" 
          target="_blank" 
          rel="noopener noreferrer"
          className="absolute bottom-2 right-4 text-[10px] text-white/20 font-mono hover:text-white/50 transition-colors z-0"
        >
          Weather data by Open-Meteo
        </a>
      )}
    </div>
  );
};

export default App;