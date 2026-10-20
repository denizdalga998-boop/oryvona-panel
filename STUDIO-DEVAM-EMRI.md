# Studio Flow: adayın tamamlanması

Bu belge bir saha devir kaydıdır. Yeni uygulama kaynakları bu dala henüz yüklenmedi; ZIP teslim edilmedi ve canlı sürüm değiştirilmedi.

## Hedef davranış

Normal Gemini sohbeti komutan olarak kullanılacak. OpenAI Codex, Claude ve Gemini Antigravity geliştirme işçileri olacak. Normal sohbet sessizce kod işçisine yönlendirilmeyecek. Projeler ve sağlayıcı/rol oturumları ayrı tutulacak. Son başarılı düzenleyen işçi tercih edilecek; inceleme başka sağlayıcıya verilecek. Gerçek oyun testi, paketleme ve telefonda indirme doğrulaması tamamlanmadan “Test et” gösterilmeyecek.

## Saha uygulayıcısının tek görevi

Önce yerel çalışma alanında hazırlanan Studio Flow adayını bul ve varlığını doğrula. Beklenen belgeler README.md, SAHA-KURULUMU.md ve DURUM-VE-SINIRLAR.md; betikler APPLY-STUDIO.ps1, build-manifest.cjs ve qa/run-offline.ps1. Aday kaynaklar candidate/ altında, deneysel Gemini köprüsü browser-bridge/ altındadır. Klasör yoksa aday kaynakları mevcutmuş gibi kurma; eksik teslimi bildir.

1. Aday belgelerini ve kurulum betiğini oku. Canlı dosyalara yazmadan son birleşik çevrimdışı testi tamamla. En son eklenen native-context → native-actions → runner bağlantısını ayrıca doğrula. Fixture sonuçlarını gerçek sağlayıcı veya telefon kabulü olarak sunma.
2. Gerçek dosya tabanına karşı manifest üret ve salt okunur VerifyOnly ön kontrolünü çalıştır. Dosya/hash kaymasını zorlama. Önceki CEO paketi uygulanmış varsayılmayacak.
3. Aday kaynaklar, köprü, belgeler, testler, manifest, kurulum/geri alma betiği ve gerçek kabul kaydıyla ORYVONA-STUDYO-ADAY-20261020.zip oluştur. Hesap oturumu, anahtar, cookie, özel config veya runtime veritabanı paketleme.
4. Kaynakları ayrı aday dala gönder ve taslak PR aç. Main'e otomatik birleştirme yapma. Mevcut erkek ses denemesi ve ses iptal el sıkışmasını koru; sabit ses örneğini dinamik sohbet sesi olarak tanıtma.
5. Yerel kurulum mevcut yetkili bakım akışıyla yapılmalı; çalışan işçiler varken dosya değiştirilmemeli. İzin denetimi bir işlemi reddederse başka yoldan aşılmayacak.
6. Native Gemini için gerçek oturum, görünür model, DOM uyumu ve sağlayıcı şartlarını doğrula. Önce gözetimli bir tur, sonra süreli telefon aktarımı kabulü yap. Resmî model kimliği doğrulanmadığında model_verified:false kalmalı.
7. Her işçinin gerçek abonelik girişi ve proje sınırı doğrulanmalı. Codex host sınır testi tamamlanmadan hazır sayılmamalı. Google için ayrı güvenli proje politikası ve abonelik kanıtı gerekir; ortak kullanıcı ayarlarını bozarak izolasyon elde edilmiş sayma.
8. Yetkili oyun testi/derleme hostlarını bağla. Aynı aday commit, bağımsız inceleme, gerçek test, paket SHA-256 ve byte boyu doğrulanmalı. Telefonda bir gerçek görev uçtan uca kabul edilmeden yayın yapma.
9. Kabul edilmiş adayın kanonik kaynak sürümüne aktarımını açıkça yönet; sonraki görev eski kaynak üstünden başlamamalı. Kapalı beta oyunlarının ilerlemesini koru.

## Tamamlanmamış kabul kapıları

- Native Gemini aktarımı deneysel; gerçek DOM ve telefon kabulü yapılmadı.
- Codex gerçek host sınır kanıtı doğrulanmadı.
- Google işçisi aktif değil: GOOGLE_PROJECT_POLICY_AND_SUBSCRIPTION_PROOF_REQUIRED. Güvenli izole politika, gerçek abonelik girişi ve yalnız izinli araçların açıldığını gösteren başlangıç kanıtı gerekiyor.
- Gerçek oyun testi, build ve doğrulanmış telefon teslim hostları bağlı değil.
- Kanonik kaynağa otomatik birleştirme uygulanmadı.
- Aday kurulmadı; “üç işçi bağlı” veya “oyun hazır” denemez.

## Elde edilen doğrulama

Sayılar örtüşür; toplanarak tek toplam yapılmaz.

| Kontrol | Sonuç |
| --- | --- |
| Önceki birleşik backend | 179/179 |
| Önceki birleşik frontend | 70/70 |
| Son engine/ingress/bağımsız seam koşusu | 76/76 |
| Son ses/flow UI koşusu | 84/84 |
| Native-context bağımsız fixture koşusu | 10/10 |
| Statik shell | 126 kontrol PASS |
| Kurulum betiği | Parse ve izole guard/manifest kontrolleri PASS |
| Son birleşik koşu ve son context wiring | Yeniden doğrulanmalı |
| Gerçek model/oyun/telefon kabulü | Yapılmadı |

Son paketleme çalışma ortamındaki dosya erişimi hatası nedeniyle tamamlanamadı. Aday dosyaların kalıcılığı, son test sonucu ve ZIP varlığı yeniden doğrulanmalı. Bu belgenin GitHub'da bulunması eksik kod tesliminin tamamlandığı anlamına gelmez.

Deniz'e terminal komutu veya ZIP taşıtma. Saha işçisi bu sırayı tamamlasın; yalnız gerçek hesap girişi ve telefon kabulü gerektiğinde kısa, somut yardım istesin.
