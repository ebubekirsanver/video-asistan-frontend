/**
 * EduAssistant Design System - Color Palette & Theme Constants
 * Based on: Royal Violet (#7c3aed) + Electric Cyan (#06b6d4)
 */

export const Colors = {
  light: {
    primary: '#7c3aed',
    primaryDark: '#6d28d9',
    primaryLight: '#a78bfa',
    accent: '#06b6d4',
    accentDark: '#0891b2',
    accentLight: '#67e8f9',

    background: '#f8fafc',
    surface: '#ffffff',
    surfaceElevated: '#f1f5f9',
    card: '#ffffff',

    text: '#0f172a',
    textSecondary: '#475569',
    textTertiary: '#94a3b8',
    textInverse: '#ffffff',

    border: '#e2e8f0',
    borderLight: '#f1f5f9',
    divider: '#e2e8f0',

    success: '#10b981',
    error: '#ef4444',
    warning: '#f59e0b',
    info: '#3b82f6',

    userBubble: '#7c3aed',
    aiBubble: '#f1f5f9',
    aiBubbleText: '#1e293b',

    tabBar: '#ffffff',
    tabBarBorder: '#e2e8f0',
    tabActive: '#7c3aed',
    tabInactive: '#94a3b8',

    inputBackground: '#f1f5f9',
    inputBorder: '#e2e8f0',
    inputText: '#0f172a',
    inputPlaceholder: '#94a3b8',

    skeleton: '#e2e8f0',
    skeletonHighlight: '#f1f5f9',
  },
  dark: {
    primary: '#a78bfa',
    primaryDark: '#7c3aed',
    primaryLight: '#c4b5fd',
    accent: '#22d3ee',
    accentDark: '#06b6d4',
    accentLight: '#67e8f9',

    background: '#020617',
    surface: '#0f172a',
    surfaceElevated: '#1e293b',
    card: '#0f172a',

    text: '#f8fafc',
    textSecondary: '#cbd5e1',
    textTertiary: '#64748b',
    textInverse: '#0f172a',

    border: '#1e293b',
    borderLight: '#334155',
    divider: '#1e293b',

    success: '#34d399',
    error: '#f87171',
    warning: '#fbbf24',
    info: '#60a5fa',

    userBubble: '#7c3aed',
    aiBubble: '#1e293b',
    aiBubbleText: '#e2e8f0',

    tabBar: '#0f172a',
    tabBarBorder: '#1e293b',
    tabActive: '#a78bfa',
    tabInactive: '#64748b',

    inputBackground: '#1e293b',
    inputBorder: '#334155',
    inputText: '#f8fafc',
    inputPlaceholder: '#64748b',

    skeleton: '#1e293b',
    skeletonHighlight: '#334155',
  },
};

export const Gradients = {
  primary: ['#7c3aed', '#06b6d4'] as const,
  primaryReverse: ['#06b6d4', '#7c3aed'] as const,
  header: ['#7c3aed', '#6d28d9'] as const,
  splash: ['#4c1d95', '#7c3aed', '#06b6d4'] as const,
  card: ['#7c3aed', '#8b5cf6'] as const,
  dark: ['#020617', '#0f172a'] as const,
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
};

export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  round: 9999,
};

export const FontSizes = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  hero: 40,
};

export const FontWeights = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,
  black: '900' as const,
};

export const Shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
  glow: {
    shadowColor: '#7c3aed',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
};
