# İlk kurulum

Bu rehber Windows, fiziksel iPhone ve Android emülatörü içindir. Komutları PowerShell'de çalıştır. `npm.cmd` kullanımı, PowerShell'in script çalıştırma ayarını değiştirmene gerek bırakmaz.

## 1. Kullandığımız araçlar

| Araç                | Bu projedeki görevi                                                           |
| ------------------- | ----------------------------------------------------------------------------- |
| Node.js             | Geliştirme araçlarını bilgisayarında çalıştırır. En az 22.13 gerekir.         |
| npm                 | Kütüphaneleri `package-lock.json` içindeki sabit sürümlerle kurar.            |
| React               | Ekranları bileşenler halinde yazmamızı sağlar.                                |
| Next.js             | Tarayıcıdaki uygulamayı ve webhook sunucu adresini çalıştırır.                |
| Expo / React Native | Android ve iPhone uygulamasını aynı koddan üretir.                            |
| EAS Build           | Mobil uygulamayı bulutta derler ve kurulabilir dosya üretir.                  |
| EAS Update          | Uyumlu mevcut mobil sürümlere kod ve içerik güncellemesi gönderir.            |
| Supabase            | Giriş, kullanıcılar, PostgreSQL veritabanı ve gerçek zamanlı bağlantı sağlar. |

