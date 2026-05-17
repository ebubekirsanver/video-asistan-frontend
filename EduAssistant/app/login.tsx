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

export default function LoginScreen() {
  const { signIn, isLoading } = useAuth();
  const { colors, isDark } = useThemeColors();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  const fadeAnim = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const validate = (): boolean => {
    const newErrors: { email?: string; password?: string } = {};
    if (!email.trim()) newErrors.email = 'E-posta adresi gerekli';
    else if (!email.includes('@')) newErrors.email = 'Geçerli bir e-posta girin';
    if (!password) newErrors.password = 'Şifre gerekli';
    else if (password.length < 3) newErrors.password = 'Şifre çok kısa';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLogin = async () => {
    if (!validate()) return;
    try {
      await signIn(email.trim().toLowerCase(), password);
      router.replace('/(tabs)/home');
    } catch (error: unknown) {
      Alert.alert('Hata', (error as Error).message || 'Giriş başarısız.');
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
            {/* Logo */}
            <View style={styles.logoContainer}>
              <LinearGradient
                colors={Gradients.primary as unknown as [string, string, ...string[]]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.logoGradient}
              >
                <Ionicons name="school" size={40} color="white" />
              </LinearGradient>
              <Text style={[styles.logoTitle, { color: colors.text }]}>
                EduAssistant
              </Text>
              <Text style={[styles.logoSubtitle, { color: colors.primary }]}>
                SMART AI EDUCATION
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
              <Text style={[styles.cardTitle, { color: colors.text }]}>
                Giriş Yap
              </Text>
              <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
                Hesabınıza giriş yaparak devam edin
              </Text>

              <View style={styles.form}>
                <InputField
                  label="E-POSTA ADRESİ"
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
                  placeholder="••••••"
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                  error={errors.password}
                  autoComplete="password"
                  icon={
                    <Ionicons
                      name="lock-closed-outline"
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
                    {showPassword ? 'Gizle' : 'Göster'}
                  </Text>
                </TouchableOpacity>

                <GradientButton
                  title="OTURUM AÇ"
                  onPress={handleLogin}
                  loading={isLoading}
                  size="lg"
                  style={{ marginTop: Spacing.lg }}
                />
              </View>
            </View>

            {/* Footer */}
            <TouchableOpacity
              onPress={() => router.push('/register')}
              style={styles.footer}
            >
              <Text style={[styles.footerText, { color: colors.textTertiary }]}>
                Hesabınız yok mu?{' '}
                <Text style={[styles.footerLink, { color: colors.primary }]}>
                  Kayıt Ol
                </Text>
              </Text>
            </TouchableOpacity>

            <Text style={[styles.slogan, { color: colors.textTertiary }]}>
              Yapay zeka ile öğrenme deneyimine katılın.
            </Text>
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
    justifyContent: 'center',
    paddingHorizontal: Spacing.xxl,
    paddingVertical: Spacing.huge,
  },
  content: {
    alignItems: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: Spacing.xxxl,
  },
  logoGradient: {
    width: 80,
    height: 80,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  logoTitle: {
    fontSize: FontSizes.xxxl,
    fontWeight: FontWeights.black,
    letterSpacing: -1,
  },
  logoSubtitle: {
    fontSize: 9,
    fontWeight: FontWeights.black,
    letterSpacing: 3,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  card: {
    width: '100%',
    borderRadius: BorderRadius.xxl + 8,
    borderWidth: 1,
    padding: Spacing.xxxl,
  },
  cardTitle: {
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.extrabold,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  cardSubtitle: {
    fontSize: FontSizes.sm,
    textAlign: 'center',
    marginBottom: Spacing.xxl,
  },
  form: {},
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
  slogan: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
    marginTop: Spacing.lg,
    textAlign: 'center',
  },
});
