# Oryvona Games Paneli

v19 mobil stüdyo paneli: oyun seçici, dinamik başlık, TR/EN arayüzü, sahip hesabıyla komut gönderimi ve gerçek oyun sürümlerini inceleme ekranı.

## Yayın yapısı

Bu klasör GitHub Pages yayın köküdür. `index.html`, `config.js`, `native-shell.*`, `game-lab.*`, `sw.js`, `manifest.json`, `vendor/`, `data/`, `play/`, ikonlar ve `.nojekyll` birlikte korunmalıdır. Manifest ve kurulum kapsamı `/oryvona-panel/` yoluna ayarlıdır; başka bir alt yola taşınırsa bu ayarlar da güncellenmelidir.

`data/game-builds.json` gerçek kaynak ve paket dosyalarının sürüm, boyut, SHA-256 ve tarihli kabul kayıtlarını taşır. Kaynak snapshot'ı kopyalanmıştır; asıl oyun projeleri bu panel değişikliğiyle düzenlenmemiştir.

| Oyun | Paneldeki giriş | Durum |
|---|---|---|
| KOZA | `play/koza/k01.html?panel=1` | K01 pilotu; zorunlu QA kabulü tamamlanmadı. |
| Charm Drop | `play/charm-drop/index.html` | C21 müşteri görünürlüğü düzeltmesi kabul edildi. C22 hazırlanmış görevdir; oynanabilir sürüme uygulanmadı. |
| AERYO | `play/aeryo/index.html` | Gerçek 1.2.0 web oyuncusu; Android sürüm kodu 10004. Fiziksel telefon testi bekliyor. |
| Forge Run | Web oynatıcısı yok | 0.9.43 / FR25J Android test paketinin sürüm, sahne ve QA kayıtları gösterilir. |

Forge Run APK'sı yayın dosyalarında bulunmaz. Dosya standart GitHub dosya sınırını aşar ve Android test APK'sıdır; bir web sürümü gibi gösterilmez. AERYO Android APK/AAB dosyaları da bu web yayınına eklenmemiştir.

## Oynatma ve çevrimdışı kullanım

Oyun ancak kullanıcı oynatma düğmesine bastığında aynı uygulama içindeki çerçeveye yüklenir. Panel düğmesi veya cihazın Geri eylemi oynatıcıyı kapatır; çerçeve kaldırılır. Oyunun kendi kayıtları tarayıcının yerel depolamasını kullanır. Tarayıcı verilerini temizlemek bu kayıtları silebilir.

KOZA'nın güncel K01 girişi kendi kayıt alanını ve mevcut çevrimdışı bulut uyarlamasını kullanır. Kopyalanmış eski `cloud.js` dosyasına eklenen `panel=1` koruması, eski giriş kullanıldığında da bulut API isteği, kuyruk veya yoklama başlatmaz. Oynanış kodu değiştirilmemiştir. Başka bir sunucu API'sine sahte başarılı bulut sonucu gönderilmez.

Service worker uygulama kabuğunu önbelleğe alır. Oyun dosyaları yalnızca kullanılırken alınır; önceden açılmamış oyun veya varlıkların çevrimdışı hazır olduğu iddia edilmez. Depolama kotası ve tarayıcının önbelleği boşaltması çevrimdışı kullanılabilirliği etkileyebilir. Supabase gibi başka kaynaklardan gelen canlı hesap verileri bu service worker tarafından önbelleğe alınmaz.

Oyunlar güvenilen birinci taraf içeriktir ve yerel kayıtlar için panel ile aynı kaynakta çalışır. Çerçevenin tam ekran izni kapalıdır; bu yapı, kötü amaçlı üçüncü taraf koduna karşı ayrı bir güvenlik sınırı olarak kullanılmamalıdır.

## Canlı hesap ve doğrulama

Canlı durum ve komut gönderimi için Ayarlar'dan sahip hesabıyla giriş gerekir. Demo verileri canlı runner sonucu değildir. Mevcut Supabase bağlantısı, kimlik doğrulama ve komut API sözleşmeleri korunmuştur; `config.js` yalnızca tarayıcıya açık istemci yapılandırmasını içerir. Service-role veya özel sunucu anahtarı yayın dosyalarına konmamalıdır.

“Sessiz doğrulama”, yetkili runner'a mevcut dosya ve paket bütünlüğünü kontrol etmesi için komut gönderir. Bu işlem oyun, ses veya görünür pencere başlatmamalıdır. Sonuç bir dosya/sürüm doğrulamasıdır; oynanış, görsel kalite, dokunmatik, dinleme veya fiziksel telefon kabulü yerine geçmez.

## Kanıt sınırları

QA satırları ilgili sürümde kaydedilen sonuçlardır. Panelin yeniden yayınlanması bu testlerin yeniden çalıştırıldığı anlamına gelmez. KOZA'nın Koru/dokunmatik kabulü, Charm Drop'un tam ürün ve son kullanıcı kabulü, AERYO'nun telefon testi ve Forge Run'ın açık QA maddeleri ilgili kayıtlarda ayrı gösterilir. Bilinmeyen veya çalıştırılmamış kontroller başarılı sayılmaz.

Kaynak çalışma paketindeki `tools/check-public.cjs`, bağımlılıksız bir statik yayın kontrolüdür: dosya varlığı, JavaScript sözdizimi, kaynak hash'leri, boyut sınırı ve tanınan gizli anahtar biçimlerini denetler. Oyunları veya tarayıcıyı çalıştırmaz. Bu kontrol bütün olası sırları, çalışma zamanı davranışını veya cihaz uyumluluğunu kanıtlamaz.
