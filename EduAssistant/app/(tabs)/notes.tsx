import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput, RefreshControl,
  StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useThemeColors } from '../../hooks/useThemeColors';
import { getNotes, saveNote } from '../../services/api';
import { GradientButton } from '../../components/GradientButton';
import { Spacing, FontSizes, FontWeights, BorderRadius, Shadows, Gradients } from '../../constants/theme';

interface NoteItem { id: string; content: string; videoUrl?: string; video_url?: string; created_at?: string; }

function fmtDate(d?: string): string {
  if (!d) return '';
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? '' : dt.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}

export default function NotesScreen() {
  const { colors, isDark } = useThemeColors();
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchNotes = async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    try {
      const data = await getNotes();
      setNotes(Array.isArray(data) ? data : data?.notes || []);
    } catch { /* ignore */ } finally { setLoading(false); setRefreshing(false); }
  };

  useFocusEffect(useCallback(() => { fetchNotes(); }, []));

  const handleSave = async () => {
    if (!newContent.trim()) { Alert.alert('Uyarı', 'Not içeriği boş olamaz.'); return; }
    setSaving(true);
    try {
      await saveNote(newContent.trim(), newUrl.trim());
      setNewContent(''); setNewUrl(''); setShowAdd(false);
      fetchNotes();
      Alert.alert('Başarılı', 'Not kaydedildi.');
    } catch { Alert.alert('Hata', 'Not kaydedilemedi.'); } finally { setSaving(false); }
  };

  const renderItem = ({ item }: { item: NoteItem }) => (
    <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border, ...(!isDark ? Shadows.sm : {}) }]}>
      <View style={s.cardHeader}>
        <View style={[s.cardDot, { backgroundColor: colors.primary }]} />
        <Text style={[s.cardDate, { color: colors.textTertiary }]}>{fmtDate(item.created_at)}</Text>
      </View>
      <Text style={[s.cardContent, { color: colors.text }]} selectable>{item.content}</Text>
      {(item.videoUrl || item.video_url) && (
        <Text style={[s.cardUrl, { color: colors.accent }]} numberOfLines={1}>🔗 {item.videoUrl || item.video_url}</Text>
      )}
    </View>
  );

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <LinearGradient colors={Gradients.header as unknown as [string, string, ...string[]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.header}>
          <View style={s.headerRow}>
            <View>
              <Text style={s.headerTitle}>Notlarım</Text>
              <Text style={s.headerSub}>{notes.length > 0 ? `${notes.length} not` : 'Notlarınız'}</Text>
            </View>
            <TouchableOpacity onPress={() => setShowAdd(!showAdd)} style={s.addBtn}>
              <Ionicons name={showAdd ? 'close' : 'add'} size={24} color="white" />
            </TouchableOpacity>
          </View>
        </LinearGradient>

        {showAdd && (
          <View style={[s.addCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <TextInput style={[s.addInput, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.inputText }]} placeholder="Notunuzu yazın..." placeholderTextColor={colors.inputPlaceholder} value={newContent} onChangeText={setNewContent} multiline numberOfLines={3} textAlignVertical="top" />
            <TextInput style={[s.addUrlInput, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.inputText }]} placeholder="Video URL (opsiyonel)" placeholderTextColor={colors.inputPlaceholder} value={newUrl} onChangeText={setNewUrl} autoCapitalize="none" keyboardType="url" />
            <GradientButton title="KAYDET" onPress={handleSave} loading={saving} size="md" />
          </View>
        )}

        {loading ? <View style={s.loader}><ActivityIndicator size="large" color={colors.primary} /></View> : (
          <FlatList data={notes} keyExtractor={(item, i) => item.id?.toString() || i.toString()} renderItem={renderItem}
            ListEmptyComponent={<View style={s.empty}><Ionicons name="document-text-outline" size={48} color={colors.textTertiary} /><Text style={[s.emptyTitle, { color: colors.text }]}>Henüz not yok</Text><Text style={[s.emptySub, { color: colors.textSecondary }]}>Notlarınızı buradan yönetin</Text></View>}
            contentContainerStyle={s.list} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchNotes(true)} tintColor={colors.primary} colors={[colors.primary]} />} showsVerticalScrollIndicator={false} />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  header: { paddingTop: Spacing.md, paddingBottom: Spacing.xl, paddingHorizontal: Spacing.xl },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { fontSize: FontSizes.xxl, fontWeight: FontWeights.black, color: 'white', letterSpacing: -0.5 },
  headerSub: { fontSize: FontSizes.sm, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  addCard: { margin: Spacing.lg, padding: Spacing.lg, borderRadius: BorderRadius.lg, borderWidth: 1, gap: Spacing.md },
  addInput: { borderWidth: 1, borderRadius: BorderRadius.md, padding: Spacing.md, fontSize: FontSizes.md, minHeight: 80 },
  addUrlInput: { borderWidth: 1, borderRadius: BorderRadius.md, padding: Spacing.md, fontSize: FontSizes.sm },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: Spacing.lg, paddingBottom: Spacing.huge, flexGrow: 1 },
  card: { borderRadius: BorderRadius.lg, borderWidth: 1, padding: Spacing.lg, marginBottom: Spacing.md },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  cardDot: { width: 8, height: 8, borderRadius: 4 },
  cardDate: { fontSize: FontSizes.xs },
  cardContent: { fontSize: FontSizes.md, lineHeight: 22 },
  cardUrl: { fontSize: FontSizes.xs, marginTop: Spacing.sm },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: Spacing.huge * 2, gap: Spacing.md },
  emptyTitle: { fontSize: FontSizes.xl, fontWeight: FontWeights.bold, textAlign: 'center' },
  emptySub: { fontSize: FontSizes.md, textAlign: 'center' },
});
