# Lumen X

تطبيق ويب: تلصق رسالة أو فقرة لا تفهمها جيداً (أو ترفق لقطة شاشة)، فيقرأها لك التطبيق ويشرح معناها الحقيقي، ثم يقترح عليك خطوتك التالية وردّاً جاهزاً يمكنك إرساله.

---

## 🇩🇿 بالعربية — شرح بسيط

### كيف يعمل التطبيق؟

التطبيق جزآن:

1. **الواجهة (اللي يشوفها الزائر):** صفحة واحدة فيها خانة للصق النص وزر «Read this». مبنية بـ React.
2. **الخادم (المخ):** برنامج صغير (Express) يستقبل النص، يبعثه إلى ذكاء Google Gemini الاصطناعي، ويرجع لك التحليل جاهزاً: ملخص، «ماذا يعني هذا»، خطوتك التالية، وردّ مقترح.

لا توجد حسابات ولا قاعدة بيانات — لا شيء يُحفظ. النص يذهب إلى Gemini ويعود التحليل، وانتهى.

### خريطة الملفات

| الملف / المجلد | واش يدير |
|---|---|
| `src/App.tsx` | الشاشة كاملة: العنوان، خانة الإدخال، حالات الانتظار والخطأ، وعرض النتيجة |
| `src/api.ts` | عقد الاتصال بين الواجهة والخادم: شكل الطلب وشكل الجواب (لا تبدّل أسماء الحقول) |
| `src/image.ts` | يصغّر لقطة الشاشة قبل إرسالها باش ما تكونش ثقيلة |
| `src/index.css` | الألوان والخطوط (التصميم المجمّد: خلفية `#0f1015`، ليموني `#d5ff3d`، سماوي `#4fe1f8`، خطوط Manrope وSpace Grotesk وDM Mono) |
| `src/main.tsx` | نقطة بداية الواجهة |
| `server/index.js` | الخادم كامل في ملف واحد: يستقبل الطلب، ينادي Gemini، ويقدّم الموقع الجاهز |
| `public/` | الشعار الأصلي `x-logo.png` وملف `manifest.json` (بيانات تثبيت التطبيق على الهاتف) |
| `index.html` | صفحة HTML الأساسية: العنوان «Lumen X» وروابط الشعار والبيان |
| `.env.example` | نموذج ملف الأسرار — انسخو إلى `.env` وحط فيه مفتاحك |
| `render.yaml` | إعدادات النشر الجاهزة لموقع Render |

### مفتاح Gemini (مجاني)

1. ادخل: https://aistudio.google.com/apikey وسجّل بحساب Google.
2. اضغط «Create API key» وانسخ المفتاح.
3. المفتاح يعيش **فقط** في ملف `.env` عندك (أو في إعدادات Render) — **أبداً** داخل الكود.

### التشغيل على جهازك

```bash
npm install                  # تنزيل المكتبات (مرة واحدة)
cp .env.example .env         # ثم افتح .env وحط مفتاح GEMINI_API_KEY
npm run build                # بناء الواجهة
npm start                    # تشغيل الخادم — افتح http://localhost:3000
```

للتطوير (الواجهة تتحدّث وحدها عند كل تعديل)، شغّل هذين في نافذتين:

```bash
npm run dev:server           # الخادم على المنفذ 3000
npm run dev                  # الواجهة على المنفذ 5173 — افتح هذا العنوان
```

### النشر على Render (مجاني)

1. ارفع المشروع إلى GitHub، ثم في Render اختر **New → Web Service** واربط المستودع (أو استعمل `render.yaml` كـ Blueprint).
2. **Build command:** `npm install && npm run build`
3. **Start command:** `npm start`
4. في تبويب **Environment** زيد متغيراً: `GEMINI_API_KEY` = مفتاحك.
5. اضغط Deploy. صافي — الموقع يولّي حيًّا على رابط Render.

---

## 🇬🇧 In English

**What it is.** Lumen X is a private "second pair of eyes": paste a message, screenshot description, or paragraph you cannot quite place, and it separates signal from noise — what is really being said, the likely intent, the emotional undertone, the risks — then gives you a grounded next move and words you can send. No accounts, no database, nothing is stored.

**How it works.** A one-page React frontend (`src/`) talks to a small Express server (`server/index.js`). The server sends the input to Google Gemini (`gemini-3.6-flash`, free tier) with the original Lumen system prompt, checks the JSON answer's shape, and returns `{ summary, whatItMeans, nextStep, reply, replyTone }` — the exact contract in `src/api.ts`.

**Run locally**

```bash
npm install
cp .env.example .env   # then put your GEMINI_API_KEY in .env
npm run build
npm start              # http://localhost:3000
```

Development (hot reload): run `npm run dev:server` and `npm run dev` in two terminals, open port 5173.

**Get a free Gemini key:** https://aistudio.google.com/apikey — keep it only in `.env` / host environment variables, never in code.

**Deploy on Render:** build command `npm install && npm run build`, start command `npm start`, set env var `GEMINI_API_KEY`. A ready `render.yaml` blueprint is included.