Depoyu hazırlarken bu bilgisayarda Node.js 22.17.0 ve Git zaten kuruluydu. Yeniden indirmen gerekmiyor. Başka bilgisayarda [Node.js](https://nodejs.org/en/download) ve [Git](https://git-scm.com/downloads) kur.

## 2. Web ekranını aç

Proje kökünde:

```powershell
npm.cmd ci
npm.cmd run dev:web
```

Tarayıcıda `http://localhost:3000` aç. Durdurmak için terminalde `Ctrl+C` kullan.

Veritabanı bilgileri henüz girilmediyse giriş ekranı açılır ama kayıt/giriş düğmeleri devre dışı kalır. Bu beklenen durumdur; uygulama sahte hesap ya da sipariş üretmez.

## 3. Supabase'i bağla

1. [Supabase Dashboard](https://supabase.com/dashboard) üzerinde hesabını aç ve bu uygulama için yeni bir geliştirme projesi oluştur.
2. Veritabanı şifresini parola yöneticinde sakla. Bu şifreyi uygulama koduna veya sohbete yapıştırma.
3. Projenin **Connect** bölümünden Project URL ve **publishable key** değerlerini al.
4. Proje kökünde örnek dosyaları kopyala:

```powershell
Copy-Item apps/web/.env.example apps/web/.env.local
Copy-Item apps/mobile/.env.example apps/mobile/.env
```

Web dosyasına `NEXT_PUBLIC_SUPABASE_URL` ve `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; mobil dosyasına `EXPO_PUBLIC_SUPABASE_URL` ve `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` değerlerini gir. Aynı geliştirme projesini kullan.

Publishable anahtarın istemcide bulunması normaldir; erişimi veritabanı denetler. **Secret/service-role anahtarını `NEXT_PUBLIC_` veya `EXPO_PUBLIC_` değişkenlerine koyma.** Webhook kullanılmıyorsa sunucuya ait iki alanı boş bırakabilirsin.

5. Supabase **SQL Editor** içinde `supabase/migrations/20260917141109_initial_delivery.sql` dosyasının tamamını bir kez çalıştır. Bu, yalnızca yeni proje içindir. Aynı şemayı tekrar çalıştırma.
6. **API Settings** altında exposed schemas listesine `private` ekleme. İşlemler yalnızca `public.app` üzerinden yapılır.
7. **Authentication → URL Configuration** altında Site URL'yi `http://localhost:3000` yap. Redirect URLs listesine `http://localhost:3000` ve `http://127.0.0.1:3000` ekle. Yayında bunları gerçek HTTPS web adresinle değiştir.
8. E-posta doğrulamayı açık tut; minimum şifre uzunluğunu en az 8 olarak ayarla. Gerçek kullanıcılarla testten önce kendi SMTP göndericini bağla; geliştirme e-posta hizmeti sınırlıdır.
9. Migration `order_events` tablosunu Realtime yayınına ekler. Dashboard'da bu tablonun Realtime için etkin olduğunu kontrol et.
10. Web geliştirme sunucusunu durdurup yeniden başlat. Bir hesap oluştur, e-postadaki bağlantıyı aç, giriş yap ve müşteri profilini oluştur.

CLI ile sürüm takibi kullanacağımızda önce `npx.cmd supabase login` ve `npx.cmd supabase link --help` ile bağlantı adımlarına geçeriz. SQL Editor yöntemiyle uygulanmış başlangıç migration'ını CLI geçmişiyle eşleştirmeden tekrar `db push` yapma. Sonraki şema değişiklikleri ayrı migration dosyaları olmalı.

## 4. Restoran ve kurye profilini onayla

Tek e-posta ve tek şifreyle giriş yaptıktan sonra **Başka bir hesap türü ekle** bölümünden diğer profilleri oluşturabilirsin. Her tür yalnızca bir kez oluşturulur. Müşteri profili hemen açılır; restoran ve kurye profilleri işletmeci onayı bekler.

İlk geliştirme testinde Supabase SQL Editor içinde gerçek test e-postanı kullanarak:

```sql
select p.id, u.email, p.role, p.approved
from private.profiles p
join auth.users u on u.id = p.user_id
where lower(u.email) = lower('test-epostan@example.com');
```

Doğru kişiyi ve profili gördükten sonra, yalnızca onaylamak istediğin profilin UUID değerini kullan:

```sql
update private.profiles
set approved = true
where id = 'onaylanacak-profilin-uuid-degeri'
  and role in ('restaurant', 'courier');
```

Ekranda **Onay durumunu kontrol et** düğmesine bas. Bu SQL yönetici işlemidir; uygulama kullanıcılarının çalıştırma yetkisi yoktur. Canlıya çıkmadan önce onay ve destek paneli eklenecek.

Restoran rolünde önce restoranın gerçek konumunu ve teslimat ücretini kaydet, sonra menüye yemek ekle ve siparişe aç. Müşteri rolünde bu restoran görünecek.

## 5. Android emülatörü

1. [Android Studio](https://developer.android.com/studio) indir. Kurulumda Android SDK, Android Emulator ve Platform Tools bileşenlerini seç.
2. Android Studio içindeki **Device Manager → Create device** yolundan bir Pixel cihazı ve güncel, Google Play destekli sistem imajı oluştur.
3. Emülatörü aç. EAS ile APK üreteceğimiz için yerel Gradle derlemesi kurmak zorunda değilsin.
4. Gerekirse SDK klasörünü `ANDROID_HOME` olarak ayarla. Windows'ta genellikle `%LOCALAPPDATA%\Android\Sdk` altındadır; kendi kurulum yolunu Android Studio'da doğrula. `platform-tools` klasörünü PATH'e ekle.
5. [Google Cloud Console](https://console.cloud.google.com/) içinde Maps SDK for Android'i etkinleştir ve Android uygulamasına kısıtlı anahtar oluştur. `apps/mobile/.env` içindeki `GOOGLE_MAPS_ANDROID_API_KEY` alanına gir. Paket adı şu an `com.courier.delivery`; SHA-1 değerini EAS geliştirme sertifikasından al. Mağaza sürümü için ayrı sertifika kısıtı gerekir.

Android harita anahtarı olmadan uygulama derlenebilir, ancak harita düzgün çalışmaz. iOS'ta varsayılan Apple Maps kullanılıyor.

## 6. Expo ve EAS hesabı

[Expo](https://expo.dev/signup) hesabını oluştur. Mobil klasöre geç:

```powershell
cd apps/mobile
npx.cmd eas-cli@latest login
npx.cmd eas-cli@latest init
```

EAS proje ID'sini `.env` dosyasındaki `EAS_PROJECT_ID` alanına kaydet. `app.config.ts` dinamik bir dosya olduğu için CLI ayarı otomatik yazamazsa bu alanı elle doldur. ID, Expo projesinin Settings bölümünde de bulunur.

İlk bulut derlemeden önce Expo dashboard'daki **Environment variables** bölümüne ilgili `development`, `preview` ve `production` ortamları için gereken değerleri ekle:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `EXPO_PUBLIC_WEB_URL`: telefondan açılabilen web adresi. Telefonda `localhost` bilgisayarını göstermez.
- `EAS_PROJECT_ID`
- `GOOGLE_MAPS_ANDROID_API_KEY`

Public değişkenler mobil paketin içine girer. `.env` dosyası Git'e ve build yüklemesine dahil olmadığından bulut ortamlarını ayrıca ayarlamak gerekir.

EAS bağlantısını doğrula:

```powershell
npx.cmd expo config --type public
```

Çıktıda doğru proje ID'sini ve `updates.url` değerini görmelisin. ID yoksa OTA bilinçli olarak devre dışıdır. İlk build öncesi `com.courier.delivery` paket adını kendi kalıcı, benzersiz kimliğinle değiştirebilirsin.

## 7. Android geliştirme uygulaması

`apps/mobile` klasöründe:

```powershell
npx.cmd eas-cli@latest build --platform android --profile development
```

Build tamamlanınca indirilen APK'yı açık emülatöre sürükleyip bırak. Ardından proje kökünde:

```powershell
npm.cmd run dev:mobile
```

Emülatörde kurduğun **Courier** geliştirme uygulamasını aç. Expo terminalinde `a` tuşuyla Android'i de açabilirsin. Emülatörün Extended Controls → Location bölümünden konum veya rota gönder. Gerçek hareket ve pil davranışı için ayrıca fiziksel Android testi gerekir.

## 8. Fiziksel iPhone

Windows'ta iOS Simulator çalışmaz. iPhone derlemesini EAS'in macOS makineleri oluşturur; uygulamayı fiziksel iPhone'una kurarsın. EAS ile bu cihaz dağıtımı için Apple Developer üyeliği ve cihaz kaydı gerekir.

`apps/mobile` klasöründe:

```powershell
npx.cmd eas-cli@latest device:create
npx.cmd eas-cli@latest build --platform ios --profile development
```

CLI'nin verdiği cihaz kayıt bağlantısını iPhone'da aç ve yönergeleri izle. Build tamamlandıktan sonra Expo kurulum bağlantısını aç. iOS isterse Ayarlar → Gizlilik ve Güvenlik → Geliştirici Modu'nu etkinleştir.

Telefon ve bilgisayar aynı Wi-Fi'dayken `npm.cmd run dev:mobile` komutunun QR kodunu tara. Ağ bağlantısı kurulamıyorsa yerel ağ izinlerini ve Windows güvenlik duvarını kontrol et.

**Expo Go tam kurye testi için yeterli değildir.** Arka plan konumu için yukarıdaki development build gerekir. Müşteriden yalnızca adres seçerken ön plan konum izni istenir; kurye aktif teslimatta arka plan izni verir.

## 9. Siparişi baştan sona dene

1. Tercihen üç ayrı test e-postası kullan: müşteri, restoran, kurye. Böylece kişilerin birbirlerinin verisini göremediğini gerçekten deneyebilirsin. Tek e-postadaki profil geçişini ayrıca test et.
2. Restoranı ve menüsünü kaydet; siparişe aç.
3. Müşteri: yemek ekle, açık adresini yaz, teslimat koordinatını doğrula, kapıda ödemeyle sipariş ver.
4. Restoran: kabul et → hazırlamaya başla → kurye için hazır. Müşteri adresi hiçbir aşamada görünmemeli.
5. Kurye: teslimatı üstlen. Bu aşamada yalnızca restoran hedefi görünür. Konum paylaşımını başlat; müşteri ve restoran haritasındaki hareketi kontrol et.
6. Kurye: **Yemeği teslim aldım**. Sunucu onayından sonra müşteri hedefi açılır ve navigasyon başlatılır. Restoran için canlı kurye konumu kapanır; müşterinin takibi devam eder. Navigasyon başka uygulamada açıkken konum paylaşımını kontrol et.
7. Kurye: teslim et ve kapıda ödemeyi al; **Müşteriye teslim ettim** ile tamamla. Konum gönderimi ve müşteri adresine kurye erişimi kapanmalı.
8. Müşteri: her yemek, restoran, servis ve kurye için ayrı 1–5 puan ver. Aynı sipariş ikinci kez puanlanamamalı.
9. İnterneti kes, konum iznini kaldır, uygulamayı arka plana al ve yeniden aç. Güncel olmayan konum “güncel” olarak gösterilmemeli. Force-stop sonrasında kesintisiz konum garanti edilmez.

## 10. OTA güncellemesi

OTA, telefondaki uygulama ile uyumlu JavaScript ve içerik değişikliklerini dağıtır. Yeni native kütüphane, izin, SDK veya native ayar için **yeni EAS Build** gerekir. `fingerprint` politikası native uyumluluğu ayırır.

Önce `preview` profiliyle uygulama üretip telefona kur:

```powershell
npx.cmd eas-cli@latest build --platform android --profile preview
npx.cmd eas-cli@latest build --platform ios --profile preview
```

Uyumlu değişikliği yalnızca test kanalına gönder:

```powershell
npx.cmd eas-cli@latest update --channel preview --environment preview --message "Sipariş ekranı iyileştirmeleri"
```

Gerçek cihazda doğruladıktan sonra production ortamına geçilir. Geliştirme sırasında Metro'dan aldığın değişiklik ile EAS Update aynı şey değildir. Aktif teslimat sırasında zorla uygulama yeniden yüklemesi yapılmaz; güncelleme sonraki açılışlarda devreye girer.

## 11. Kontroller ve klasörler

Proje kökünde:

```powershell
npm.cmd run check
```

Bu komut TypeScript kontrolü, PostgreSQL iş kuralları testleri, webhook imza testleri ve Next.js production derlemesini çalıştırır. Test veritabanı geçicidir; gerçek Supabase projesini değiştirmez.

- `apps/web/src/components/dashboard.tsx`: web ekranları.
- `apps/mobile/src/App.tsx`: mobil ekranlar.
- `apps/mobile/src/tracking.ts`: arka plan konumu.
- `packages/core`: iki uygulamanın ortak tipleri ve kuralları.
- `packages/client`: ortak oturum ve veri bağlantısı.
- `supabase/migrations`: sunucunun uyguladığı yetki ve iş kuralları.

## Resmî kaynaklar

- [Next.js kurulum](https://nextjs.org/docs/app/getting-started/installation)
- [Expo monorepo](https://docs.expo.dev/guides/monorepos/)
- [Expo Location ve arka plan sınırları](https://docs.expo.dev/versions/latest/sdk/location/)
- [İlk EAS Build](https://docs.expo.dev/build/setup/)
- [iOS cihaz dağıtımı](https://docs.expo.dev/build/internal-distribution/)
- [EAS Update](https://docs.expo.dev/eas-update/getting-started/)
- [OTA runtime uyumluluğu](https://docs.expo.dev/eas-update/runtime-versions/)
- [Supabase React Native Auth](https://supabase.com/docs/guides/auth/quickstarts/react-native)
- [Supabase Realtime yetkilendirmesi](https://supabase.com/docs/guides/realtime/authorization)
