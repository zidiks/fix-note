import React from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '../../theme/useTheme';

interface Props {
  value: string;
  onChangeText: (text: string) => void;
  onClear: () => void;
  placeholder?: string;
}

export default function SearchBar({ value, onChangeText, onClear, placeholder = 'Поиск заметок...' }: Props) {
  const { colors, isDark } = useTheme();

  return (
    <View style={styles.wrapper}>
      <BlurView
        intensity={60}
        tint={isDark ? 'dark' : 'light'}
        style={[styles.blur, { borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.8)' }]}
      >
        <View style={styles.content}>
          <Text style={[styles.icon, { color: colors.textTertiary }]}>🔍</Text>
          <TextInput
            style={[styles.input, { color: colors.textPrimary }]}
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={colors.textTertiary}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {value.length > 0 && (
            <TouchableOpacity onPress={onClear} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <View style={[styles.clearButton, { backgroundColor: 'rgba(142,142,147,0.5)' }]}>
                <Text style={styles.clearIcon}>✕</Text>
              </View>
            </TouchableOpacity>
          )}
        </View>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
  },
  blur: {
    borderRadius: 100,
    overflow: 'hidden',
    borderWidth: 1,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    paddingHorizontal: 16,
    gap: 8,
  },
  icon: {
    fontSize: 16,
  },
  input: {
    flex: 1,
    fontSize: 17,
    fontWeight: '400',
    padding: 0,
  },
  clearButton: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearIcon: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
});
