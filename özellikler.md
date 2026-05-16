# EduAssistant: Teknik Detaylar ve Uygulama Mimarisi

Bu belge, **EduAssistant** platformunun mimari yapısını, uçtan uca işleyişini (workflow) ve uygulamadaki tüm fonksiyonel alanları detaylı bir şekilde açıklamaktadır.

---

## 1. Mimari Yapı ve Teknoloji Yığını

EduAssistant, modern bir **Hibrit Monolit** mimariye sahiptir. Düşük gecikme süresi ve yüksek ölçeklenebilirlik için tasarlanmıştır.

### A. Teknoloji Katmanları
-   **Frontend:** Vanilla JavaScript (ES6+), HTML5. Tasarımda Tailwind CSS (düzen) ve özel Vanilla CSS (premium efektler) bir arada kullanılmıştır.
-   **Backend:** Node.js (Express framework). API yönetimi ve harici servis entegrasyonlarını sağlar.

### B. Backend Özet Çıkarma Süreci (Detaylı)
Platformun "Zeka" katmanı, Node.js ve Python'ın hibrit çalışmasıyla en doğru analizi üretir:

1.  **Transkript Yakalama (`yt-dlp`):** Kullanıcı URL gönderdiğinde, backend `yt-dlp` motoru ile videonun en kaliteli altyazı (VTT/SRT) dosyasını çeker.
2.  **Akıllı Temizleme:** Ham altyazı verisi HTML etiketlerinden arındırılır. Zaman damgaları `[05:20]` formatına çevrilerek AI'nın bağlamı (context) zaman ekseninde takip etmesi sağlanır.
3.  **Dinamik Prompt Yapılandırma:** Kullanıcının seçtiği mod (Sayısal/Sözel) ve uzunluk tercihlerine göre AI'ya özel talimatlar gönderilir. Sayısal modda formül çıkarma ve adım adım işlem akışı (Process Flow) zorunlu tutulur.
4.  **AI Analizi (Gemini 2.5 Flash):** Temizlenmiş veri OpenRouter üzerinden Google'ın en hızlı ve yetenekli modellerinden biri olan Gemini 2.5 Flash'a aktarılır.
5.  **JSON Onarma (Self-Healing):** AI'dan gelen ham metin, backend seviyesinde regex algoritmalarıyla taranır; eksik parantezler veya hatalı tırnaklar düzeltilerek frontend'e %100 geçerli bir JSON objesi sunulur.

-   **Video Motoru:** Python tabanlı `yt-dlp` aracı. YouTube ve diğer platformlardan yüksek başarı oranıyla transkript çeker.
-   **AI Katmanı:** OpenRouter API aracılığıyla **Google Gemini 2.0/2.5 Flash** modellerini kullanır. Hız ve maliyet dengesi için optimize edilmiştir.
-   **Veri Yönetimi:** Kullanıcı bazlı `localStorage` izolasyonu ve backend seviyesinde geçici önbellekleme (caching).

---

## 2. Uçtan Uca İşleyiş (Workflow)

Bir video analiz süreci şu adımlardan geçer:

1.  **Giriş ve Parametrelendirme:** Kullanıcı URL'yi girer; ders türünü (Sayısal/Sözel), özet uzunluğunu ve soru zorluğunu belirler.
2.  **Veri Çekme (Ingestion):** Backend, `yt-dlp` kullanarak videonun transkriptini çeker. Tr/En dilleri ve otomatik altyazılar taranır.
3.  **Ön İşleme (Cleaning):** Altyazıdaki zaman damgaları `[MM:SS]` formatına dönüştürülür ve AI'nın bağlamı anlaması için temizlenir.
4.  **AI Analizi (Multi-Phase):**
    *   **Özetleme:** Konu başlıkları, özet bölümleri ve kavramlar üretilir.
    *   **STEM Analizi:** Sayısal derslerde formüller ve işlem adımları ayrıştırılır.
    *   **Quiz Üretimi:** İçeriğe dayalı, zaman referanslı ve açıklamalı sorular oluşturulur.
5.  **Görselleştirme:** Üretilen JSON verisi, önyüzde dinamik infografiklere ve etkileşimli kartlara dönüştürülür.
6.  **Arşivleme:** Analiz, kullanıcının kütüphanesine kaydedilir ve kişiselleştirilmiş tavsiye motoruna veri sağlar.

---

## 3. Uygulama Alanları ve Fonksiyonlar

