import React from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../context/AuthContext';
import { useThemeColors } from '../../hooks/useThemeColors';
import { Spacing, FontSizes, FontWeights, BorderRadius, Shadows, Gradients } from '../../constants/theme';

interface MenuItemProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  subtitle?: string;
  onPress?: () => void;
  color?: string;
  showArrow?: boolean;
}

function MenuItem({ icon, label, subtitle, onPress, color, showArrow = true }: MenuItemProps) {
  const { colors } = useThemeColors();
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={[s.menuItem, { borderBottomColor: colors.border }]}>
      <View style={[s.menuIcon, { backgroundColor: (color || colors.primary) + '18' }]}>
        <Ionicons name={icon} size={20} color={color || colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.menuLabel, { color: colors.text }]}>{label}</Text>
        {subtitle && <Text style={[s.menuSub, { color: colors.textTertiary }]}>{subtitle}</Text>}
      </View>
      {showArrow && <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />}
    </TouchableOpacity>
  );
}

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const { colors, isDark } = useThemeColors();

  const handleLogout = () => {
    Alert.alert('Çıkış Yap', 'Oturumunuzu kapatmak istediğinize emin misiniz?', [
      { text: 'İptal', style: 'cancel' },
      { text: 'Çıkış Yap', style: 'destructive', onPress: signOut },
    ]);
  };

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <LinearGradient colors={Gradients.header as unknown as [string, string, ...string[]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.header}>
          <View style={s.avatarCircle}>
            <Text style={s.avatarText}>{(user?.name || 'U')[0].toUpperCase()}</Text>
          </View>
          <Text style={s.userName}>{user?.name || 'Kullanıcı'}</Text>
          <Text style={s.userEmail}>{user?.email || ''}</Text>
          <View style={s.badge}>
            <Ionicons name="sparkles" size={12} color="#fbbf24" />
            <Text style={s.badgeText}>Ücretsiz Plan</Text>
          </View>
        </LinearGradient>

        {/* Stats */}
        <View style={[s.statsRow, { backgroundColor: colors.surface, borderColor: colors.border, ...(!isDark ? Shadows.sm : {}) }]}>
          {[{ n: '0', l: 'Analiz' }, { n: '0', l: 'Not' }, { n: '0', l: 'Sınav' }].map((stat, i) => (
            <View key={i} style={[s.statItem, i < 2 && { borderRightColor: colors.border, borderRightWidth: 1 }]}>
              <Text style={[s.statNum, { color: colors.primary }]}>{stat.n}</Text>
              <Text style={[s.statLabel, { color: colors.textTertiary }]}>{stat.l}</Text>
            </View>
          ))}
        </View>

        {/* Menu */}
        <View style={[s.menuCard, { backgroundColor: colors.surface, borderColor: colors.border, ...(!isDark ? Shadows.sm : {}) }]}>
          <MenuItem icon="person-outline" label="Hesap Bilgileri" subtitle={user?.email} />
          <MenuItem icon="notifications-outline" label="Bildirimler" subtitle="Açık" />
          <MenuItem icon="moon-outline" label="Tema" subtitle={isDark ? 'Koyu' : 'Açık'} />
          <MenuItem icon="language-outline" label="Dil" subtitle="Türkçe" />
          <MenuItem icon="help-circle-outline" label="Yardım & Destek" />
          <MenuItem icon="information-circle-outline" label="Hakkında" subtitle="v1.0.0" />
        </View>

        {/* Logout */}
        <View style={[s.menuCard, { backgroundColor: colors.surface, borderColor: colors.border, ...(!isDark ? Shadows.sm : {}) }]}>
          <MenuItem icon="log-out-outline" label="Çıkış Yap" color={colors.error} showArrow={false} onPress={handleLogout} />
        </View>

        <Text style={[s.footer, { color: colors.textTertiary }]}>EduAssistant v1.0.0 {'\n'} Smart AI Education Platform</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  header: { paddingTop: Spacing.xxl, paddingBottom: Spacing.xxxl, alignItems: 'center' },
  avatarCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.md },
  avatarText: { fontSize: FontSizes.xxxl, fontWeight: FontWeights.black, color: 'white' },
  userName: { fontSize: FontSizes.xl, fontWeight: FontWeights.bold, color: 'white' },
  userEmail: { fontSize: FontSizes.sm, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: Spacing.md, backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, borderRadius: BorderRadius.round },
  badgeText: { fontSize: FontSizes.xs, fontWeight: FontWeights.bold, color: 'white' },
  statsRow: { flexDirection: 'row', marginHorizontal: Spacing.lg, marginTop: -Spacing.xl, borderRadius: BorderRadius.lg, borderWidth: 1 },
  statItem: { flex: 1, alignItems: 'center', paddingVertical: Spacing.lg },
  statNum: { fontSize: FontSizes.xxl, fontWeight: FontWeights.black },
  statLabel: { fontSize: FontSizes.xs, fontWeight: FontWeights.semibold, marginTop: 2 },
  menuCard: { marginHorizontal: Spacing.lg, marginTop: Spacing.lg, borderRadius: BorderRadius.lg, borderWidth: 1, overflow: 'hidden' },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth },
  menuIcon: { width: 36, height: 36, borderRadius: BorderRadius.sm, justifyContent: 'center', alignItems: 'center' },
  menuLabel: { fontSize: FontSizes.md, fontWeight: FontWeights.semibold },
  menuSub: { fontSize: FontSizes.xs, marginTop: 1 },
  footer: { textAlign: 'center', fontSize: FontSizes.xs, marginVertical: Spacing.xxxl, lineHeight: 18 },
});
