import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Alert,
  Image,
  Keyboard,
  Modal,
  Animated,
  Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { GradientHeader } from '../../components/GradientHeader';
import { GradientButton } from '../../components/GradientButton';
import { ChatBubble } from '../../components/ChatBubble';
import { ChatSkeleton } from '../../components/Skeleton';
import { useThemeColors } from '../../hooks/useThemeColors';
import { analyzeVideo as apiAnalyzeVideo, chatWithVideo } from '../../services/api';
import {
  Spacing,
  FontSizes,
  FontWeights,
  BorderRadius,
  Shadows,
  Gradients,
} from '../../constants/theme';

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: string;
}

interface Question {
  soru: string;
  secenekler: Record<string, string>;
  dogru_cevap: string;
  aciklama?: string;
  zaman_referansi?: string;
}

interface AnalizData {
  title: string;
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

interface VideoInfo {
  url: string;
  thumbnail: string | null;
  title: string | null;
  videoId: string | null;
  analysisId?: string;
  analiz?: AnalizData;
}

function extractVideoId(url: string): string | null {
  const match = url.match(
    /(?:v=|\/|embed\/|youtu\.be\/)([0-9A-Za-z_-]{11})/
  );
  return match ? match[1] : null;
}

function getTimestamp(): string {
  return new Date().toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Reusable Segmented Control Component
const SegmentedControl = ({
  label,
  options,
  selectedValue,
  onSelect,
  colors,
}: {
  label: string;
  options: { label: string; value: string | number }[];
  selectedValue: string | number;
  onSelect: (val: any) => void;
  colors: any;
}) => {
  return (
    <View style={styles.segmentContainer}>
      <Text style={[styles.segmentLabel, { color: colors.textSecondary }]}>
        {label}
      </Text>
      <View style={[styles.segmentWrapper, { backgroundColor: colors.inputBackground }]}>
        {options.map((opt) => {
          const isSelected = selectedValue === opt.value;
          return (
            <TouchableOpacity
              key={String(opt.value)}
              style={[
                styles.segmentItem,
                isSelected && { backgroundColor: colors.surface, ...Shadows.sm },
              ]}
              onPress={() => onSelect(opt.value)}
            >
              <Text
                style={[
                  styles.segmentText,
                  { color: isSelected ? colors.primary : colors.textTertiary },
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

// Quiz Card Component
const QuizCard = ({ q, index, colors }: { q: Question; index: number; colors: any }) => {
  const [selectedOpt, setSelectedOpt] = useState<string | null>(null);

  // Parse secenekler which might be missing or malformed
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
              bgColor = 'rgba(16, 185, 129, 0.1)'; // green
              borderColor = '#10b981';
            } else if (isSelected && !isCorrect) {
              bgColor = 'rgba(239, 68, 68, 0.1)'; // red
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
              {selectedOpt === q.dogru_cevap ? 'Doğru!' : `Yanlış. Doğru cevap: ${q.dogru_cevap}`}
            </Text>
          </View>
          {q.aciklama && <Text style={{ color: colors.text, fontSize: FontSizes.sm, lineHeight: 20 }}>{q.aciklama}</Text>}
        </View>
      )}
    </View>
  );
};

export default function HomeScreen() {
  const { colors, isDark } = useThemeColors();
  const chatScrollViewRef = useRef<ScrollView>(null);

  // Analysis Inputs
  const [videoUrl, setVideoUrl] = useState('');
  const [userTitle, setUserTitle] = useState('');
  const [subjectType, setSubjectType] = useState('sozel');
  const [summaryLength, setSummaryLength] = useState('kisa');
  const [questionCount, setQuestionCount] = useState<number>(5);
  const [questionDifficulty, setQuestionDifficulty] = useState('orta');

  // State
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isVideoLocked, setIsVideoLocked] = useState(false);

  // Progress Bar State
  const progressAnim = useRef(new Animated.Value(0)).current;

  // Chat State
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [userMessage, setUserMessage] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);

  const QUICK_ACTIONS = [
    "Videoyu kısaca özetle",
    "Ana kavramlar neler?",
    "Zorlandığım bir yer var, açıklar mısın?",
    "Pratik örnekler ver"
  ];

  const scrollToBottomChat = useCallback(() => {
    setTimeout(() => {
      chatScrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, []);

  const analyzeVideo = async () => {
    const trimmedUrl = videoUrl.trim();
    if (!trimmedUrl) {
      Alert.alert('Uyarı', 'Lütfen bir YouTube URL girin.');
      return;
    }

    const videoId = extractVideoId(trimmedUrl);
    if (!videoId) {
      Alert.alert('Hata', 'Geçerli bir YouTube URL girin.');
      return;
    }

    setIsAnalyzing(true);
    setVideoInfo({
      url: trimmedUrl,
      thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
      title: null,
      videoId,
    });
    setIsVideoLocked(true);

    // Fake Progress Bar Logic (goes up to 90% over 20 seconds)
    progressAnim.setValue(0);
    Animated.timing(progressAnim, {
      toValue: 90,
      duration: 20000,
      easing: Easing.out(Easing.ease),
      useNativeDriver: false,
    }).start();

    try {
      const options = {
        userTitle: userTitle.trim(),
        subjectType,
        summaryLength,
        questionCount,
        questionDifficulty,
      };

      const response = await apiAnalyzeVideo(trimmedUrl, options);
      
      // Snap progress to 100%
      Animated.timing(progressAnim, {
        toValue: 100,
        duration: 500,
        useNativeDriver: false,
      }).start(() => {
        setIsAnalyzing(false);
        if (response && response.analiz) {
          setVideoInfo(prev => prev ? {
            ...prev,
            title: response.analiz.title || 'Video Analizi',
            analysisId: response.analysis_id,
            analiz: response.analiz,
          } : null);
          
          setMessages([
            {
              id: 'welcome',
              text: 'Merhaba! Videonun analizini tamamladım. Kafana takılan veya anlamadığın bir yer varsa bana sorabilirsin.',
              isUser: false,
              timestamp: getTimestamp(),
            }
          ]);
        }
      });
      
    } catch (error: unknown) {
      progressAnim.stopAnimation();
      setIsAnalyzing(false);
      setIsVideoLocked(false);
      setVideoInfo(null);
      const errorMsg = (error as Error).message || 'Video analiz edilemedi.';
      Alert.alert('Hata', errorMsg);
    }
  };

  const sendMessage = async (textOverride?: string) => {
    const messageText = (textOverride || userMessage).trim();
    if (!messageText || !videoInfo?.url) return;

    Keyboard.dismiss();
    setUserMessage('');

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      text: messageText,
      isUser: true,
      timestamp: getTimestamp(),
    };

    const aiPlaceholder: Message = {
      id: `ai-${Date.now()}`,
      text: '',
      isUser: false,
      timestamp: getTimestamp(),
    };

    setMessages((prev) => [...prev, userMsg, aiPlaceholder]);
    setIsStreaming(true);
    scrollToBottomChat();

    try {
      const strictPrompt = `ÖNEMLİ KURAL: Lütfen sadece videonun içeriğine (transkripte) dayanarak cevap ver. Sorulan soru videonun konusuyla tamamen alakasızsa, "Bu soru video içeriğiyle ilgili değil, lütfen dersle/videoyla alakalı sorular sorun." de ve cevap verme. Soru: ${messageText}`;

      const response = await chatWithVideo(
        videoInfo.analysisId || '',
        videoInfo.url,
        strictPrompt
      );

      setMessages((prev) => {
        const updated = [...prev];
        const lastIndex = updated.length - 1;
        if (lastIndex >= 0 && !updated[lastIndex].isUser) {
          updated[lastIndex] = {
            ...updated[lastIndex],
            text: response.answer || 'Yanıt alınamadı.',
          };
        }
        return updated;
      });
    } catch (error: unknown) {
      const errorMsg = (error as Error).message || 'Yanıt alınamadı.';
      setMessages((prev) => {
        const updated = [...prev];
        const lastIndex = updated.length - 1;
        if (lastIndex >= 0) {
          updated[lastIndex] = {
            ...updated[lastIndex],
            text: `❌ Hata: ${errorMsg}`,
          };
        }
        return updated;
      });
    } finally {
      setIsStreaming(false);
      scrollToBottomChat();
    }
  };

  const resetSession = () => {
    setVideoUrl('');
    setUserTitle('');
    setVideoInfo(null);
    setMessages([]);
    setIsVideoLocked(false);
    setIsAnalyzing(false);
    setIsStreaming(false);
  };

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <GradientHeader />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {!isVideoLocked && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, ...(!isDark ? Shadows.md : {}) }]}>
            <View style={styles.cardHeader}>
              <LinearGradient colors={Gradients.primary as unknown as [string, string, ...string[]]} style={styles.cardIconGradient}>
                <Ionicons name="sparkles" size={22} color="white" />
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>Yeni Eğitim Analizi</Text>
                <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>Video linkini girin ve parametreleri seçin</Text>
              </View>
            </View>

            <View style={[styles.inputWrapper, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}>
              <Ionicons name="link" size={20} color={colors.textTertiary} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: colors.inputText }]}
                placeholder="YouTube URL..."
                placeholderTextColor={colors.inputPlaceholder}
                value={videoUrl}
                onChangeText={setVideoUrl}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={[styles.inputWrapper, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, marginTop: Spacing.md }]}>
              <Ionicons name="text" size={20} color={colors.textTertiary} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: colors.inputText }]}
                placeholder="Özet Başlığı (Opsiyonel)"
                placeholderTextColor={colors.inputPlaceholder}
                value={userTitle}
                onChangeText={setUserTitle}
              />
            </View>

            <View style={{ marginTop: Spacing.lg, gap: Spacing.md }}>
              <SegmentedControl label="Ders Türü" colors={colors} options={[{ label: 'Sözel', value: 'sozel' }, { label: 'Sayısal', value: 'sayisal' }]} selectedValue={subjectType} onSelect={setSubjectType} />
              <SegmentedControl label="Özet Uzunluğu" colors={colors} options={[{ label: 'Kısa', value: 'kisa' }, { label: 'Orta', value: 'orta' }, { label: 'Detaylı', value: 'detayli' }]} selectedValue={summaryLength} onSelect={setSummaryLength} />
              <SegmentedControl label="Soru Sayısı" colors={colors} options={[{ label: '5', value: 5 }, { label: '10', value: 10 }, { label: '15', value: 15 }]} selectedValue={questionCount} onSelect={setQuestionCount} />
              <SegmentedControl label="Soru Zorluğu" colors={colors} options={[{ label: 'Kolay', value: 'kolay' }, { label: 'Orta', value: 'orta' }, { label: 'Zor', value: 'zor' }]} selectedValue={questionDifficulty} onSelect={setQuestionDifficulty} />
            </View>

            <GradientButton
              title="ANALİZİ BAŞLAT"
              onPress={analyzeVideo}
              loading={false}
              size="lg"
              style={{ marginTop: Spacing.xl }}
              icon={<Ionicons name="arrow-forward" size={18} color="white" />}
            />
          </View>
        )}

        {/* Loading Bar State */}
        {isAnalyzing && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, alignItems: 'center', paddingVertical: 40 }]}>
            <Ionicons name="scan-circle-outline" size={64} color={colors.primary} style={{ marginBottom: Spacing.md }} />
            <Text style={{ fontSize: FontSizes.lg, fontWeight: 'bold', color: colors.text, marginBottom: 8 }}>Yapay Zeka Analiz Ediyor</Text>
            <Text style={{ fontSize: FontSizes.sm, color: colors.textSecondary, marginBottom: Spacing.xl, textAlign: 'center' }}>
              Video transkripti inceleniyor ve içerik üretiliyor. Lütfen bekleyin...
            </Text>
            
            <View style={styles.progressBarBg}>
              <Animated.View style={[styles.progressBarFill, { width: progressWidth }]} />
            </View>
          </View>
        )}

        {/* Post-Analysis Display */}
        {videoInfo && !isAnalyzing && videoInfo.analiz && (
          <View style={{ gap: Spacing.lg }}>
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.videoRow}>
                {videoInfo.thumbnail && <Image source={{ uri: videoInfo.thumbnail }} style={styles.thumbnail} resizeMode="cover" />}
                <View style={styles.videoMeta}>
                  <Text style={[styles.videoTitleText, { color: colors.text }]} numberOfLines={2}>{videoInfo.title}</Text>
                  <Text style={{ color: colors.textTertiary, fontSize: FontSizes.xs }} numberOfLines={1}>{videoInfo.url}</Text>
                </View>
                <TouchableOpacity onPress={resetSession} style={[styles.resetButton, { backgroundColor: colors.surfaceElevated }]}>
                  <Ionicons name="close" size={18} color={colors.textTertiary} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Structured Summary Card */}
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md, gap: Spacing.sm }}>
                <Ionicons name="document-text" size={24} color={colors.primary} />
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Video Özeti</Text>
              </View>
              
              {videoInfo.analiz.summary_sections && videoInfo.analiz.summary_sections.map((sec, i) => (
                <View key={i} style={{ marginBottom: Spacing.md }}>
                  <Text style={{ fontSize: FontSizes.md, fontWeight: 'bold', color: colors.primary, marginBottom: 4 }}>{sec.subtitle}</Text>
                  <Text style={{ color: colors.text, fontSize: FontSizes.sm, lineHeight: 22 }}>{sec.content}</Text>
                </View>
              ))}

              {(!videoInfo.analiz.summary_sections || videoInfo.analiz.summary_sections.length === 0) && (
                <Text style={{ color: colors.text, fontSize: FontSizes.sm, lineHeight: 22 }}>{videoInfo.analiz.ozet}</Text>
              )}
            </View>

            {/* Key Concepts & Important Regions (Infographics) */}
            {(videoInfo.analiz.key_concepts || videoInfo.analiz.important_regions) && (
               <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }}>
                  {videoInfo.analiz.key_concepts && videoInfo.analiz.key_concepts.length > 0 && (
                    <View style={[styles.infographicCard, { backgroundColor: 'rgba(99, 102, 241, 0.05)', borderColor: 'rgba(99, 102, 241, 0.2)' }]}>
                      <Text style={[styles.infoTitle, { color: '#4f46e5' }]}><Ionicons name="bulb" size={16}/> Önemli Kavramlar</Text>
                      {videoInfo.analiz.key_concepts.slice(0,4).map((c, i) => (
                        <View key={i} style={styles.infoRow}>
                          <Text style={[styles.infoTerm, { color: colors.text }]}>{c.term}:</Text>
                          <Text style={[styles.infoDef, { color: colors.textSecondary }]}>{c.definition}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                  {videoInfo.analiz.important_regions && videoInfo.analiz.important_regions.length > 0 && (
                    <View style={[styles.infographicCard, { backgroundColor: 'rgba(245, 158, 11, 0.05)', borderColor: 'rgba(245, 158, 11, 0.2)' }]}>
                      <Text style={[styles.infoTitle, { color: '#d97706' }]}><Ionicons name="warning" size={16}/> Kritik Bölgeler</Text>
                      {videoInfo.analiz.important_regions.map((r, i) => (
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
            {videoInfo.analiz.sorular && videoInfo.analiz.sorular.length > 0 && (
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md, gap: Spacing.sm }}>
                  <Ionicons name="help-circle" size={24} color={colors.primary} />
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>Sınav / Test</Text>
                </View>
                <Text style={{ color: colors.textSecondary, fontSize: FontSizes.xs, marginBottom: Spacing.md }}>
                  Videodan üretilen soruları yanıtlayarak öğrendiklerinizi test edin.
                </Text>
                {videoInfo.analiz.sorular.map((q, index) => (
                  <QuizCard key={index} q={q} index={index} colors={colors} />
                ))}
              </View>
            )}

            <View style={{ height: Spacing.xxxl }} />
          </View>
        )}
      </ScrollView>

      {/* Floating Chatbot Button */}
      {videoInfo && !isAnalyzing && videoInfo.analiz && (
        <TouchableOpacity
          style={styles.floatingButton}
          onPress={() => setIsChatOpen(true)}
          activeOpacity={0.8}
        >
          <LinearGradient colors={Gradients.primary as unknown as [string, string, ...string[]]} style={styles.floatingButtonGradient}>
            <Ionicons name="chatbubbles" size={28} color="white" />
          </LinearGradient>
        </TouchableOpacity>
      )}

      {/* Chatbot Modal */}
      <Modal visible={isChatOpen} animationType="slide">
        <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
          <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
            style={styles.flex}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
          >
            
            <View style={[styles.modalHeader, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                <Ionicons name="chatbubbles" size={24} color={colors.primary} />
                <Text style={[styles.modalTitle, { color: colors.text }]}>Asistan</Text>
              </View>
              <TouchableOpacity onPress={() => setIsChatOpen(false)} style={styles.closeBtn}>
                <Ionicons name="close-circle" size={28} color={colors.textTertiary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              ref={chatScrollViewRef}
              style={styles.flex}
              contentContainerStyle={{ padding: Spacing.lg, flexGrow: 1 }}
              keyboardShouldPersistTaps="handled"
            >
              {messages.map((msg) =>
                msg.text ? (
                  <ChatBubble key={msg.id} message={msg.text} isUser={msg.isUser} timestamp={msg.timestamp} />
                ) : (
                  <ChatSkeleton key={msg.id} />
                )
              )}

              {/* Premium Quick Actions inside Chat */}
              {!isStreaming && messages.length <= 2 && (
                <View style={styles.quickActionsGrid}>
                  {QUICK_ACTIONS.map((action, i) => (
                    <TouchableOpacity 
                      key={i} 
                      style={[styles.actionCard, { backgroundColor: colors.surface, borderColor: colors.border, ...(!isDark ? Shadows.sm : {}) }]} 
                      onPress={() => sendMessage(action)}
                    >
                      <View style={{ backgroundColor: 'rgba(99, 102, 241, 0.1)', alignSelf: 'flex-start', padding: 6, borderRadius: 8, marginBottom: 8 }}>
                        <Ionicons name="sparkles" size={16} color={colors.primary} />
                      </View>
                      <Text style={{ color: colors.text, fontSize: FontSizes.sm, fontWeight: '600', lineHeight: 20 }}>{action}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </ScrollView>

            <View style={[styles.inputBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
              <View style={[styles.messageInputWrapper, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}>
                <TextInput
                  style={[styles.messageInput, { color: colors.inputText }]}
                  placeholder="Videoyla ilgili soru sorun..."
                  placeholderTextColor={colors.inputPlaceholder}
                  value={userMessage}
                  onChangeText={setUserMessage}
                  multiline
                  maxLength={1000}
                  editable={!isStreaming}
                />
                <TouchableOpacity
                  onPress={() => sendMessage()}
                  disabled={!userMessage.trim() || isStreaming}
                  style={[styles.sendButton, { opacity: !userMessage.trim() || isStreaming ? 0.4 : 1 }]}
                >
                  <LinearGradient colors={Gradients.primary as unknown as [string, string, ...string[]]} style={styles.sendGradient}>
                    <Ionicons name="send" size={18} color="white" />
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>

          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  scrollContent: { padding: Spacing.lg },
  
  card: { padding: Spacing.xxl, borderRadius: BorderRadius.xxl, borderWidth: 1, marginBottom: Spacing.lg },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.xl },
  cardIconGradient: { width: 48, height: 48, borderRadius: BorderRadius.lg, justifyContent: 'center', alignItems: 'center' },
  cardTitle: { fontSize: FontSizes.xl, fontWeight: FontWeights.extrabold, letterSpacing: -0.5 },
  cardSubtitle: { fontSize: FontSizes.sm, marginTop: 2 },
  
  inputWrapper: { flexDirection: 'row', alignItems: 'center', borderRadius: BorderRadius.lg, borderWidth: 1.5, paddingHorizontal: Spacing.lg, minHeight: 52 },
  inputIcon: { marginRight: Spacing.sm },
  input: { flex: 1, fontSize: FontSizes.md, fontWeight: FontWeights.medium, paddingVertical: Spacing.md },

  segmentContainer: { marginBottom: Spacing.sm },
  segmentLabel: { fontSize: FontSizes.xs, fontWeight: FontWeights.bold, textTransform: 'uppercase', marginBottom: Spacing.xs, marginLeft: Spacing.xs },
  segmentWrapper: { flexDirection: 'row', borderRadius: BorderRadius.xl, padding: 4 },
  segmentItem: { flex: 1, paddingVertical: 10, borderRadius: BorderRadius.lg, alignItems: 'center' },
  segmentText: { fontSize: FontSizes.sm, fontWeight: FontWeights.bold },

  progressBarBg: { width: '100%', height: 12, backgroundColor: '#e2e8f0', borderRadius: 6, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: '#6366f1', borderRadius: 6 },

  videoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  thumbnail: { width: 80, height: 52, borderRadius: BorderRadius.sm },
  videoMeta: { flex: 1 },
  videoTitleText: { fontSize: FontSizes.sm, fontWeight: FontWeights.bold, marginBottom: 2 },
  resetButton: { width: 32, height: 32, borderRadius: BorderRadius.round, justifyContent: 'center', alignItems: 'center' },

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

  floatingButton: { position: 'absolute', bottom: 30, right: 30, shadowColor: '#6366f1', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 10 },
  floatingButtonGradient: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center' },

  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.lg, borderBottomWidth: 1 },
  modalTitle: { fontSize: FontSizes.xl, fontWeight: FontWeights.bold },
  closeBtn: { padding: Spacing.xs },

  quickActionsGrid: { marginTop: Spacing.lg, flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  actionCard: { flex: 1, minWidth: '45%', padding: Spacing.md, borderRadius: BorderRadius.lg, borderWidth: 1 },

  inputBar: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderTopWidth: 1 },
  messageInputWrapper: { flexDirection: 'row', alignItems: 'flex-end', borderRadius: BorderRadius.xxl, borderWidth: 1, paddingHorizontal: Spacing.lg, paddingVertical: Platform.OS === 'ios' ? Spacing.sm : Spacing.xs, minHeight: 48 },
  messageInput: { flex: 1, fontSize: FontSizes.md, maxHeight: 100, paddingVertical: Spacing.sm },
  sendButton: { marginLeft: Spacing.sm, marginBottom: Platform.OS === 'ios' ? 2 : 4 },
  sendGradient: { width: 36, height: 36, borderRadius: BorderRadius.round, justifyContent: 'center', alignItems: 'center' },
});
