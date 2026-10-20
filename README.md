# ORYVONA STUDIO — 3.6.6-STUDIO2

Argon/Jarvis günlük sohbeti Google AI Studio API üzerinden yürütür. Metin ve TTS istekleri anahtar telefona verilmeden yerel runner üzerinden gider. Canlı ses, kısa ömürlü ve tek kullanımlı oturum anahtarı ile telefondan Google Live API'ye bağlanır. Codex ve Claude günlük sohbetin yedeği değildir. Boşta model çağrısı yapılmaz.

Metin modeli `gemini-3.8-flash`, yalnız 503/yoğunluk durumunda yedeği `gemini-3.6-flash`; canlı model `gemini-3.8-live-extended-thinking` ve HIGH düşünmedir. Asenkron araç NON_BLOCKING kullanır; turnComplete sonrasında interaction_status dinlenmeye devam eder. TTS `gemini-3.8-flash-tts` ve uygun hatada `gemini-3.1-flash-tts-preview` kullanır; Puck, Charon ve Fenrir desteklenir. PCM yanıtına gerçek WAV/RIFF başlığı eklenir. Sabit ses denemesi aktif arayüzden kaldırılmıştır.

Özel ayar: D:\ORYVONA_MERKEZ\_Sistem-ve-Arsiv\studio-v23-runtime\studio-state\gemini.env. Yalnız GEMINI_API_KEY ve GEMINI_FREE_TIER_CONFIRMED kabul edilir. Ücretsiz katman doğrulaması olmadan istek gönderilmez. Google anahtarının bağlı olduğu projenin faturalandırma ayarı Google hesabından yönetilir; API isteği tek başına ücretsiz kullanım garantisi vermez. Anahtar web/site/ZIP içine konulmaz. Ayar güncellenince runner yeniden başlatılmadan okunur.

Yalnız Deniz'in açık geliştirme talebi veya belirli projedeki doğrudan hata bildirimi işçiye dönüşebilir. Modelin önerdiği talimat yetki sayılmaz; özgün sahip mesajı doğrulanır. Günlük sohbet, olumsuz talep ve varsayımsal soru görev üretmez. Argon ancak gerçek kalıcı requestId/flowId kaydını aldıktan sonra görevin kuyruğa alındığını söyler. Kuyruk kaydı görevin başladığı veya tamamlandığı anlamına gelmez.

İşçi politikası studio-runtime-config.json içindeki workerProviders alanındadır: OpenAI ve Google açık, Anthropic/Claude kapalıdır. Claude aboneliği yenilendiğinde anthropic.enabled tek bayrakla açılabilir. OpenAI geliştirmesini Google, Google geliştirmesini OpenAI inceler. Gerçek aynı-commit kaynak, bağımsız kontrol, test, derleme ve teslim kanıtları olmadan paket hazır sayılmaz. Kurulu CLI tek başına hazır işçi değildir: oturum ve izole araç sınırı doğrulanmalıdır. Eksik host kabul kaydı açık bekleme nedeni olarak gösterilir.

ORYVONA-Jarvis-V24 gizli görevi ve daemon.lock PID/exclusive/standby_other_instance mekanizması korunur. DJ-KABIN'de oyun, Unity, görünür tarayıcı veya ses başlatılmaz. Gerçek oyun testi/derlemesi yetkili ayrı host gerektirir.

npm run sync yalnız tools/shell-public-files.json listesindeki küçük kabuk dosyalarını web'den site'a eşitler. Ağır oyun dizinlerini taramaz veya kopyalamaz. npm test statik ve fixture testleridir, gerçek model çağırmaz. Headless mobil denetim sentetik sahip verisi ile beş sekmenin yerleşimini ölçer; fiziksel telefon, mikrofon, gerçek API veya oyun testi değildir.

Service worker kabuk anahtarı oryvona-panel-v26-argon-audio-memory-20261021-r2; önceki oyun önbelleği ve kalıcı kuyruk korunur. Supabase sahip yetkisi ve hesap değişimi kontrolleri korunur. Canlı hesap yanıtları önbelleğe alınmaz. Yayın kapsamı /oryvona-panel/ olarak kalır.
