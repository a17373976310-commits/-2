
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { AppNode } from '../types';
import { decodeBase64, encodeBase64, decodeAudioData } from '../services/ApiService';

interface LiveAudioUIProps {
  node: AppNode;
  onUpdate: (id: string, data: any) => void;
  onDelete: (id: string) => void;
}

export const LiveAudioUI: React.FC<LiveAudioUIProps> = ({ node, onUpdate, onDelete }) => {
  const [active, setActive] = useState(false);
  const [transcription, setTranscription] = useState<string[]>([]);
  const nextStartTimeRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const sessionRef = useRef<any>(null);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  const stopSession = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    sourcesRef.current.forEach(s => s.stop());
    sourcesRef.current.clear();
    setActive(false);
  }, []);

  const startSession = async () => {
    try {
      // 关键：即时创建实例以获取最新的 process.env.API_KEY
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      if (!inputAudioContextRef.current) {
        inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            const source = inputAudioContextRef.current!.createMediaStreamSource(stream);
            const scriptProcessor = inputAudioContextRef.current!.createScriptProcessor(4096, 1, 1);
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const l = inputData.length;
              const int16 = new Int16Array(l);
              for (let i = 0; i < l; i++) {
                int16[i] = inputData[i] * 32768;
              }
              const pcmBlob = {
                data: encodeBase64(new Uint8Array(int16.buffer)),
                mimeType: 'audio/pcm;rate=16000',
              };
              sessionPromise.then(session => session.sendRealtimeInput({ media: pcmBlob }));
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputAudioContextRef.current!.destination);
            setActive(true);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent?.outputTranscription) {
              setTranscription(prev => [...prev.slice(-4), `Gemini: ${message.serverContent!.outputTranscription!.text}`]);
            }
            if (message.serverContent?.inputTranscription) {
              setTranscription(prev => [...prev.slice(-4), `You: ${message.serverContent!.inputTranscription!.text}`]);
            }

            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio && audioContextRef.current) {
              const ctx = audioContextRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              const buffer = await decodeAudioData(decodeBase64(base64Audio), ctx, 24000, 1);
              const source = ctx.createBufferSource();
              source.buffer = buffer;
              source.connect(ctx.destination);
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              sourcesRef.current.add(source);
              source.onended = () => sourcesRef.current.delete(source);
            }

            if (message.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => s.stop());
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }
          },
          onerror: (e) => console.error("Session Error", e),
          onclose: () => setActive(false)
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
          inputAudioTranscription: {},
          outputAudioTranscription: {}
        }
      });

      sessionRef.current = await sessionPromise;
    } catch (err) {
      console.error(err);
      alert("Microphone access or connection failed");
    }
  };

  useEffect(() => {
    return () => stopSession();
  }, [stopSession]);

  return (
    <div className="bg-slate-800 border border-slate-600 rounded-xl shadow-2xl w-80 overflow-hidden flex flex-col pointer-events-auto">
      <div className="bg-rose-900/30 p-3 flex justify-between items-center border-b border-rose-500/30">
        <div className="flex flex-col">
          <span className="text-white font-bold text-sm uppercase tracking-wider">{node.titleZh}</span>
          <span className="text-slate-400 text-xs font-medium uppercase tracking-tighter">{node.title}</span>
        </div>
        <button onClick={() => onDelete(node.id)} className="text-slate-400 hover:text-red-400 transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
      </div>

      <div className="p-4 space-y-4">
        <div className="flex flex-col items-center justify-center py-6">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-500 ${active ? 'bg-rose-500 animate-pulse scale-110 shadow-lg shadow-rose-500/50' : 'bg-slate-700 opacity-50'}`}>
            <span className="text-3xl">{active ? '🎙️' : '🔇'}</span>
          </div>
          <p className="mt-4 text-slate-300 text-sm font-medium">{active ? '正在倾听/说话...' : '麦克风已关闭'}</p>
        </div>

        <button
          onClick={active ? stopSession : startSession}
          className={`w-full py-3 rounded-lg font-bold text-sm uppercase tracking-widest transition-all ${active ? 'bg-red-600 hover:bg-red-500' : 'bg-emerald-600 hover:bg-emerald-500'} text-white shadow-lg`}
        >
          {active ? 'Stop Call / 停止通话' : 'Start Call / 开始通话'}
        </button>

        {transcription.length > 0 && (
          <div className="bg-slate-900/50 p-3 rounded-lg space-y-2 border border-slate-700">
            {transcription.map((t, i) => (
              <p key={i} className={`text-xs ${t.startsWith('You') ? 'text-blue-400' : 'text-emerald-400'}`}>{t}</p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
