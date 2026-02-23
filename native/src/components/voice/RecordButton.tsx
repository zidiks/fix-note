import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  runOnJS,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme/useTheme';
import { useAudioRecorder } from './useAudioRecorder';
import { notesApi } from '../../api/notes';
import { useI18n } from '../../i18n';
import { formatDuration } from '../../utils/date';

interface Props {
  onNoteCreated: () => void;
}

export default function RecordButton({ onNoteCreated }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const pulseScale = useSharedValue(1);

  const startPulse = () => {
    pulseScale.value = withRepeat(
      withSequence(withTiming(1.2, { duration: 600 }), withTiming(1, { duration: 600 })),
      -1,
      false
    );
  };

  const stopPulse = () => {
    pulseScale.value = withTiming(1, { duration: 200 });
  };

  const handleComplete = async (uri: string, fileName: string, durationSeconds: number) => {
    setIsUploading(true);
    setUploadError(null);
    try {
      await notesApi.uploadVoiceNote(uri, fileName);
      onNoteCreated();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      setUploadError('Не удалось загрузить запись');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsUploading(false);
    }
  };

  const { state, durationSeconds, startRecording, stopRecording, cancelRecording, isRecording } =
    useAudioRecorder({
      onComplete: handleComplete,
      onError: (err) => {
        Alert.alert(t('error'), err);
        stopPulse();
      },
    });

  const longPressGesture = Gesture.LongPress()
    .minDuration(300)
    .onStart(() => {
      runOnJS(startRecording)();
      runOnJS(startPulse)();
    })
    .onEnd(() => {
      runOnJS(stopRecording)();
      runOnJS(stopPulse)();
    })
    .onFinalize((_, success) => {
      if (!success) {
        runOnJS(cancelRecording)();
        runOnJS(stopPulse)();
      }
    });

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  const showOverlay = isRecording || isUploading;

  return (
    <>
      <GestureDetector gesture={longPressGesture}>
        <Animated.View style={[styles.buttonWrapper, pulseStyle]}>
          <View
            style={[
              styles.button,
              {
                backgroundColor: isRecording ? colors.destructive : colors.accent,
              },
            ]}
          >
            <Text style={styles.icon}>{isRecording ? '⏹' : '🎙️'}</Text>
          </View>
        </Animated.View>
      </GestureDetector>

      {/* Recording Overlay Modal */}
      <Modal visible={showOverlay} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={[styles.overlayCard, { backgroundColor: colors.bgSecondary }]}>
            {isUploading ? (
              <>
                <ActivityIndicator color={colors.accent} size="large" style={{ marginBottom: 12 }} />
                <Text style={[styles.overlayTitle, { color: colors.textPrimary }]}>
                  {t('transcribing')}
                </Text>
                <Text style={[styles.overlaySubtitle, { color: colors.textSecondary }]}>
                  Это займёт несколько секунд...
                </Text>
              </>
            ) : uploadError ? (
              <>
                <Text style={styles.errorIcon}>❌</Text>
                <Text style={[styles.overlayTitle, { color: colors.textPrimary }]}>{t('error')}</Text>
                <Text style={[styles.overlaySubtitle, { color: colors.textSecondary }]}>{uploadError}</Text>
              </>
            ) : (
              <>
                <View style={[styles.recordingIndicator, { borderColor: colors.destructive }]}>
                  <Text style={styles.recordingIcon}>🎙️</Text>
                </View>
                <Text style={[styles.overlayTitle, { color: colors.textPrimary }]}>
                  {t('recording')}
                </Text>
                <Text style={[styles.timer, { color: colors.destructive }]}>
                  {formatDuration(durationSeconds)}
                </Text>
                <Text style={[styles.overlaySubtitle, { color: colors.textSecondary }]}>
                  Отпустите для остановки
                </Text>
              </>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  buttonWrapper: {
    width: 48,
    height: 48,
  },
  button: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 20,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayCard: {
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    minWidth: 240,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  recordingIndicator: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  recordingIcon: { fontSize: 32 },
  overlayTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  overlaySubtitle: {
    fontSize: 14,
    textAlign: 'center',
  },
  timer: {
    fontSize: 32,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    marginBottom: 8,
  },
  errorIcon: { fontSize: 40, marginBottom: 12 },
});
