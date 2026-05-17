import React from 'react';
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { useThemeColors } from '../hooks/useThemeColors';
import { BorderRadius, FontSizes, FontWeights, Spacing } from '../constants/theme';

interface InputFieldProps extends TextInputProps {
  label: string;
  error?: string;
  containerStyle?: ViewStyle;
  icon?: React.ReactNode;
}

export function InputField({
  label,
  error,
  containerStyle,
  icon,
  ...props
}: InputFieldProps) {
  const { colors } = useThemeColors();

  return (
    <View style={[styles.container, containerStyle]}>
      <Text
        style={[
          styles.label,
          { color: error ? colors.error : colors.textTertiary },
        ]}
      >
        {label}
      </Text>
      <View
        style={[
          styles.inputWrapper,
          {
            backgroundColor: colors.inputBackground,
            borderColor: error ? colors.error : colors.inputBorder,
          },
        ]}
      >
        {icon && <View style={styles.iconWrapper}>{icon}</View>}
        <TextInput
          style={[
            styles.input,
            {
              color: colors.inputText,
              paddingLeft: icon ? 0 : Spacing.lg,
            },
          ]}
          placeholderTextColor={colors.inputPlaceholder}
          autoCapitalize="none"
          {...props}
        />
      </View>
      {error ? (
        <Text style={[styles.error, { color: colors.error }]}>{error}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.xl,
  },
  label: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.extrabold,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: Spacing.sm,
    marginLeft: Spacing.xs,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    minHeight: 52,
  },
  iconWrapper: {
    paddingLeft: Spacing.lg,
    paddingRight: Spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.medium,
    paddingVertical: Spacing.md,
    paddingRight: Spacing.lg,
  },
  error: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
    marginTop: Spacing.xs,
    marginLeft: Spacing.xs,
  },
});
