import React from 'react';
import { View, Text, StyleSheet, type ViewStyle } from 'react-native';
import { useThemeColors } from '../hooks/useThemeColors';
import { BorderRadius, Spacing, FontSizes, FontWeights, Shadows } from '../constants/theme';

interface ChatBubbleProps {
  message: string;
  isUser: boolean;
  timestamp?: string;
  style?: ViewStyle;
}

export function ChatBubble({ message, isUser, timestamp, style }: ChatBubbleProps) {
  const { colors } = useThemeColors();

  return (
    <View
      style={[
        styles.container,
        isUser ? styles.userContainer : styles.aiContainer,
        style,
      ]}
    >
      {!isUser && (
        <View
          style={[
            styles.avatar,
            { backgroundColor: colors.primary },
          ]}
        >
          <Text style={styles.avatarText}>AI</Text>
        </View>
      )}
      <View
        style={[
          styles.bubble,
          isUser
            ? [styles.userBubble, { backgroundColor: colors.userBubble }]
            : [
                styles.aiBubble,
                {
                  backgroundColor: colors.aiBubble,
                  ...Shadows.sm,
                },
              ],
        ]}
      >
        <Text
          style={[
            styles.message,
            {
              color: isUser ? colors.textInverse : colors.aiBubbleText,
            },
          ]}
          selectable
        >
          {message}
        </Text>
        {timestamp && (
          <Text
            style={[
              styles.timestamp,
              {
                color: isUser
                  ? 'rgba(255,255,255,0.6)'
                  : colors.textTertiary,
              },
            ]}
          >
            {timestamp}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  userContainer: {
    justifyContent: 'flex-end',
  },
  aiContainer: {
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.sm,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  avatarText: {
    color: 'white',
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.extrabold,
  },
  bubble: {
    maxWidth: '80%',
    borderRadius: BorderRadius.xl,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  userBubble: {
    borderBottomRightRadius: Spacing.xs,
    marginLeft: 'auto',
  },
  aiBubble: {
    borderBottomLeftRadius: Spacing.xs,
  },
  message: {
    fontSize: FontSizes.md,
    lineHeight: 22,
    fontWeight: FontWeights.regular,
  },
  timestamp: {
    fontSize: FontSizes.xs,
    marginTop: Spacing.xs,
    textAlign: 'right',
  },
});
