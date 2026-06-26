import { useRef } from 'react';

export const useTTS = () => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const isPlayingRef = useRef(false);
  const queueRef = useRef<string[]>([]);

  const playAudio = async (base64Data: string) => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }

      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const int16Data = new Int16Array(bytes.buffer);
      const float32Data = new Float32Array(int16Data.length);
      for (let i = 0; i < int16Data.length; i++) {
        float32Data[i] = int16Data[i] / 32768;
      }

      const buffer = audioContextRef.current.createBuffer(1, float32Data.length, 24000);
      buffer.getChannelData(0).set(float32Data);

      const source = audioContextRef.current.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContextRef.current.destination);
      
      return new Promise<void>((resolve) => {
        source.onended = () => resolve();
        source.start();
      });
    } catch (e) {
      console.error("Audio Playback Error:", e);
    }
  };

  const speak = async (text: string, isBid = false) => {
    // AI Voice is currently disabled to save API quota
    return;
  };

  return { speak };
};
