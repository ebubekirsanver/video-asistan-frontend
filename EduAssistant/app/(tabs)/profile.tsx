import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert, Switch, Modal, TextInput, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import { useAuth } from '../../context/AuthContext';
import { useThemeColors } from '../../hooks/useThemeColors';
import { getHistory } from '../../services/api';
import { Spacing, FontSizes, FontWeights, BorderRadius, Shadows, Gradients } from '../../constants/theme';

interface MenuItemProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  subtitle?: string;
  onPress?: () => void;
  color?: string;
  showArrow?: boolean;
  rightElement?: React.ReactNode;
}

function MenuItem({ icon, label, subtitle, onPress, color, showArrow = true, rightElement }: MenuItemProps) {
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
      {rightElement ? rightElement : showArrow && <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />}
    </TouchableOpacity>
  );
}

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const { colors, isDark } = useThemeColors();
  const insets = useSafeAreaInsets();
  const [stats, setStats] = useState({ analiz: 0, sinav: 0 });
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await getHistory();
        const items = Array.isArray(data) ? data : data?.history || [];
        const sinavCount = items.filter((h: any) => h.sorular && h.sorular.length > 0).length;
        setStats({ analiz: items.length, sinav: sinavCount });
      } catch { /* ignore */ }
    })();
  }, []);

  const handleLogout = () => {
    Alert.alert('Çıkış Yap', 'Oturumunuzu kapatmak istediğinize emin misiniz?', [
      { text: 'İptal', style: 'cancel' },
      { text: 'Çıkış Yap', style: 'destructive', onPress: signOut },
    ]);
  };

  const handleTheme = () => {
    Alert.alert('Tema', 'Tema ayarı cihazınızın sistem temasına göre otomatik belirlenir.\n\nAyarlar → Ekran → Karanlık Mod');
  };

  const handleLanguage = () => {
    Alert.alert('Dil', 'Şu anda yalnızca Türkçe desteklenmektedir. Diğer diller yakında eklenecektir.');
  };

  const handleHelp = () => {
    Alert.alert('Yardım & Destek', 'Sorun veya önerileriniz için bize ulaşın.', [
      { text: 'İptal', style: 'cancel' },
      { text: 'E-posta Gönder', onPress: () => Linking.openURL('mailto:destek@eduassistant.app?subject=EduAssistant%20Destek') },
    ]);
  };

  const handleNotificationToggle = (val: boolean) => {
    setNotificationsEnabled(val);
    if (val) {
      Alert.alert(
        'Bildirimler Aktif', 
        'Bildirimler başarıyla açıldı. Çıkarmış olduğunuz tüm video özetleri ve testler Geçmiş sayfanızda güvenle saklanmaktadır.'
      );
    } else {
      Alert.alert('Bildirimler', 'Bildirimler kapatıldı.');
    }
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
          <View style={s.statItem}>
            <Text style={[s.statNum, { color: colors.primary }]}>{stats.analiz}</Text>
            <Text style={[s.statLabel, { color: colors.textTertiary }]}>Toplam Analiz</Text>
          </View>
        </View>

        {/* Menu */}
        <View style={[s.menuCard, { backgroundColor: colors.surface, borderColor: colors.border, ...(!isDark ? Shadows.sm : {}) }]}>
          <MenuItem icon="person-outline" label="Hesap Bilgileri" subtitle={user?.email} onPress={() => setShowAccountModal(true)} />
          <MenuItem
            icon="notifications-outline"
            label="Bildirimler"
            subtitle={notificationsEnabled ? 'Açık' : 'Kapalı'}
            showArrow={false}
            rightElement={
              <Switch
                value={notificationsEnabled}
                onValueChange={handleNotificationToggle}
                trackColor={{ false: colors.border, true: colors.primary + '60' }}
                thumbColor={notificationsEnabled ? colors.primary : colors.textTertiary}
              />
            }
          />
          <MenuItem icon="moon-outline" label="Tema" subtitle={isDark ? 'Koyu' : 'Açık'} onPress={handleTheme} />
          <MenuItem icon="language-outline" label="Dil" subtitle="Türkçe" onPress={handleLanguage} />
          <MenuItem icon="help-circle-outline" label="Yardım & Destek" onPress={handleHelp} />
          <MenuItem icon="information-circle-outline" label="Hakkında" subtitle="v1.0.0" onPress={() => setShowAboutModal(true)} />
        </View>

        {/* Logout */}
        <View style={[s.menuCard, { backgroundColor: colors.surface, borderColor: colors.border, ...(!isDark ? Shadows.sm : {}) }]}>
          <MenuItem icon="log-out-outline" label="Çıkış Yap" color={colors.error} showArrow={false} onPress={handleLogout} />
        </View>

        <Text style={[s.footer, { color: colors.textTertiary }]}>EduAssistant v1.0.0 {'\n'} Smart AI Education Platform</Text>
      </ScrollView>

      {/* Account Modal */}
      <Modal visible={showAccountModal} animationType="slide">
        <SafeAreaView style={[s.safe, { backgroundColor: colors.background }]}>
          <View style={[
            s.modalHeader, 
            { 
              borderBottomColor: colors.border, 
              backgroundColor: colors.surface,
              paddingTop: Platform.OS === 'ios' ? (insets.top || Spacing.md) : Spacing.md
            }
          ]}>
            <Text style={[s.modalTitle, { color: colors.text }]}>Hesap Bilgileri</Text>
            <TouchableOpacity onPress={() => setShowAccountModal(false)}>
              <Ionicons name="close-circle" size={28} color={colors.textTertiary} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: Spacing.xl }}>
            <View style={[s.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={s.infoRow}>
                <Ionicons name="person" size={20} color={colors.primary} />
                <View style={{ flex: 1, marginLeft: Spacing.md }}>
                  <Text style={{ color: colors.textTertiary, fontSize: FontSizes.xs }}>Ad Soyad</Text>
                  <Text style={{ color: colors.text, fontSize: FontSizes.md, fontWeight: '600' }}>{user?.name || '-'}</Text>
                </View>
              </View>
              <View style={[s.infoRow, { borderTopWidth: 1, borderTopColor: colors.border }]}>
                <Ionicons name="mail" size={20} color={colors.primary} />
                <View style={{ flex: 1, marginLeft: Spacing.md }}>
                  <Text style={{ color: colors.textTertiary, fontSize: FontSizes.xs }}>E-posta</Text>
                  <Text style={{ color: colors.text, fontSize: FontSizes.md, fontWeight: '600' }}>{user?.email || '-'}</Text>
                </View>
              </View>
              <View style={[s.infoRow, { borderTopWidth: 1, borderTopColor: colors.border }]}>
                <Ionicons name="shield-checkmark" size={20} color={colors.primary} />
                <View style={{ flex: 1, marginLeft: Spacing.md }}>
                  <Text style={{ color: colors.textTertiary, fontSize: FontSizes.xs }}>Plan</Text>
                  <Text style={{ color: colors.text, fontSize: FontSizes.md, fontWeight: '600' }}>Ücretsiz</Text>
                </View>
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* About Modal */}
      <Modal visible={showAboutModal} animationType="slide">
        <SafeAreaView style={[s.safe, { backgroundColor: colors.background }]}>
          <View style={[
            s.modalHeader, 
            { 
              borderBottomColor: colors.border, 
              backgroundColor: colors.surface,
              paddingTop: Platform.OS === 'ios' ? (insets.top || Spacing.md) : Spacing.md
            }
          ]}>
            <Text style={[s.modalTitle, { color: colors.text }]}>Hakkında</Text>
            <TouchableOpacity onPress={() => setShowAboutModal(false)}>
              <Ionicons name="close-circle" size={28} color={colors.textTertiary} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: Spacing.xl, alignItems: 'center' }}>
            <LinearGradient colors={Gradients.primary as unknown as [string, string, ...string[]]} style={{ width: 80, height: 80, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.lg }}>
              <Ionicons name="school" size={40} color="white" />
            </LinearGradient>
            <Text style={{ color: colors.text, fontSize: FontSizes.xxl, fontWeight: '800', marginBottom: 4 }}>EduAssistant</Text>
            <Text style={{ color: colors.textTertiary, fontSize: FontSizes.sm, marginBottom: Spacing.xl }}>Versiyon 1.0.0</Text>
            <Text style={{ color: colors.textSecondary, fontSize: FontSizes.sm, lineHeight: 22, textAlign: 'center', paddingHorizontal: Spacing.lg }}>
              EduAssistant, yapay zeka destekli bir eğitim platformudur. YouTube videolarını analiz ederek özetler, test soruları ve etkileşimli bir öğrenme deneyimi sunar.
            </Text>
            <Text style={{ color: colors.textTertiary, fontSize: FontSizes.xs, marginTop: Spacing.xxxl }}>© 2026 EduAssistant. Tüm hakları saklıdır.</Text>
          </ScrollView>
        </SafeAreaView>
      </Modal>
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
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.lg, borderBottomWidth: 1 },
  modalTitle: { fontSize: FontSizes.xl, fontWeight: FontWeights.bold },
  infoCard: { borderRadius: BorderRadius.lg, borderWidth: 1, overflow: 'hidden' },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: Spacing.lg },
});
