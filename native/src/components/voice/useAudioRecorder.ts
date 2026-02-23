import { useState, useRef, useCallback } from 'react';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';

export type RecordingState = 'idle' | 'recording' | 'uploading' | 'error';

interface UseAudioRecorderOptions {
  onComplete: (uri: string, fileName: string, durationSeconds: number) => void;
  onError?: (error: string) => void;
}

export function useAudioRecorder({ onComplete, onError }: UseAudioRecorderOptions) {
  const [state, setState] = useState<RecordingState>('idle');
  const [durationSeconds, setDurationSeconds] = useState(0);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startRecording = useCallback(async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        onError?.('Нет доступа к микрофону');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();

      recordingRef.current = recording;
      setDurationSeconds(0);
      setState('recording');

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // Timer for duration display
      timerRef.current = setInterval(() => {
        setDurationSeconds((d) => d + 1);
      }, 1000);
    } catch (e) {
      onError?.('Не удалось начать запись');
    }
  }, [onError]);

  const stopRecording = useCallback(async () => {
    if (!recordingRef.current || state !== 'recording') return;

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      const recording = recordingRef.current;
      await recording.stopAndUnloadAsync();

      const uri = recording.getURI();
      const status = await recording.getStatusAsync();
      const duration = Math.floor((status.durationMillis ?? 0) / 1000);

      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

      recordingRef.current = null;
      setState('idle');

      if (uri && duration > 0) {
        const fileName = `voice_${Date.now()}.m4a`;
        onComplete(uri, fileName, duration);
      } else {
        onError?.('Запись слишком короткая');
      }
    } catch (e) {
      setState('error');
      onError?.('Ошибка при остановке записи');
    }
  }, [state, onComplete, onError]);

  const cancelRecording = useCallback(async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (recordingRef.current) {
      try {
        await recordingRef.current.stopAndUnloadAsync();
      } catch {
        // Ignore
      }
      recordingRef.current = null;
    }
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
    setState('idle');
    setDurationSeconds(0);
  }, []);

  return {
    state,
    setState,
    durationSeconds,
    startRecording,
    stopRecording,
    cancelRecording,
    isRecording: state === 'recording',
  };
}
