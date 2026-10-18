# Oryvona Games Paneli — v21 / Sürüm 3.1

Jarvis komuta sekmesi, beş resmi oyun ve bağlantı kesilmelerine dayanıklı emir teslimi. v20'nin dört hızlı emri, sesli/görsel girişi, kompakt başlığı, ölçülen `--topbar-h` değeri ve oyun hapları korunur.

## Emir teslimi

Canlı sahip hesabının gönderdiği emir, ağ isteğinden önce IndexedDB'ye kaydedilir. Başarı mesajı bu yerel yazma işlemi tamamlandıktan sonra gösterilir. Ağ kopması veya belirsiz cevapta aynı komut UUID'si tekrar kullanılır; sunucudaki mevcut kayıt doğrulanır, üzerine yazılmaz. Tekrarlar geçici hatalarda gecikmeli yapılır; yetki ve kalıcı hatalar açıkça gösterilir. Hesap değişince eski hesabın emirleri görünmez ve gönderilmez.

Emir başına 8 MB, bekleyen kuyrukta 40 MB/100 emir sınırı vardır. Teslim edilmiş kayıtların görsel verisi yerelden çıkarılır; makbuzlar 50 adet/24 saat ile sınırlıdır. Depolama kullanılamıyorsa başarı iddia edilmez ve giriş korunur. Kullanıcı tarayıcı verilerini temizlerse yerel kuyruk silinebilir. Sunucuya henüz ulaşmamış emirler için uygulama yeniden açıldığında/bağlantı geldiğinde ve sahip rolü doğrulandığında teslim devam eder. Mobil işletim sisteminin kapattığı uygulamada sürekli arka plan çalışma garantisi verilmez.

Sunucu tarafından alınmış emirler telefon bağlantısından bağımsız olarak DJ-KABIN runner'ında işlenir. Runner koşullu sahiplenme ve yerel sonuç günlüğü kullanır; cevap kaybolduğunda aynı işlemi yeniden çalıştırmak yerine sonucu uzlaştırır. Yarım kalmış, etkisi belirsiz geliştirme işi `needs_review` ile devredilir.

## Dört hızlı emir

- **Oyunu İlerlet:** Seçili oyun için gerçek Claude görev kuyruğu. CLI kapalıysa yürütülmüş veya tamamlanmış sayılmaz.
- **Paneli Geliştir:** Görev seçili oyunun klasörüne değil sabit panel çalışma köküne gider.
- **Durum Özeti Ver:** Yalnız ilgili oyunun kök durum kartı okunur; model çağrısı yoktur.
- **Test Et & Yayına Al:** Hafif kart kontrolünden sonra gerçek test/yayın işi Claude kuyruğuna kaydedilir. Kart kontrolü build testi veya yapılmış yayın değildir; yayın durumu `NOT_RUN` kalır.

v21 ekstra ücretli Gemini/dış API yolunu kaldırır. Boşta AI çağrısı yapılmaz. Mevcut Claude CLI çalışması açıkça etkinleştirilmemişse görevler oturum kuyruğunda bekler. Görünür pencere, oyun, Unity veya ses başlatılmaz.

## Beş oyun

KOZA, Charm Drop, Forge Run ve AERYO'nun önceki yayın dosyaları korunur. Tupsper beşinci resmi bulut boks projesidir; kontrol edilen yerel konumda ve bağlı hesabın repo metadata'sında kaynak bulunmadığından `SOURCE_PENDING` olarak kayıtlıdır. Doğrulanmış sürüm, oynatıcı, repo veya QA sonucu uydurulmaz.

`data/game-builds.json` önceki sürümlerin tarihli build/QA kayıtlarını ve Tupsper'in kaynak bekleyen durumunu taşır. Oyun paketleri v21 görevinde yeniden incelenmemiştir. KOZA/Charm/AERYO oynatıcı girişleri ve Forge inceleme ekranı korunur; bu sürümde oyun başlatma testi yapılmaz.

## Kota ve disk sınırı

`npm run sync` yalnız `tools/shell-public-files.json` listesindeki küçük uygulama dosyalarını eşitler. `play/`, `node_modules`, `Library`, `Temp`, oyun kaynakları ve build paketleri okunmaz/taranmaz/kopyalanmaz. `public-files.json` içindeki eski oyun yolu kayıtları yalnız provenance olarak korunur.

`npm test` hafif statik kontrol, küçük fixture testleri, kalıcı kuyruk testleri ve izole runner testlerini çalıştırır. Hiçbir gerçek model, oyun, tarayıcı, Unity veya ses başlatmaz. Runtime kart kontrolü yalnız kök `DURUM-KARTI.json` dosyasının en çok 64 KB'ını okur. Eski ağır `artifact_validation` talebi açık nedenle reddedilir.

Service worker uygulama kabuğunu `oryvona-panel-v21` içinde saklar; IndexedDB kuyruğunu ve önceki oyun önbelleğini silmez. Canlı Supabase hesap yanıtlarını önbelleğe almaz. Oyunlar kullanıldıkça mevcut on-demand önbelleğe alınır; tüm paketler önceden indirilmez.

Yayın kökü ve manifest kapsamı `/oryvona-panel/` olarak korunmalıdır. `config.js` yalnız tarayıcıya açık istemci yapılandırmasıdır; özel servis anahtarları yayınlanmamalıdır. Oyun çerçeveleri güvenilen birinci taraf içeriktir, kötü amaçlı üçüncü taraf koduna karşı izolasyon sınırı değildir.
