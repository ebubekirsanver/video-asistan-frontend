import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, type ViewStyle } from 'react-native';
import { useThemeColors } from '../hooks/useThemeColors';
import { BorderRadius, Spacing } from '../constants/theme';

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export function Skeleton({
  width = '100%',
  height = 20,
  borderRadius = BorderRadius.sm,
  style,
}: SkeletonProps) {
  const { colors } = useThemeColors();
  const animatedValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(animatedValue, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: false,
        }),
        Animated.timing(animatedValue, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: false,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [animatedValue]);

  const backgroundColor = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.skeleton, colors.skeletonHighlight],
  });

  return (
    <Animated.View
      style={[
        {
          width: width as number,
          height,
          borderRadius,
          backgroundColor,
        },
        style,
      ]}
    />
  );
}

export function ChatSkeleton() {
  return (
    <View style={skeletonStyles.chatContainer}>
      <View style={skeletonStyles.row}>
        <Skeleton width={32} height={32} borderRadius={8} />
        <View style={skeletonStyles.bubbleArea}>
          <Skeleton width="85%" height={18} />
          <Skeleton width="70%" height={18} style={{ marginTop: 6 }} />
          <Skeleton width="55%" height={18} style={{ marginTop: 6 }} />
        </View>
      </View>
    </View>
  );
}

const skeletonStyles = StyleSheet.create({
  chatContainer: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  bubbleArea: {
    flex: 1,
    paddingTop: 4,
  },
});