### A. Karşılama ve Tanıtım (index.html)
Uygulamanın vitrinidir. Modern "glassmorphism" tasarımıyla özelliklerin tanıtımı, kullanım rehberi ve fiyatlandırma tablolarını içerir. Kullanıcıyı sisteme dahil eden ana giriş noktasıdır.

### B. Kimlik Doğrulama (giris.html)
Kullanıcı kayıt ve giriş işlemlerinin yapıldığı alandır. Güvenli veri izolasyonu için kullanıcı e-posta adresi üzerinden benzersiz bir anahtar (key) oluşturur.

### C. Analiz Paneli - Yeni İşlem (islem.html)
Uygulamanın kalbidir. 
-   **Giriş Alanı:** Video URL'si ve opsiyonel başlık girişi.
-   **Mod Seçimi:** Sözel/Sayısal mod geçişi (STEM desteği).
-   **Sonuç Ekranı:** Yapay zeka tarafından üretilen hiyerarşik özetler, infografik posterler, kavram kartları ve "Biliyor muydunuz?" bölümleri.
-   **İnteraktif Sınav:** Kullanıcının bilgisini ölçen, anlık geri bildirim veren sınav modülü.
-   **Chatbot:** Video içeriği hakkında doğrudan soru sorulabilen AI asistanı.

### D. Kütüphane ve Geçmiş (code.html)
Kullanıcının tüm geçmiş analizlerinin saklandığı yönetim merkezidir.
-   **Arama ve Filtreleme:** Başlık veya URL üzerinden hızlı erişim.
-   **YouTube Entegrasyonu:** "Daha Sonra İzle" listesindeki videoların toplu veya tekli aktarımı.
-   **Tavsiye Motoru:** Geçmiş analizlerden öğrenilen ilgi alanlarına göre yapay zekanın önerdiği yeni eğitim videoları.
-   **Detay Görüntüleme:** Eski analizlere tam içerik, sınavlar ve infografiklerle tekrar erişim.

### E. Üyelik Yönetimi (uyelik.html)
Kullanıcının plan durumunu (Ücretsiz/Pro) yönettiği bölümdür. 
-   **Plan Karşılaştırması:** Özellik limitlerinin (özet sayısı, PDF dışa aktarma vb.) detaylı tablosu.
-   **Abonelik Kontrolü:** Aylık/Yıllık geçişleri ve aktif plan bitiş takibi.

### D. Akıllı Öneri Sistemi (AI Smart Pick)
Kullanıcının kütüphanesindeki verilerden öğrenen ve ilgi alanlarına göre yeni içerikler sunan bir mekanizmadır:

-   **Ağırlıklı İlgi Analizi:** Geçmiş analizlerdeki kavramlar (6 puan), alt başlıklar (1.5 puan) ve başlıklar (1 puan) üzerinden bir ilgi haritası çıkarılır.
-   **Kullanıcı Geri Bildirimi:** Önerilen bir kartın beğenilmesi (Like) konunun ağırlığını +8 artırırken, beğenilmemesi (Dislike) -15 puan düşürerek algoritmanın anlık olarak eğitilmesini sağlar.
-   **Dinamik Şablonlama:** Belirlenen anahtar kelimeler; "İleri Seviye", "Pratik Uygulamalar", "Strateji ve Modelleme" gibi akademik şablonlarla birleştirilerek kişiselleştirilmiş başlıklar üretilir.
-   **YouTube Köprüsü:** Üretilen her öneri, tek tıkla YouTube üzerindeki en güncel eğitim videolarına yönlendirir.

---

## 4. Teknik Detaylar ve Güvenlik

-   **Hata Onarma (Self-Healing):** AI yanıtlarındaki bozuk JSON yapılarını backend ve frontend seviyesinde onaran regex tabanlı algoritmalar.
-   **Veri İzolasyonu:** Her kullanıcının verisi `edua_{email}_{key}` şemasıyla birbirinden tamamen ayrılmıştır.
-   **PDF Export:** Dinamik olarak oluşturulan premium HTML şablonları üzerinden vektörel ve yüksek çözünürlüklü ders notu üretimi.
-   **Responsive Tasarım:** Tüm sayfalar mobil, tablet ve masaüstü cihazlar için tam uyumludur.

---
*Bu belge, uygulamanın teknik kapasitesini ve kullanıcı deneyimi akışını sunum dosyalarına veri sağlamak amacıyla hazırlanmıştır.*
