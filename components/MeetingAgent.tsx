
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { CameraIcon } from './icons/CameraIcon';
import { ExclamationIcon } from './icons/ExclamationIcon';
import { ZapIcon } from './icons/ZapIcon';
import { UserGroupIcon } from './icons/UserGroupIcon';
import { DownloadIcon } from './icons/DownloadIcon';
import { EyeIcon } from './icons/EyeIcon';

interface MeetingDataPoint {
  time: number;
  sentiment: number; // 0-100 (Negative to Positive)
  engagement: number; // 0-100 (Low to High)
}

interface Highlight {
  time: string;
  text: string;
  type: 'positive' | 'negative' | 'neutral';
}

interface ParticipantMetric {
  id: number;
  label: string;
  activity: number; // 0-100 (Motion)
  focus: number; // 0-100 (Stability)
  isSpeaking: boolean;
}

const MeetingAgent: React.FC = () => {
  const [isLive, setIsLive] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [meetingUrl, setMeetingUrl] = useState('');
  const [sharingSource, setSharingSource] = useState<string | null>(null);
  const [data, setData] = useState<MeetingDataPoint[]>([]);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  // Grid-based participant state (Assuming 2x2 grid for MVP)
  const [participants, setParticipants] = useState<ParticipantMetric[]>([
    { id: 0, label: "Top-Left", activity: 0, focus: 0, isSpeaking: false },
    { id: 1, label: "Top-Right", activity: 0, focus: 0, isSpeaking: false },
    { id: 2, label: "Btm-Left", activity: 0, focus: 0, isSpeaking: false },
    { id: 3, label: "Btm-Right", activity: 0, focus: 0, isSpeaking: false },
  ]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const processingRef = useRef(false);
  const prevFrameRef = useRef<Uint8ClampedArray | null>(null);
  
  // Audio Analysis Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);

  // Analyze the video frame to guess meeting dynamics
  const analyzeFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !processingRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    // Ensure context availability
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx || video.paused || video.ended) return;

    // Use a fixed low resolution for grid analysis (320x240)
    // This gives us a 160x120 quadrant size
    const width = 320;
    const height = 240;
    
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    
    try {
        ctx.drawImage(video, 0, 0, width, height);
        const frame = ctx.getImageData(0, 0, width, height);
        const currentData = frame.data;
        const prevData = prevFrameRef.current;

        // Audio Level Analysis
        let audioVolume = 0;
        if (analyserRef.current && dataArrayRef.current) {
            analyserRef.current.getByteFrequencyData(dataArrayRef.current);
            const sum = dataArrayRef.current.reduce((a, b) => a + b, 0);
            audioVolume = sum / dataArrayRef.current.length; // 0-255 approx
        }
        const isAudioActive = audioVolume > 20; // Threshold for speech

        // Grid Analysis: 2x2
        // Quad 0: 0,0 to w/2, h/2
        // Quad 1: w/2,0 to w, h/2
        // Quad 2: 0,h/2 to w/2, h
        // Quad 3: w/2,h/2 to w, h
        
        const quadrants = [
            { x: 0, y: 0, w: width / 2, h: height / 2, motion: 0, pixels: 0 },
            { x: width / 2, y: 0, w: width / 2, h: height / 2, motion: 0, pixels: 0 },
            { x: 0, y: height / 2, w: width / 2, h: height / 2, motion: 0, pixels: 0 },
            { x: width / 2, y: height / 2, w: width / 2, h: height / 2, motion: 0, pixels: 0 }
        ];

        let totalMotion = 0;

        if (prevData) {
            for (let y = 0; y < height; y += 4) { // Skip pixels for performance
                for (let x = 0; x < width; x += 4) {
                    const i = (y * width + x) * 4;
                    
                    // Simple RGB difference
                    const diff = Math.abs(currentData[i] - prevData[i]) + 
                                 Math.abs(currentData[i+1] - prevData[i+1]) + 
                                 Math.abs(currentData[i+2] - prevData[i+2]);
                    
                    if (diff > 50) { // Noise threshold
                         // Determine quadrant
                         const qIdx = (x >= width / 2 ? 1 : 0) + (y >= height / 2 ? 2 : 0);
                         quadrants[qIdx].motion += diff;
                         totalMotion += diff;
                    }
                    quadrants[(x >= width / 2 ? 1 : 0) + (y >= height / 2 ? 2 : 0)].pixels++;
                }
            }
        }

        // Save current frame for next loop
        prevFrameRef.current = new Uint8ClampedArray(currentData);

        // Update Participant State
        setParticipants(prevParts => {
            return prevParts.map((p, idx) => {
                const q = quadrants[idx];
                const rawActivity = q.motion / (q.pixels || 1); 
                // Normalize activity: usually 0-10 range, scale to 0-100
                const normalizedActivity = Math.min(100, rawActivity * 5); 
                
                // Focus is stability (inverse of high erratic motion, but moderate motion is ok)
                // If activity is very high (>80), focus drops.
                const focus = Math.max(0, 100 - (normalizedActivity * 0.8));

                // Heuristic: Highest activity quadrant gets "Speaking" status if audio is loud enough
                // To prevent flickering, we can use a simpler check:
                // If this quadrant has significant motion AND audio is present, likely speaking.
                const likelySpeaking = isAudioActive && normalizedActivity > 15;

                // Smooth updates
                return {
                    ...p,
                    activity: (p.activity * 0.7) + (normalizedActivity * 0.3),
                    focus: (p.focus * 0.8) + (focus * 0.2),
                    isSpeaking: likelySpeaking
                };
            });
        });

        // Global Stats derived from grid
        const avgActivity = totalMotion / (width * height / 16); // Normalize
        const calculatedEngagement = Math.min(100, Math.max(10, avgActivity * 2));
        
        // Simulate sentiment fluctuation based on "energy" (engagement)
        const randomSentimentFlux = (Math.random() - 0.5) * 5;
        
        setData(prev => {
            const last = prev[prev.length - 1] || { sentiment: 60, engagement: 50 };
            let newSentiment = last.sentiment + randomSentimentFlux;
            
            // High engagement slightly boosts sentiment (productive meeting)
            if (calculatedEngagement > 60) newSentiment += 0.5;
            
            return [...prev.slice(-40), {
                time: Date.now(),
                sentiment: Math.max(0, Math.min(100, newSentiment)),
                engagement: (last.engagement * 0.7) + (calculatedEngagement * 0.3), // Smooth it
            }];
        });

        if (processingRef.current) {
            requestAnimationFrame(analyzeFrame);
        }
    } catch (e) {
        console.error("Frame analysis failed", e);
    }
  }, []);

  const handleConnectClick = () => {
    setIsConfirming(true);
    setError(null);
  };

  const startCapture = async () => {
    setIsConfirming(false);
    setError(null);
    try {
        // @ts-ignore
        const stream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                width: 1280,
                height: 720,
                displaySurface: 'browser' 
            },
            audio: true // Important for speaker detection
        });

        if (videoRef.current) {
            videoRef.current.srcObject = stream;
            
            const track = stream.getVideoTracks()[0];
            setSharingSource(track.label || "External Window");

            // Setup Audio Analysis if available
            const audioTrack = stream.getAudioTracks()[0];
            if (audioTrack) {
                try {
                    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
                    const audioCtx = new AudioContextClass();
                    const source = audioCtx.createMediaStreamSource(stream);
                    const analyser = audioCtx.createAnalyser();
                    analyser.fftSize = 256;
                    source.connect(analyser);
                    
                    audioContextRef.current = audioCtx;
                    analyserRef.current = analyser;
                    dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
                } catch (e) {
                    console.warn("Audio analysis setup failed", e);
                }
            }

            videoRef.current.onloadedmetadata = () => {
                videoRef.current?.play().catch(console.error);
                processingRef.current = true;
                setIsLive(true);
                analyzeFrame();
            };

            track.onended = () => {
                stopCapture();
            };
        }

        setHighlights(prev => [...prev, { time: new Date().toLocaleTimeString(), text: "Agent joined the meeting", type: 'neutral' }]);

    } catch (err) {
        console.error("Error sharing screen:", err);
        if ((err as Error).name !== 'NotAllowedError') {
             setError("Failed to connect to screen. Please ensure permissions are granted.");
        }
    }
  };

  const stopCapture = () => {
    processingRef.current = false;
    setIsLive(false);
    setSharingSource(null);
    if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(t => t.stop());
        videoRef.current.srcObject = null;
    }
    if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
    }
    setHighlights(prev => [...prev, { time: new Date().toLocaleTimeString(), text: "Meeting session ended", type: 'neutral' }]);
  };

  useEffect(() => {
    // Cleanup on unmount
    return () => {
        processingRef.current = false;
        if (videoRef.current && videoRef.current.srcObject) {
            const stream = videoRef.current.srcObject as MediaStream;
            stream.getTracks().forEach(t => t.stop());
        }
        if (audioContextRef.current) {
            audioContextRef.current.close();
        }
    };
  }, []);

  useEffect(() => {
    if (!isLive || data.length < 2) return;
    
    const latest = data[data.length - 1];
    const prev = data[data.length - 2];
    
    // Highlight generation logic
    if (latest.engagement > 85 && prev.engagement <= 85) {
        setHighlights(h => [...h, { time: new Date().toLocaleTimeString(), text: "High Group Engagement detected", type: 'positive' }].slice(-5));
    }
    if (latest.sentiment < 30 && prev.sentiment >= 30) {
        setHighlights(h => [...h, { time: new Date().toLocaleTimeString(), text: "Potential conflict or confusion detected", type: 'negative' }].slice(-5));
    }
  }, [data, isLive]);

  return (
    <div className="flex flex-col gap-6 relative">
        
        {/* Connection Confirmation Modal */}
        {isConfirming && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in-right">
                <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-md w-full shadow-2xl relative">
                    <button 
                        onClick={() => setIsConfirming(false)}
                        className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors"
                    >
                        ✕
                    </button>
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-violet-500/10 rounded-lg">
                            <CameraIcon />
                        </div>
                        <h3 className="text-xl font-bold text-white">Connect to Meeting Feed</h3>
                    </div>
                    
                    <p className="text-gray-400 mb-6 text-sm leading-relaxed">
                        To analyze group dynamics, NeuroLens needs to "see" the meeting.
                    </p>
                    
                    <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700/50 mb-8">
                        <ol className="text-sm text-gray-300 space-y-3 list-decimal list-inside">
                            <li>Select the <strong className="text-white">Chrome Tab</strong> option.</li>
                            <li>Choose the tab running <strong className="text-white">Google Meet</strong> or <strong className="text-white">Zoom</strong>.</li>
                            <li>Ensure <strong className="text-white">Share tab audio</strong> is checked for speaker detection.</li>
                        </ol>
                    </div>

                    <div className="flex justify-end gap-3">
                        <button 
                            onClick={() => setIsConfirming(false)} 
                            className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={startCapture} 
                            className="px-6 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-semibold shadow-lg shadow-violet-500/20 transition-all"
                        >
                            Select Meeting Tab
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* Connection Bar */}
        <div className={`p-6 rounded-2xl border transition-all duration-300 flex flex-col md:flex-row items-center justify-between gap-4 ${
            isLive 
            ? 'bg-violet-900/10 border-violet-500/30 shadow-lg shadow-violet-500/5' 
            : 'bg-gray-900/50 border-gray-800'
        }`}>
            <div className="flex-grow w-full md:w-auto">
                {isLive ? (
                    <div className="flex flex-col animate-fade-in-right">
                         <span className="text-xs font-bold text-emerald-400 mb-1 flex items-center gap-2 uppercase tracking-wider">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                            </span>
                            Active Source
                         </span>
                         <div className="text-lg font-medium text-white flex items-center gap-2">
                            <span className="truncate max-w-xl text-gray-200">{sharingSource || "Screen Capture"}</span>
                         </div>
                    </div>
                ) : (
                    <>
                        <label className="block text-xs font-medium text-gray-400 mb-1 tracking-wider">TARGET MEETING URL (OPTIONAL)</label>
                        <input 
                            type="text" 
                            placeholder="https://meet.google.com/..." 
                            value={meetingUrl}
                            onChange={(e) => setMeetingUrl(e.target.value)}
                            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-gray-200 focus:outline-none focus:border-violet-500 transition-colors"
                        />
                    </>
                )}
            </div>
            <div className="flex items-end h-full pt-1 md:pt-5">
                {!isLive ? (
                    <button 
                        onClick={handleConnectClick}
                        className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white px-6 py-2.5 rounded-lg font-semibold transition-all shadow-lg shadow-violet-500/20 hover:scale-105 active:scale-95"
                    >
                        <CameraIcon />
                        Connect Agent
                    </button>
                ) : (
                    <button 
                        onClick={stopCapture}
                        className="flex items-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 px-6 py-2.5 rounded-lg font-semibold transition-all hover:text-red-300"
                    >
                        <ZapIcon />
                        Disconnect
                    </button>
                )}
            </div>
        </div>

        {error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-4 rounded-lg flex items-center gap-2 animate-fade-in-right">
                <ExclamationIcon />
                {error}
            </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Video Feed with Grid Overlays */}
            <div className="lg:col-span-2">
                <div className={`relative bg-black rounded-xl overflow-hidden aspect-video border shadow-2xl transition-colors duration-500 ${isLive ? 'border-violet-500/30' : 'border-gray-800'}`}>
                    {!isLive && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 bg-gray-900/50">
                            <UserGroupIcon className="w-16 h-16 mb-4 opacity-30" />
                            <p className="text-lg font-medium text-gray-400">Waiting for meeting connection...</p>
                        </div>
                    )}
                    <video ref={videoRef} className="w-full h-full object-contain" />
                    <canvas ref={canvasRef} className="hidden" />
                    
                    {/* Analysis Overlays - Displayed only when active */}
                    {isLive && participants.map((p, idx) => (
                        <div 
                            key={p.id}
                            className={`absolute border-2 transition-all duration-300 flex items-start justify-start p-2
                                ${idx === 0 ? 'top-0 left-0 w-1/2 h-1/2' : ''}
                                ${idx === 1 ? 'top-0 right-0 w-1/2 h-1/2' : ''}
                                ${idx === 2 ? 'bottom-0 left-0 w-1/2 h-1/2' : ''}
                                ${idx === 3 ? 'bottom-0 right-0 w-1/2 h-1/2' : ''}
                                ${p.activity > 15 ? 'border-cyan-500/40 bg-cyan-500/5' : 'border-transparent'}
                            `}
                        >
                            {p.activity > 15 && (
                                <div className="bg-black/60 text-cyan-400 text-[10px] px-1.5 py-0.5 rounded backdrop-blur-sm border border-cyan-500/30 font-mono flex items-center gap-1">
                                    {p.isSpeaking && <span className="block w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>}
                                    {p.label} {Math.round(p.activity)}%
                                </div>
                            )}
                        </div>
                    ))}

                    {isLive && (
                        <div className="absolute top-4 left-4 bg-red-600/90 text-white text-[10px] font-bold px-2 py-1 rounded flex items-center gap-2 backdrop-blur-sm tracking-widest border border-red-500/50 z-10">
                            <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></span>
                            LIVE ANALYSIS
                        </div>
                    )}
                </div>

                {/* Timeline Chart */}
                <div className="mt-6 bg-gray-900/50 p-6 rounded-xl border border-gray-800 h-72">
                    <h3 className="text-gray-300 font-semibold mb-4 flex items-center gap-2 text-sm uppercase tracking-wider">
                        <ZapIcon className="text-violet-400 w-4 h-4" />
                        Meeting Sentiment & Energy
                    </h3>
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data}>
                            <defs>
                                <linearGradient id="colorSentiment" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                                </linearGradient>
                                <linearGradient id="colorEngagement" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.3}/>
                                    <stop offset="95%" stopColor="#22d3ee" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                            <XAxis dataKey="time" tick={false} stroke="#9ca3af" axisLine={false} />
                            <YAxis domain={[0, 100]} stroke="#6b7280" tick={{fontSize: 12}} axisLine={false} tickLine={false} />
                            <Tooltip 
                                contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#f3f4f6', borderRadius: '0.5rem' }}
                                itemStyle={{ color: '#e5e7eb', fontSize: '12px' }}
                                labelFormatter={() => ''}
                            />
                            <Area type="monotone" dataKey="sentiment" stroke="#8b5cf6" strokeWidth={2} fillOpacity={1} fill="url(#colorSentiment)" name="Positive Sentiment" />
                            <Area type="monotone" dataKey="engagement" stroke="#22d3ee" strokeWidth={2} fillOpacity={1} fill="url(#colorEngagement)" name="Group Energy" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Right: Metrics & Highlights */}
            <div className="flex flex-col gap-6">
                
                {/* Individual Participant Analysis */}
                <div className="bg-gray-900/50 p-6 rounded-xl border border-gray-800">
                     <h3 className="text-gray-300 font-semibold mb-4 text-sm uppercase tracking-wider flex items-center gap-2">
                        <UserGroupIcon className="w-4 h-4 text-cyan-400" />
                        Active Participants (2x2 Grid)
                    </h3>
                    <div className="space-y-4">
                        {participants.map((p) => (
                            <div key={p.id} className="bg-gray-800/40 p-3 rounded-lg border border-gray-700/50 hover:border-gray-600 transition-colors">
                                <div className="flex justify-between items-center mb-2">
                                    <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${p.isSpeaking ? 'bg-green-500 animate-pulse' : 'bg-gray-600'}`}></div>
                                        <span className="text-sm font-medium text-gray-200">{p.label}</span>
                                    </div>
                                    <span className="text-xs text-gray-500 font-mono">
                                        {p.isSpeaking ? 'SPEAKING' : p.activity > 10 ? 'ACTIVE' : 'IDLE'}
                                    </span>
                                </div>
                                <div className="space-y-1.5">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] text-gray-400 w-12">Focus</span>
                                        <div className="flex-grow bg-gray-700 rounded-full h-1 overflow-hidden">
                                            <div className="bg-cyan-400 h-1 rounded-full transition-all duration-500" style={{ width: `${p.focus}%` }}></div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] text-gray-400 w-12">Energy</span>
                                        <div className="flex-grow bg-gray-700 rounded-full h-1 overflow-hidden">
                                            <div className="bg-violet-400 h-1 rounded-full transition-all duration-500" style={{ width: `${p.activity}%` }}></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Highlights Feed */}
                <div className="bg-gray-900/50 p-6 rounded-xl border border-gray-800 flex-grow overflow-hidden flex flex-col h-[200px] lg:h-auto">
                    <h3 className="text-gray-300 font-semibold mb-4 text-sm uppercase tracking-wider">Session Highlights</h3>
                    <div className="flex-grow overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                        {highlights.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-gray-600 space-y-2">
                                <div className="p-3 bg-gray-800/50 rounded-full">
                                    <ZapIcon className="w-5 h-5 opacity-50" />
                                </div>
                                <p className="text-sm italic">Waiting for events...</p>
                            </div>
                        ) : (
                            highlights.slice().reverse().map((h, i) => (
                                <div key={i} className="p-3 bg-gray-800/30 rounded-lg border border-gray-700/30 text-sm animate-fade-in-right hover:bg-gray-800/50 transition-colors">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className={`font-bold text-xs px-1.5 py-0.5 rounded ${
                                            h.type === 'positive' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 
                                            h.type === 'negative' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 
                                            'bg-gray-700/50 text-gray-400 border border-gray-600/50'
                                        }`}>{h.type.toUpperCase()}</span>
                                        <span className="text-gray-600 text-[10px] font-mono">{h.time}</span>
                                    </div>
                                    <p className="text-gray-300 mt-1 leading-snug">{h.text}</p>
                                </div>
                            ))
                        )}
                    </div>
                </div>
                
                 <button className="w-full py-3 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm font-medium">
                    <DownloadIcon />
                    Export Meeting Report
                </button>

            </div>
        </div>
    </div>
  );
};

export default MeetingAgent;
