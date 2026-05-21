import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, RefreshControl,
  StyleSheet, ActivityIndicator, Image, Modal, ScrollView, Platform, Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useThemeColors } from '../../hooks/useThemeColors';
import { getHistory, getRecommendations, sendFeedback } from '../../services/api';
import { Linking } from 'react-native';
import { GradientButton } from '../../components/GradientButton';
import { Spacing, FontSizes, FontWeights, BorderRadius, Shadows, Gradients } from '../../constants/theme';

interface Question {
  soru: string;
  secenekler: Record<string, string>;
  dogru_cevap: string;
  aciklama?: string;
  zaman_referansi?: string;
}

interface HistoryItem {
  id: string; 
  video_id?: string; 
  video_url?: string;
  title?: string; 
  summary?: string; 
  created_at?: string; 
  timestamp?: string;
  ozet?: string;
  summary_sections?: { subtitle: string; content: string }[];
  key_concepts?: { term: string; definition: string }[];
  important_regions?: { label: string; text: string }[];
  process_flow?: { step: string; detail: string }[];
  key_formulas?: { label: string; formula: string }[];
  fun_facts?: string[];
  examples?: string[];
  sorular?: Question[];
}

function extractVid(url: string): string | null {
  const m = String(url || '').match(/(?:v=|\/|embed\/|youtu\.be\/)([0-9A-Za-z_-]{11})/);
  return m ? m[1] : null;
}

