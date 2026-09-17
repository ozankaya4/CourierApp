# Geliştirme durumu

## Hazır olan uygulama temeli

Web ve mobilde hesap/profil ekranları, restoran/menü yönetimi, sepet, kapıda ödemeli sipariş, kurye işi üstlenme, durum geçişleri ve puanlama uygulanmıştır. Yetkiler PostgreSQL üzerinde uygulanır. Konum gönderim kodu, Realtime aboneliği, harita, webhook ve EAS yapılandırması bulunur.

Yerel doğrulama: TypeScript, PostgreSQL üzerindeki erişim ve iş kuralları, webhook doğrulama testleri, Next.js production derlemesi ve Expo Android/iOS JavaScript paketlemesi. Tarayıcı giriş sayfası masaüstü ve dar ekranda incelenmiştir.

## Bağlantı ve cihazla doğrulanacak işler

- Supabase geliştirme projesi, şema kurulumu, Auth e-posta ve Realtime ayarları.
- Expo/EAS projesi ve ayrı development/preview/production ortamları.
- Android Maps anahtarı, Android Studio emülatörü, fiziksel iPhone kaydı.
- EAS native build, gerçek cihaz oturumu, e-posta doğrulama ve parola sıfırlama.
- Üç farklı kullanıcı arasında gerçek WebSocket güncellemeleri.
- Navigasyon açıkken arka plan GPS, konum izni reddi, zayıf GPS, ağ kopması ve yeniden başlatma.
- Preview OTA alma, runtime uyumsuzluğu ve geri dönüş tatbikatı.
- Gerçek Supabase projesinde Security/Performance Advisors taraması.

JavaScript paketlemesi native EAS build'in başarılı olduğunu kanıtlamaz. Geçici PostgreSQL testleri gerçek Auth sağlayıcısı ve WebSocket servisinin çalıştığını kanıtlamaz. Bu adımlar tamamlanmadan gerçek sipariş alınmamalıdır.

## Ürünleştirme

1. İşletmeci paneli: restoran/kurye doğrulama, başvuru belgeleri, hesap kapatma, sipariş müdahalesi ve denetim kaydı.
2. Adres deneyimi: haritadan pin bırakma, adres arama/doğrulama, kayıtlı adresler, teslimat bölgesi ve mesafe sınırı. Şu an açık adres ve koordinat doğrulaması kullanıcıdan alınır.
3. Menü deneyimi: kategoriler, fotoğraflar, seçenekler, alerjenler, çalışma saatleri, favoriler, arama filtreleri ve puan ortalamaları.
4. Operasyon: sipariş zaman aşımı, kurye işi bırakma/yeniden atama, kapasite, restoran reddi sonrası destek, telefon doğrulama ve kişisel numarayı gizleyen iletişim.
5. Sipariş ve konum bildirimleri: push bildirimleri, cihaz token yönetimi, teslimat bildirimleri ve bağlantı geri kazanımı testleri.
6. Ölçek: katalog ve sipariş sayfalama, konum yazma yük testi, gerektiğinde kişiye/role özel Broadcast kanalları, hız sınırlaması ve webhook kuyruk/retry politikası.
7. Puanlama yönetimi: ortalamaları görüntüleme, inceleme/moderasyon, itiraz ve restoran yanıtı. Puanları kaydetme ve erişim kuralları mevcut.
8. Üretim: hata izleme, yedek/geri yükleme, veri saklama-silme, gizlilik ve kullanım metinleri, erişilebilirlik denetimi, mağaza görselleri ve inceleme hazırlığı.
9. Kart ödemesi: sağlayıcı seçimi, ödeme sonucu webhook'u, iade/iptal, muhasebe ve uzlaştırma. İlk sürüm kapıda ödemedir.

## İlk birlikte yapılacak adım

`docs/KURULUM.md` bölüm 3 ile Supabase geliştirme projesini bağla. Sonra bir restoran, bir müşteri ve bir kurye ile bölüm 9'daki siparişi baştan sona çalıştır. Bu doğrulama tamamlandıktan sonra mağaza ve OTA dağıtımına geç.
