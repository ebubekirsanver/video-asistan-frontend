import React from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Gradients, BorderRadius, FontSizes, FontWeights } from '../constants/theme';

interface GradientButtonProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  size?: 'sm' | 'md' | 'lg';
  colors?: readonly [string, string, ...string[]];
  icon?: React.ReactNode;
}

export function GradientButton({
  title,
  onPress,
  disabled = false,
  loading = false,
  style,
  size = 'md',
  colors,
  icon,
}: GradientButtonProps) {
  const gradientColors = colors || Gradients.primary;
  const isDisabled = disabled || loading;

  const paddingMap = {
    sm: { paddingVertical: 10, paddingHorizontal: 16 },
    md: { paddingVertical: 14, paddingHorizontal: 24 },
    lg: { paddingVertical: 18, paddingHorizontal: 32 },
  };

  const fontSizeMap = {
    sm: FontSizes.sm,
    md: FontSizes.md,
    lg: FontSizes.lg,
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.85}
      style={style}
    >
      <LinearGradient
        colors={gradientColors as unknown as [string, string, ...string[]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[
          styles.gradient,
          paddingMap[size],
          isDisabled && styles.disabled,
        ]}
      >
        {loading ? (
          <ActivityIndicator color="white" size="small" />
        ) : (
          <>
            {icon}
            <Text
              style={[
                styles.text,
                { fontSize: fontSizeMap[size] },
                icon ? { marginLeft: 8 } : undefined,
              ]}
            >
              {title}
            </Text>
          </>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  gradient: {
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  disabled: {
    opacity: 0.6,
  },
  text: {
    color: 'white',
    fontWeight: FontWeights.bold,
    letterSpacing: 0.3,
  },
});
