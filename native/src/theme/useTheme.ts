import { useColorScheme } from 'react-native';
import { lightColors, darkColors, ColorScheme } from './colors';
import { typography } from './typography';
import { spacing } from './spacing';

export function useTheme() {
  const scheme = useColorScheme();
  const colors: ColorScheme = scheme === 'dark' ? darkColors : lightColors;
  return { colors, typography, spacing, isDark: scheme === 'dark' };
}