function fmtDate(d?: string): string {
  if (!d) return '';
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? '' : dt.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Reusable Quiz Card (Pre-filled for History)
const QuizCard = ({ q, index, colors }: { q: Question; index: number; colors: any }) => {
  // In history view, we want the answers to be pre-revealed
  const [selectedOpt, setSelectedOpt] = useState<string | null>(q.dogru_cevap);
  const options = q.secenekler ? Object.entries(q.secenekler) : [];

  return (
    <View style={[styles.quizCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.sm }}>
        <Text style={[styles.quizQuestion, { color: colors.text }]}>
          <Text style={{ color: colors.primary, fontWeight: 'bold' }}>{index + 1}.</Text> {q.soru}
        </Text>
      </View>
      
      {q.zaman_referansi && (
        <View style={styles.timeTag}>
          <Ionicons name="time-outline" size={12} color="#6366f1" />
          <Text style={{ fontSize: 10, color: '#6366f1', fontWeight: 'bold' }}>{q.zaman_referansi}</Text>
        </View>
      )}

      <View style={{ marginTop: Spacing.sm, gap: Spacing.xs }}>
        {options.length > 0 ? options.map(([key, val]) => {
          const isSelected = selectedOpt === key;
          const isCorrect = key === q.dogru_cevap;
          const showResult = selectedOpt !== null;
          
          let bgColor = colors.inputBackground;
          let borderColor = colors.inputBorder;
          
          if (showResult) {
            if (isCorrect) {
              bgColor = 'rgba(16, 185, 129, 0.1)';
              borderColor = '#10b981';
            } else if (isSelected && !isCorrect) {
              bgColor = 'rgba(239, 68, 68, 0.1)';
              borderColor = '#ef4444';
            }
          }

          return (
            <TouchableOpacity 
              key={key} 
              style={[styles.quizOption, { backgroundColor: bgColor, borderColor }]} 
              onPress={() => !showResult && setSelectedOpt(key)}
              disabled={showResult}
            >
              <View style={[styles.quizOptionLetterBox, { backgroundColor: showResult && isCorrect ? '#10b981' : (showResult && isSelected ? '#ef4444' : colors.border) }]}>
                <Text style={[styles.quizOptionLetter, { color: showResult && (isCorrect || isSelected) ? '#fff' : colors.textSecondary }]}>{key}</Text>
              </View>
              <Text style={[styles.quizOptionText, { color: colors.text }]}>{val}</Text>
            </TouchableOpacity>
          );
        }) : (
          <Text style={{ color: colors.textSecondary, fontStyle: 'italic' }}>Seçenekler oluşturulamadı.</Text>
        )}
      </View>

      {selectedOpt && (
        <View style={[styles.quizExplanation, { backgroundColor: selectedOpt === q.dogru_cevap ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', borderColor: selectedOpt === q.dogru_cevap ? '#10b981' : '#ef4444' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <Ionicons name={selectedOpt === q.dogru_cevap ? "checkmark-circle" : "close-circle"} size={18} color={selectedOpt === q.dogru_cevap ? '#059669' : '#b91c1c'} />
            <Text style={{ color: selectedOpt === q.dogru_cevap ? '#059669' : '#b91c1c', fontWeight: 'bold' }}>
              {selectedOpt === q.dogru_cevap ? 'Doğru Cevap' : `Yanlış. Doğru cevap: ${q.dogru_cevap}`}
            </Text>
          </View>
          {q.aciklama && <Text style={{ color: colors.text, fontSize: FontSizes.sm, lineHeight: 20 }}>{q.aciklama}</Text>}
        </View>
      )}
    </View>
  );
};

interface Recommendation {
  title: string;
  reason: string;
  search_url: string;
  feedback?: 'like' | 'dislike' | null;
}

export default function HistoryScreen() {
  const { colors, isDark } = useThemeColors();
  const insets = useSafeAreaInsets();
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedItem, setSelectedItem] = useState<HistoryItem | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [recsLoading, setRecsLoading] = useState(false);
  const [interests, setInterests] = useState<string[]>([]);


  const fetchData = async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    try {
      const data = await getHistory();
      const items = Array.isArray(data) ? data : data?.history || [];
      setHistory(items);
      if (items.length > 0) fetchRecommendations();
    } catch { /* ignore */ } finally { setLoading(false); setRefreshing(false); }
  };

  const fetchRecommendations = async () => {
    setRecsLoading(true);
    try {
      const data = await getRecommendations();
      setInterests(data.interests || []);
      setRecommendations((data.recommendations || []).map((r: any) => ({ ...r, feedback: null })));
    } catch { /* ignore */ } finally { setRecsLoading(false); }
  };

  const handleFeedback = async (index: number, action: 'like' | 'dislike') => {
    const rec = recommendations[index];
    if (!rec) return;
    const newFeedback = rec.feedback === action ? null : action;
    const updated = [...recommendations];
    updated[index] = { ...rec, feedback: newFeedback };
    setRecommendations(updated);
    try {
      await sendFeedback(rec.title, newFeedback || 'remove');
    } catch { /* ignore */ }
  };

  useFocusEffect(useCallback(() => { fetchData(); }, []));

  const generatePDF = async () => {
    if (!selectedItem) return;
    try {
      const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 40px; color: #1e293b; line-height: 1.6; background-color: #f8fafc; }
              .container { max-width: 800px; margin: 0 auto; background: #ffffff; padding: 40px; border-radius: 16px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05); }
              h1 { color: #4f46e5; border-bottom: 3px solid #6366f1; padding-bottom: 15px; margin-bottom: 30px; font-size: 28px; line-height: 1.3; }
              h2 { color: #4f46e5; margin-top: 40px; margin-bottom: 20px; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; font-size: 22px; }
              .section { margin-bottom: 25px; page-break-inside: avoid; }
              .subtitle { font-weight: bold; color: #1e293b; margin-bottom: 8px; font-size: 18px; }
              .content-text { color: #334155; margin-top: 0; font-size: 15px; }
              
              /* Infographics */
              .infographic-grid { display: flex; flex-direction: column; gap: 20px; margin-top: 30px; }
              .infographic-card { padding: 20px; border-radius: 12px; page-break-inside: avoid; }
              .info-concepts { background: #eef2ff; border: 1px solid #c7d2fe; }
              .info-regions { background: #fffbeb; border: 1px solid #fde68a; }
              .info-title { font-size: 16px; font-weight: bold; margin-bottom: 15px; text-transform: uppercase; }
              .info-title-blue { color: #4f46e5; }
              .info-title-amber { color: #d97706; }
              .info-item { margin-bottom: 12px; font-size: 14px; color: #334155; }
              .info-term { font-weight: bold; color: #1e293b; display: block; margin-bottom: 2px; }
              
              /* Quiz */
              .question { margin-top: 25px; background: #f8fafc; padding: 25px; border-radius: 12px; border: 1px solid #e2e8f0; page-break-inside: avoid; }
              .question-title { font-size: 16px; font-weight: bold; margin-bottom: 15px; color: #1e293b; }
              .option { margin-left: 0; margin-bottom: 10px; padding: 12px 16px; border-radius: 8px; border: 1px solid #cbd5e1; background: #ffffff; font-size: 14px; color: #334155; }
              .correct { font-weight: bold; color: #059669; background: #d1fae5; border-color: #10b981; }
              .explanation { margin-top: 20px; font-size: 14px; color: #334155; padding: 15px; background: #f1f5f9; border-radius: 8px; border-left: 4px solid #6366f1; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>${selectedItem.title || 'Video Analizi'}</h1>
              
              <h2>Özet</h2>
              ${selectedItem.summary_sections && selectedItem.summary_sections.length > 0 ? 
                selectedItem.summary_sections.map(sec => `
                  <div class="section">
                    <div class="subtitle">${sec.subtitle}</div>
                    <p class="content-text">${sec.content}</p>
                  </div>
                `).join('') 
                : `<div class="section"><p class="content-text">${selectedItem.ozet || selectedItem.summary || ''}</p></div>`
              }
              
              ${(selectedItem.key_concepts || selectedItem.important_regions) ? `
                <div class="infographic-grid">
                  ${selectedItem.key_concepts && selectedItem.key_concepts.length > 0 ? `
                    <div class="infographic-card info-concepts">
                      <div class="info-title info-title-blue">💡 Önemli Kavramlar</div>
                      ${selectedItem.key_concepts.map(c => `
                        <div class="info-item">
                          <span class="info-term">${c.term}</span> ${c.definition}
                        </div>
                      `).join('')}
                    </div>
                  ` : ''}
                  ${selectedItem.important_regions && selectedItem.important_regions.length > 0 ? `
                    <div class="infographic-card info-regions">
                      <div class="info-title info-title-amber">⚠️ Kritik Bölgeler</div>
                      ${selectedItem.important_regions.map(r => `
                        <div class="info-item">
                          <span class="info-term">${r.label}</span> ${r.text}
                        </div>
                      `).join('')}
                    </div>
                  ` : ''}
                </div>
              ` : ''}
              
              ${selectedItem.sorular && selectedItem.sorular.length > 0 ? `
                <h2>Sınav Soruları ve Açıklamalar</h2>
                ${selectedItem.sorular.map((q, i) => `
                  <div class="question">
                    <div class="question-title">Soru ${i+1}: ${q.soru}</div>
                    ${q.secenekler ? Object.entries(q.secenekler).map(([key, val]) => `
                      <div class="option ${key === q.dogru_cevap ? 'correct' : ''}">
                        ${key}) ${val} ${key === q.dogru_cevap ? '✅ (Doğru Cevap)' : ''}
                      </div>
                    `).join('') : ''}
                    <div class="explanation"><strong>Açıklama:</strong> ${q.aciklama || ''}</div>
                  </div>
                `).join('')}
              ` : ''}
            </div>
          </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf', dialogTitle: 'Video Analizini Paylaş' });
    } catch (error) {
      Alert.alert('Hata', 'PDF oluşturulurken bir sorun oluştu.');
    }
  };

  const renderItem = ({ item }: { item: HistoryItem }) => {
    const isLocalFile = String(item.video_id || '').startsWith('file_');
    const vid = item.video_id || extractVid(item.video_url || '');
    const thumb = (!isLocalFile && vid) ? `https://img.youtube.com/vi/${vid}/mqdefault.jpg` : null;
    return (
      <TouchableOpacity 
        activeOpacity={0.7} 
        style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, ...(!isDark ? Shadows.sm : {}) }]}
        onPress={() => setSelectedItem(item)}
      >
        <View style={styles.cardRow}>
          {isLocalFile ? (
            <View style={[styles.thumb, { backgroundColor: colors.primary + '15', justifyContent: 'center', alignItems: 'center', borderRadius: 8 }]}>
              <Ionicons name="document-text" size={24} color={colors.primary} />
            </View>
          ) : thumb ? (
            <Image source={{ uri: thumb }} style={styles.thumb} />
          ) : (
            <View style={[styles.thumbPh, { backgroundColor: colors.surfaceElevated }]}><Ionicons name="play-circle" size={28} color={colors.textTertiary} /></View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitleText, { color: colors.text }]} numberOfLines={2}>{item.title || 'Video Analizi'}</Text>
            {item.summary && <Text style={[styles.cardSub, { color: colors.textSecondary }]} numberOfLines={2}>{item.summary}</Text>}
            <Text style={[styles.cardDate, { color: colors.textTertiary }]}>{fmtDate(item.created_at || item.timestamp)}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <LinearGradient colors={Gradients.header as unknown as [string, string, ...string[]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
        <Text style={styles.headerTitle}>Geçmiş</Text>
        <Text style={styles.headerSub}>{history.length > 0 ? `${history.length} analiz` : 'Analiz geçmişiniz'}</Text>
      </LinearGradient>

      {loading ? <View style={styles.loader}><ActivityIndicator size="large" color={colors.primary} /></View> : (
        <FlatList 
          data={history} 
          keyExtractor={(item, i) => item.id?.toString() || i.toString()} 
          renderItem={renderItem}
          ListHeaderComponent={history.length > 0 ? (
            <View style={[styles.recsCard, { backgroundColor: colors.surface, borderColor: colors.border, ...(!isDark ? Shadows.sm : {}) }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md }}>
                <LinearGradient colors={Gradients.primary as unknown as [string, string, ...string[]]} style={{ width: 36, height: 36, borderRadius: 12, justifyContent: 'center', alignItems: 'center' }}>
                  <Ionicons name="sparkles" size={18} color="white" />
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sectionTitle, { color: colors.text, fontSize: FontSizes.md }]}>Size Özel Tavsiyeler</Text>
                  <Text style={{ color: colors.textTertiary, fontSize: FontSizes.xs }}>Geçmişinize göre öneriler</Text>
                </View>
                <TouchableOpacity onPress={fetchRecommendations} style={{ padding: Spacing.xs }}>
                  <Ionicons name="refresh" size={20} color={colors.primary} />
                </TouchableOpacity>
              </View>
              {interests.length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: Spacing.md }}>
                  {interests.map((interest, i) => (
                    <View key={i} style={{ backgroundColor: colors.primary + '15', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
                      <Text style={{ fontSize: FontSizes.xs, color: colors.primary, fontWeight: '600' }}>{interest}</Text>
                    </View>
                  ))}
                </View>
              )}
              {recsLoading ? (
                <ActivityIndicator size="small" color={colors.primary} style={{ paddingVertical: Spacing.lg }} />
              ) : recommendations.length > 0 ? (
                <View style={{ gap: Spacing.sm }}>
                  {recommendations.map((rec, i) => (
                    <View key={i} style={[styles.recItem, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}>
                      <TouchableOpacity style={{ flex: 1 }} onPress={() => Linking.openURL(rec.search_url)} activeOpacity={0.7}>
                        <Text style={{ color: colors.text, fontSize: FontSizes.sm, fontWeight: '600', marginBottom: 2 }} numberOfLines={2}>{rec.title}</Text>
                        <Text style={{ color: colors.textSecondary, fontSize: FontSizes.xs }} numberOfLines={2}>{rec.reason}</Text>
                      </TouchableOpacity>
                      <View style={{ flexDirection: 'row', gap: 4, marginLeft: 8 }}>
                        <TouchableOpacity onPress={() => handleFeedback(i, 'like')} style={[styles.feedbackBtn, rec.feedback === 'like' && { backgroundColor: '#10b98120' }]}>
                          <Ionicons name={rec.feedback === 'like' ? 'thumbs-up' : 'thumbs-up-outline'} size={16} color={rec.feedback === 'like' ? '#10b981' : colors.textTertiary} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleFeedback(i, 'dislike')} style={[styles.feedbackBtn, rec.feedback === 'dislike' && { backgroundColor: '#ef444420' }]}>
                          <Ionicons name={rec.feedback === 'dislike' ? 'thumbs-down' : 'thumbs-down-outline'} size={16} color={rec.feedback === 'dislike' ? '#ef4444' : colors.textTertiary} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={{ color: colors.textTertiary, fontSize: FontSizes.sm, textAlign: 'center', paddingVertical: Spacing.md }}>Tavsiye oluşturulamadı</Text>
              )}
            </View>
          ) : null}
          ListEmptyComponent={<View style={styles.empty}><Ionicons name="time-outline" size={48} color={colors.textTertiary} /><Text style={[styles.emptyTitle, { color: colors.text }]}>Henüz geçmiş yok</Text><Text style={[styles.emptySub, { color: colors.textSecondary }]}>Video analiz ettiğinizde burada görünecek</Text></View>}
          contentContainerStyle={styles.list} 
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchData(true)} tintColor={colors.primary} colors={[colors.primary]} />} 
          showsVerticalScrollIndicator={false} 
        />
      )}

      {/* Analysis Detail Modal */}
      <Modal visible={!!selectedItem} animationType="slide">
        <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
          {selectedItem && (
            <>
              {/* Modal Header */}
              <View style={[
                styles.modalHeader, 
                { 
                  borderBottomColor: colors.border, 
                  backgroundColor: colors.surface,
                  paddingTop: Platform.OS === 'ios' ? (insets.top || Spacing.md) : Spacing.md
                }
              ]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                  <Ionicons name="document-text" size={24} color={colors.primary} />
                  <Text style={[styles.modalTitle, { color: colors.text }]}>Analiz Detayı</Text>
                </View>
                <TouchableOpacity onPress={() => setSelectedItem(null)} style={styles.closeBtn}>
                  <Ionicons name="close-circle" size={28} color={colors.textTertiary} />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.flex} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                
                {/* Actions Row */}
                <View style={{ marginBottom: Spacing.xl }}>
                  <GradientButton
                    title="PDF OLARAK İNDİR"
                    onPress={generatePDF}
                    size="lg"
                    icon={<Ionicons name="document-text" size={18} color="white" />}
                  />
                </View>

                {/* Structured Summary Card */}
                <View style={[styles.detailCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md, gap: Spacing.sm }}>
                    <Ionicons name="document-text" size={24} color={colors.primary} />
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>{selectedItem.title || 'Video Özeti'}</Text>
                  </View>
                  
                  {selectedItem.summary_sections && selectedItem.summary_sections.length > 0 ? (
                    selectedItem.summary_sections.map((sec, i) => (
                      <View key={i} style={{ marginBottom: Spacing.md }}>
                        <Text style={{ fontSize: FontSizes.md, fontWeight: 'bold', color: colors.primary, marginBottom: 4 }}>{sec.subtitle}</Text>
                        <Text style={{ color: colors.text, fontSize: FontSizes.sm, lineHeight: 22 }}>{sec.content}</Text>
                      </View>
                    ))
                  ) : (
                    <Text style={{ color: colors.text, fontSize: FontSizes.sm, lineHeight: 22 }}>
                      {selectedItem.ozet || selectedItem.summary || 'Özet bulunamadı.'}
                    </Text>
                  )}
                </View>

                {/* Key Concepts & Important Regions (Infographics) */}
                {(selectedItem.key_concepts || selectedItem.important_regions) && (
                   <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }}>
                      {selectedItem.key_concepts && selectedItem.key_concepts.length > 0 && (
                        <View style={[styles.infographicCard, { backgroundColor: 'rgba(99, 102, 241, 0.05)', borderColor: 'rgba(99, 102, 241, 0.2)' }]}>
                          <Text style={[styles.infoTitle, { color: '#4f46e5' }]}><Ionicons name="bulb" size={16}/> Önemli Kavramlar</Text>
                          {selectedItem.key_concepts.slice(0,4).map((c, i) => (
                            <View key={i} style={styles.infoRow}>
                              <Text style={[styles.infoTerm, { color: colors.text }]}>{c.term}:</Text>
                              <Text style={[styles.infoDef, { color: colors.textSecondary }]}>{c.definition}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                      {selectedItem.important_regions && selectedItem.important_regions.length > 0 && (
                        <View style={[styles.infographicCard, { backgroundColor: 'rgba(245, 158, 11, 0.05)', borderColor: 'rgba(245, 158, 11, 0.2)' }]}>
                          <Text style={[styles.infoTitle, { color: '#d97706' }]}><Ionicons name="warning" size={16}/> Kritik Bölgeler</Text>
                          {selectedItem.important_regions.map((r, i) => (
                            <View key={i} style={styles.infoRow}>
                              <Text style={[styles.infoTerm, { color: colors.text }]}>{r.label}:</Text>
                              <Text style={[styles.infoDef, { color: colors.textSecondary }]}>{r.text}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                   </View>
                )}

                {/* Questions Card (Interactive Quiz) */}
                {selectedItem.sorular && selectedItem.sorular.length > 0 && (
                  <View style={[styles.detailCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md, gap: Spacing.sm }}>
                      <Ionicons name="help-circle" size={24} color={colors.primary} />
                      <Text style={[styles.sectionTitle, { color: colors.text }]}>Sınav / Test</Text>
                    </View>
                    <Text style={{ color: colors.textSecondary, fontSize: FontSizes.xs, marginBottom: Spacing.md }}>
                      Videodan üretilen soruları yanıtlayarak öğrendiklerinizi test edin.
                    </Text>
                    {selectedItem.sorular.map((q, index) => (
                      <QuizCard key={index} q={q} index={index} colors={colors} />
                    ))}
                  </View>
                )}

                <View style={{ height: Spacing.xxxl }} />
              </ScrollView>
            </>
          )}
        </SafeAreaView>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 }, 
  flex: { flex: 1 },
  header: { paddingTop: Spacing.md, paddingBottom: Spacing.xl, paddingHorizontal: Spacing.xl },
  headerTitle: { fontSize: FontSizes.xxl, fontWeight: FontWeights.black, color: 'white', letterSpacing: -0.5 },
  headerSub: { fontSize: FontSizes.sm, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: Spacing.lg, paddingBottom: Spacing.huge, flexGrow: 1 },
  scrollContent: { padding: Spacing.lg },

  card: { borderRadius: BorderRadius.lg, borderWidth: 1, padding: Spacing.md, marginBottom: Spacing.md },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  thumb: { width: 72, height: 48, borderRadius: BorderRadius.sm }, 
  thumbPh: { width: 72, height: 48, borderRadius: BorderRadius.sm, justifyContent: 'center', alignItems: 'center' },
  cardTitleText: { fontSize: FontSizes.md, fontWeight: FontWeights.bold },
  cardSub: { fontSize: FontSizes.sm, marginTop: 2, lineHeight: 18 },
  cardDate: { fontSize: FontSizes.xs, marginTop: 4 },
  
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: Spacing.huge * 2, gap: Spacing.md },
  emptyTitle: { fontSize: FontSizes.xl, fontWeight: FontWeights.bold, textAlign: 'center' },
  emptySub: { fontSize: FontSizes.md, textAlign: 'center', lineHeight: 22 },

  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.lg, borderBottomWidth: 1 },
  modalTitle: { fontSize: FontSizes.xl, fontWeight: FontWeights.bold },
  closeBtn: { padding: Spacing.xs },

  detailCard: { padding: Spacing.xl, borderRadius: BorderRadius.xl, borderWidth: 1, marginBottom: Spacing.lg },
  sectionTitle: { fontSize: FontSizes.lg, fontWeight: FontWeights.bold },

  infographicCard: { flex: 1, minWidth: '48%', padding: Spacing.md, borderRadius: BorderRadius.lg, borderWidth: 1, marginBottom: Spacing.sm },
  infoTitle: { fontSize: FontSizes.xs, fontWeight: 'bold', textTransform: 'uppercase', marginBottom: Spacing.sm },
  infoRow: { marginBottom: 6 },
  infoTerm: { fontSize: FontSizes.xs, fontWeight: 'bold' },
  infoDef: { fontSize: FontSizes.xs },

  quizCard: { padding: Spacing.lg, borderRadius: BorderRadius.lg, borderWidth: 1, marginBottom: Spacing.md },
  quizQuestion: { fontSize: FontSizes.md, fontWeight: '500', lineHeight: 22 },
  timeTag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(99, 102, 241, 0.1)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, alignSelf: 'flex-start', marginBottom: Spacing.md },
  quizOption: { flexDirection: 'row', alignItems: 'center', padding: Spacing.sm, borderRadius: BorderRadius.md, borderWidth: 1 },
  quizOptionLetterBox: { width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: Spacing.sm },
  quizOptionLetter: { fontSize: FontSizes.xs, fontWeight: 'bold' },
  quizOptionText: { flex: 1, fontSize: FontSizes.sm },
  quizExplanation: { marginTop: Spacing.md, padding: Spacing.md, borderRadius: BorderRadius.md, borderWidth: 1 },

  recsCard: { borderRadius: BorderRadius.xl, borderWidth: 1, padding: Spacing.lg, marginBottom: Spacing.lg },
  recItem: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderRadius: BorderRadius.lg, borderWidth: 1, marginBottom: Spacing.sm },
  feedbackBtn: { width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
});
