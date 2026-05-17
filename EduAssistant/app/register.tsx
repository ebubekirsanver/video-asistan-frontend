import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Alert,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { useThemeColors } from '../hooks/useThemeColors';
import { InputField } from '../components/InputField';
import { GradientButton } from '../components/GradientButton';
import {
  Gradients,
  Spacing,
  FontSizes,
  FontWeights,
  BorderRadius,
  Shadows,
} from '../constants/theme';

export default function RegisterScreen() {
  const { signUp, isLoading } = useAuth();
  const { colors, isDark } = useThemeColors();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const fadeAnim = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = 'Ad soyad gerekli';
    if (!email.trim()) newErrors.email = 'E-posta adresi gerekli';
    else if (!email.includes('@')) newErrors.email = 'Geçerli bir e-posta girin';
    if (!password) newErrors.password = 'Şifre gerekli';
    else if (password.length < 6)
      newErrors.password = 'Şifre en az 6 karakter olmalı';
    if (!confirmPassword) newErrors.confirm = 'Şifre tekrarı gerekli';
    else if (password !== confirmPassword)
      newErrors.confirm = 'Şifreler uyuşmuyor';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleRegister = async () => {
    if (!validate()) return;
    try {
      await signUp(email.trim().toLowerCase(), password, name.trim());
      router.replace('/(tabs)/home');
    } catch (error: unknown) {
      Alert.alert('Hata', (error as Error).message || 'Kayıt başarısız.');
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
            {/* Back Button */}
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.backButton}
            >
              <Ionicons
                name="arrow-back"
                size={24}
                color={colors.text}
              />
            </TouchableOpacity>

            {/* Logo */}
            <View style={styles.logoContainer}>
              <LinearGradient
                colors={Gradients.primary as unknown as [string, string, ...string[]]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.logoGradient}
              >
                <Ionicons name="school" size={32} color="white" />
              </LinearGradient>
              <Text style={[styles.logoTitle, { color: colors.text }]}>
                Kayıt Ol
              </Text>
              <Text style={[styles.logoSubtitle, { color: colors.textSecondary }]}>
                Yeni hesap oluşturun
              </Text>
            </View>

            {/* Card */}
            <View
              style={[
                styles.card,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  ...(!isDark ? Shadows.lg : {}),
                },
              ]}
            >
              <InputField
                label="AD SOYAD"
                placeholder="Adınız Soyadınız"
                value={name}
                onChangeText={setName}
                error={errors.name}
                autoComplete="name"
                icon={
                  <Ionicons
                    name="person-outline"
                    size={20}
                    color={colors.textTertiary}
                  />
                }
              />

              <InputField
                label="E-POSTA"
                placeholder="ornek@email.com"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
                error={errors.email}
                autoComplete="email"
                icon={
                  <Ionicons
                    name="mail-outline"
                    size={20}
                    color={colors.textTertiary}
                  />
                }
              />

              <InputField
                label="ŞİFRE"
                placeholder="En az 6 karakter"
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
                error={errors.password}
                icon={
                  <Ionicons
                    name="lock-closed-outline"
                    size={20}
                    color={colors.textTertiary}
                  />
                }
              />

              <InputField
                label="ŞİFRE TEKRAR"
                placeholder="Şifrenizi onaylayın"
                secureTextEntry={!showPassword}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                error={errors.confirm}
                icon={
                  <Ionicons
                    name="shield-checkmark-outline"
                    size={20}
                    color={colors.textTertiary}
                  />
                }
              />

              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={styles.togglePassword}
              >
                <Text style={[styles.toggleText, { color: colors.primary }]}>
                  {showPassword ? 'Şifreleri Gizle' : 'Şifreleri Göster'}
                </Text>
              </TouchableOpacity>

              <GradientButton
                title="HESAP OLUŞTUR"
                onPress={handleRegister}
                loading={isLoading}
                size="lg"
                style={{ marginTop: Spacing.md }}
              />
            </View>

            {/* Footer */}
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.footer}
            >
              <Text style={[styles.footerText, { color: colors.textTertiary }]}>
                Zaten hesabınız var mı?{' '}
                <Text style={[styles.footerLink, { color: colors.primary }]}>
                  Giriş Yap
                </Text>
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.xxl,
    paddingVertical: Spacing.xxxl,
  },
  content: {
    alignItems: 'center',
  },
  backButton: {
    alignSelf: 'flex-start',
    padding: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: Spacing.xxl,
  },
  logoGradient: {
    width: 64,
    height: 64,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  logoTitle: {
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.extrabold,
    letterSpacing: -0.5,
  },
  logoSubtitle: {
    fontSize: FontSizes.sm,
    marginTop: 4,
  },
  card: {
    width: '100%',
    borderRadius: BorderRadius.xxl + 8,
    borderWidth: 1,
    padding: Spacing.xxl,
  },
  togglePassword: {
    alignSelf: 'flex-end',
    marginTop: -Spacing.md,
    marginBottom: Spacing.sm,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  toggleText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.extrabold,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  footer: {
    marginTop: Spacing.xxl,
    paddingVertical: Spacing.md,
  },
  footerText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  footerLink: {
    fontWeight: FontWeights.extrabold,
  },
});
