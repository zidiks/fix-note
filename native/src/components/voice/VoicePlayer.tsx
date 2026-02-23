import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Audio } from 'expo-av';
import { useTheme } from '../../theme/useTheme';
import { formatDuration } from '../../utils/date';

interface Props {
  uri: string;
}

export default function VoicePlayer({ uri }: Props) {
  const { colors } = useTheme();
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    return () => {
      sound?.unloadAsync();
    };
  }, [sound]);

  const loadAndPlay = async () => {
    if (sound) {
      if (isPlaying) {
        await sound.pauseAsync();
        setIsPlaying(false);
      } else {
        await sound.playAsync();
        setIsPlaying(true);
      }
      return;
    }

    setIsLoading(true);
    try {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true },
        (status) => {
          if (status.isLoaded) {
            setPosition(Math.floor((status.positionMillis ?? 0) / 1000));
            setDuration(Math.floor((status.durationMillis ?? 0) / 1000));
            setIsPlaying(status.isPlaying ?? false);
            if (status.didJustFinish) {
              setIsPlaying(false);
              setPosition(0);
            }
          }
        }
      );
      setSound(newSound);
      setIsPlaying(true);
    } catch {
      // Audio load failed silently
    } finally {
      setIsLoading(false);
    }
  };

  const progress = duration > 0 ? position / duration : 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.bgSecondary, borderColor: colors.separator }]}>
      <TouchableOpacity onPress={loadAndPlay} style={[styles.playButton, { backgroundColor: colors.accent }]}>
        {isLoading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={styles.playIcon}>{isPlaying ? '⏸' : '▶'}</Text>
        )}
      </TouchableOpacity>

      <View style={styles.progressContainer}>
        <View style={[styles.progressTrack, { backgroundColor: colors.separator }]}>
          <View
            style={[styles.progressFill, { backgroundColor: colors.accent, width: `${progress * 100}%` }]}
          />
        </View>
        <Text style={[styles.time, { color: colors.textTertiary }]}>
          {formatDuration(position)} / {formatDuration(duration)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 0.5,
    gap: 12,
  },
  playButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIcon: {
    color: '#fff',
    fontSize: 16,
  },
  progressContainer: {
    flex: 1,
    gap: 6,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  time: {
    fontSize: 12,
  },
});
