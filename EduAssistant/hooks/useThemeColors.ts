import { useColorScheme } from 'react-native';
import { Colors } from '../constants/theme';

export function useThemeColors() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  return {
    colors: isDark ? Colors.dark : Colors.light,
    isDark,
    colorScheme: colorScheme || 'light',
  };
}
