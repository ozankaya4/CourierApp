# Courier

Müşteri, restoran ve kurye profilleriyle yemek siparişi ve teslimat uygulaması.

Next.js web uygulaması ve Expo mobil uygulaması aynı TypeScript tiplerini ve Supabase veritabanını kullanır. Tek e-posta ile her hesap türünden bir profil oluşturulur. İlk sürümde ödeme kapıda yapılır.

## Başlangıç

```powershell
npm.cmd ci
npm.cmd run dev:web
```

Web: `http://localhost:3000`. Tam bağlantı ve telefon kurulumu için [adım adım kurulum rehberini](docs/KURULUM.md) izle. Bağlantı bilgileri girilmeden kayıt/giriş kapalıdır.

## Geliştirme sürümünün kapsamı

- E-posta/şifre girişi, doğrulama, şifre sıfırlama ve üç ayrı rol profili.
- Restoran ve kurye için işletmeci onayı.
- Restoran bilgileri, menü, fiyat, satış durumu ve minimum sipariş.
- Restoran arama, tek restoran sepeti ve kapıda ödemeli sipariş.
- Restoran onayı, hazırlama, kurye ataması, teslim alma ve teslim etme.
- Yetkili kurye konum gönderimi, gerçek zamanlı güncelleme aboneliği ve harita.
- Restoran için teslim almaya kadar kurye takibi; müşteri adresi yalnızca teslimat sırasında atanmış kuryeye açılır.
- Sipariş başına restoran, servis, kurye ve her yemek için ayrı puan.
- İmzalı ve tekrarlı olaylara dayanıklı teslimat webhook'u.
- EAS development/preview/production profilleri ve fingerprint tabanlı OTA yapılandırması.

Bu sürüm geliştirme içindir. Supabase/EAS projeleri, harita anahtarı ve cihaz dağıtımı dış kurulum gerektirir. Production hazırlığı ve sonraki işler [yol haritasında](docs/YOL_HARITASI.md), yetki sınırları [mimari belgesinde](docs/MIMARI.md) açıklanır.

## Proje yapısı

```text
apps/web             Next.js arayüz ve webhook
apps/mobile          Expo uygulaması, GPS, EAS
packages/core        Ortak tipler ve kurallar
packages/client      Ortak Supabase bağlantı katmanı
supabase/migrations  PostgreSQL şema ve yetkiler
tests                İş kuralları ve webhook testleri
docs                 Kurulum, mimari ve yol haritası
```

## Kontroller

```powershell
npm.cmd run check
```

Testler geçici bir PostgreSQL motorunda çalışır; Docker veya gerçek hesap gerektirmez. Supabase Auth/Realtime servisi ve fiziksel cihaz testinin yerini tutmaz.

```powershell
npm.cmd run dev:mobile
```

Mobil uygulama arka plan konumu için Expo development build ister. Kurulum rehberindeki EAS adımlarından sonra kullanılmalıdır.
