import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../hooks/useThemeColors';
import { Gradients, Spacing, FontSizes, FontWeights, BorderRadius } from '../constants/theme';

interface GradientHeaderProps {
  title?: string;
  subtitle?: string;
  showProfile?: boolean;
}

export function GradientHeader({
  title = 'EduAssistant',
  subtitle = 'Kişisel AI Eğitmen',
  showProfile = true,
}: GradientHeaderProps) {
  const { colors } = useThemeColors();

  return (
    <LinearGradient
      colors={Gradients.header as unknown as [string, string, ...string[]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.header}
    >
      <View style={styles.content}>
        <View style={styles.logoRow}>
          <View style={styles.logoIcon}>
            <Ionicons name="school" size={24} color="white" />
          </View>
          <View>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
          </View>
        </View>
        {showProfile && (
          <View style={styles.profileIcon}>
            <Ionicons name="person-circle-outline" size={32} color="rgba(255,255,255,0.85)" />
          </View>
        )}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
    paddingHorizontal: Spacing.xl,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  logoIcon: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.black,
    color: 'white',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  profileIcon: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
