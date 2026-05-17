import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ScrollView,
  type ViewStyle,
} from 'react-native';
import { useThemeColors } from '../hooks/useThemeColors';
import { BorderRadius, FontSizes, FontWeights, Spacing } from '../constants/theme';

interface QuickAction {
  label: string;
  icon?: string;
}

interface QuickActionsProps {
  actions: QuickAction[];
  onPress: (label: string) => void;
  style?: ViewStyle;
}

export function QuickActions({ actions, onPress, style }: QuickActionsProps) {
  const { colors } = useThemeColors();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.container, style]}
    >
      {actions.map((action, index) => (
        <TouchableOpacity
          key={index}
          onPress={() => onPress(action.label)}
          activeOpacity={0.7}
          style={[
            styles.chip,
            {
              backgroundColor: colors.surfaceElevated,
              borderColor: colors.border,
            },
          ]}
        >
          {action.icon && (
            <Text style={styles.icon}>{action.icon}</Text>
          )}
          <Text
            style={[
              styles.label,
              { color: colors.primary },
            ]}
          >
            {action.label}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.round,
    borderWidth: 1,
    gap: Spacing.xs,
  },
  icon: {
    fontSize: FontSizes.md,
  },
  label: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
});
