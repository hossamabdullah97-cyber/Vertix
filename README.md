# Vertex Connect

منصة SaaS متكاملة لإدارة البطاقات الشخصية الرقمية المدعومة بتقنية NFC.

معمارية **API-First** تخدم الويب والموبايل (مستقبلاً) من واجهة خلفية واحدة.

## البنية (Monorepo — Turborepo + pnpm)

```
vertex-connect/
├── apps/
│   └── api/          NestJS API (المصادقة، البطاقات، NFC، CRM، التحليلات)
├── packages/
│   ├── db/           Prisma schema + عميل ممدَّد (soft delete) + seed
│   └── shared/       أنواع + Zod schemas مشتركة (web/mobile/api)
├── docker-compose.yml  PostgreSQL + Redis
└── turbo.json
```

> `apps/web` (Next.js) و`apps/mobile` (Expo) يستهلكان نفس الـ API. تطبيق الموبايل
> **مستقل عن workspace** الـ pnpm (تعارض RN مع node_modules الصارم) — انظر [دليله](apps/mobile/README.md).

## المتطلبات
- Node.js 20+
- pnpm 10+
- PostgreSQL 16 (أو Docker)

## التشغيل المحلي

```bash
# 1) ثبّت الاعتماديات
pnpm install

# 2) جهّز متغيرات البيئة
cp .env.example .env

# 3) شغّل قاعدة البيانات
#    أ) عبر Docker:            docker compose up -d
#    ب) أو Postgres مدمج (بلا Docker/صلاحيات، يُنصح للتطوير المحلي):
pnpm db:up               # يشغّل PostgreSQL محلياً على 5432 (يبقى يعمل)

# 4) ولّد عميل Prisma وطبّق المخطط (في طرفية أخرى)
pnpm db:generate
pnpm db:migrate          # ينشئ أول migration
pnpm db:seed             # مؤسسة تجريبية + 7 مراحل + قواعد تسجيل

# 5) شغّل الـ API + الويب
pnpm dev                 # API: http://localhost:4000/api · Web: http://localhost:3000
```

تحقّق: `GET http://localhost:4000/api/health`

## نقاط النهاية الحالية
| الطريقة | المسار | الوصف | الحماية |
|--------|--------|-------|---------|
| GET  | `/api/health`        | حالة الخادم وقاعدة البيانات | عام |
| POST | `/api/auth/register` | إنشاء مستخدم + مؤسسة (OWNER) | عام |
| POST | `/api/auth/login`    | تسجيل الدخول → access + refresh | عام |
| POST | `/api/auth/refresh`  | تجديد الرموز | عام |
| POST | `/api/auth/accept-invite` | قبول دعوة (تعيين كلمة مرور) | عام |
| POST | `/api/auth/forgot-password` | طلب رابط إعادة تعيين | عام |
| POST | `/api/auth/reset-password` | تعيين كلمة مرور جديدة | عام |
| GET  | `/api/auth/me`       | المستخدم الحالي | JWT |
| GET  | `/api/orgs/current`  | المؤسسة النشطة | JWT + مؤسسة |
| GET  | `/api/orgs/members`  | أعضاء المؤسسة | OWNER/ADMIN/MANAGER |
| POST | `/api/orgs/members/invite` | دعوة عضو (بريد دعوة برابط رمز) | OWNER/ADMIN |
| PATCH/DELETE | `/api/orgs/members/:id` | تغيير دور/فريق · إزالة | OWNER/ADMIN |
| CRUD | `/api/orgs/teams`    | إدارة الفرق | OWNER/ADMIN |
| GET  | `/api/billing/plans` | الخطط والأسعار | عام |
| GET  | `/api/billing/subscription` | الخطة الحالية + الاستخدام | JWT + مؤسسة |
| POST | `/api/billing/checkout` | جلسة Stripe Checkout | OWNER/ADMIN |
| POST | `/api/billing/portal` | بوابة Stripe لإدارة الاشتراك | OWNER |
| POST | `/api/billing/webhook` | webhook من Stripe | عام (موقّع) |
| CRUD | `/api/cards`         | البطاقات (إنشاء/عرض/تعديل/حذف ناعم) | JWT + مؤسسة |
| CRUD | `/api/cards/:id/sections` | أقسام البطاقة (+ `/reorder`) | JWT + مؤسسة |
| CRUD | `/api/cards/:id/actions`  | إجراءات البطاقة (+ `/reorder`) | JWT + مؤسسة |
| GET  | `/api/c/:slug`       | الصفحة العامة للبطاقة المنشورة | عام |
| GET  | `/api/c/:slug/vcard` | تنزيل vCard (.vcf) | عام |
| CRUD | `/api/nfc/tags`      | إدارة تاجات NFC (+ `/batch`، `/:id/assign`) | OWNER/ADMIN/MANAGER |
| GET  | `/api/t/:uid`        | بوابة NFC — مسح وتحويل (302) | عام |
| GET  | `/api/t/:uid/resolve`| نتيجة المسح JSON (للموبايل) | عام |
| POST | `/api/track`         | تسجيل حدث عام (مشاهدة/نقر/حفظ) | عام |
| GET  | `/api/analytics/overview` | مؤشرات الأداء + زوّار فريدون | JWT + مؤسسة |
| GET  | `/api/analytics/timeseries` | سلسلة زمنية يومية حسب النوع | JWT + مؤسسة |
| GET  | `/api/analytics/top-cards` | أكثر البطاقات تفاعلاً | JWT + مؤسسة |
| GET  | `/api/analytics/referrers` | مصادر الزيارات | JWT + مؤسسة |

> المؤسسة النشطة تُحدَّد من رمز JWT أو ترويسة `x-organization-id`. تفاصيل طبقة الأمان في [SECURITY.md](SECURITY.md).

## النشر الإنتاجي (Docker)
```bash
# املأ الأسرار في البيئة أو .env (JWT_SECRET، JWT_REFRESH_SECRET على الأقل)
docker compose -f docker-compose.prod.yml up --build -d
# postgres + redis + api(:4000) + web(:3000) — الـ migrations تُطبَّق تلقائياً عند الإقلاع
```
> الـ Dockerfiles مكتوبة بنمط multi-stage للـ monorepo، ولم تُبنَ في بيئة التطوير هذه (Docker غير مثبّت) — تُبنى على خادم فيه Docker.

## الأوامر
| الأمر | الوظيفة |
|------|---------|
| `pnpm dev`         | تشغيل التطوير (turbo) |
| `pnpm build`       | بناء كل الحزم |
| `pnpm lint`        | فحص الكود |
| `pnpm test`        | الاختبارات |
| `pnpm db:studio`   | Prisma Studio |
| `pnpm db:migrate`  | ترحيلات قاعدة البيانات |

## ما أُنجز (المرحلة 0 + طبقة الأمان)
- ✅ Monorepo (Turborepo + pnpm workspaces)
- ✅ NestJS API + التحقق من البيئة (Zod) + Helmet + CORS + Throttler
- ✅ Prisma schema كامل (16 جدول) + soft delete + فهارس time-series
- ✅ المصادقة: JWT + Refresh + bcrypt
- ✅ **عزل المستأجرين**: حقن orgId تلقائي (AsyncLocalStorage + Prisma Extension)
- ✅ **RBAC**: TenantGuard + RolesGuard (`@Roles`) — آمن افتراضياً
- ✅ Health check + معالجة اتصال DB متسامحة
- ✅ CI (GitHub Actions)

### المرحلة 1 — وحدة البطاقات
- ✅ CRUD كامل للبطاقات (مع حذف ناعم) — معزول تلقائياً بالمؤسسة
- ✅ الأقسام والإجراءات (CRUD + إعادة ترتيب) — معزولة عبر الأب
- ✅ صلاحيات: الموظف يدير بطاقاته، المدير فأعلى يدير كل بطاقات المؤسسة
- ✅ الصفحة العامة `/c/:slug` + تنزيل vCard
- ✅ تحقّق Zod لكل المدخلات (slug، الأنواع، المحتوى)

### المرحلة 2 — محرك NFC
- ✅ إدارة تاجات NFC: تسجيل فردي + دفعات تصنيع (batch) + إسناد/فصل + تعطيل
- ✅ تتبّع `hardwareType` و`batchId` لخدمة العملاء
- ✅ بوابة NFC عامة بالمراحل الست (تحقق → حل الملف → إسناد → تخصيص → إجراء → تحليلات)
- ✅ 10 إجراءات مباشرة (واتساب، اتصال، بريد، خرائط، حفظ جهة اتصال...) عبر `action-resolver`
- ✅ تسجيل أحداث المسح (NFC_SCAN) + تتبّع الزوار — لا يعطّل التحويل عند الفشل
- ✅ نقطة JSON `/resolve` للتطبيقات الأصلية (موبايل)

### تطبيق الويب (Next.js)
- ✅ `apps/web`: Next.js 14 (App Router) + Tailwind + نظام تصميم Swiss minimalist
- ✅ مصادقة: دخول/تسجيل + JWT في المتصفح + `authFetch` (إعادة توجيه عند 401)
- ✅ لوحة تحكم: قائمة البطاقات + إنشاء بطاقة (اختيار قالب)
- ✅ محرر بطاقة كامل: إعدادات + أقسام + إجراءات (إضافة/تحرير/حذف/إظهار/إعادة ترتيب) + نشر
- ✅ معاينة حيّة + 17 قالباً (فاتح/داكن)
- ✅ الصفحة العامة `/c/[slug]` (تدعم الوضع الداكن) + vCard — تُكمل حلقة NFC

### مُتحقَّق منه حيّاً (ضد PostgreSQL حقيقي)
تسجيل ← دخول ← إنشاء بطاقة + أقسام + إجراءات ← نشر ← صفحة عامة ← vCard ←
تسجيل تاج + إسناد ← بوابة NFC (تحويل لإجراء مباشر أو صفحة البطاقة) ← **عزل
المستأجرين** (مؤسسة لا ترى بيانات أخرى: 404 + قائمة فارغة).

### المرحلة 3 — التحليلات
- ✅ تسجيل أحداث عامة (مشاهدة/نقر/حفظ) من الصفحة العامة + مسح NFC من البوابة
- ✅ تجميع معزول بالمؤسسة: مؤشرات، سلسلة زمنية يومية، أكثر البطاقات، المصادر
- ✅ raw SQL آمن (orgId صريح) + groupBy تلقائي العزل
- ✅ لوحة تحليلات في الويب: KPIs + رسم بياني يومي + جداول

### إدارة تاجات NFC في الويب
- ✅ صفحة `/tags`: تسجيل تاج فردي + تسجيل دفعة مصنع (قائمة UIDs)
- ✅ إسناد/فصل التاج للبطاقة، تعطيل/تفعيل، حذف، فلترة بالحالة/الدفعة
- ✅ نسخ رابط اللمس (`/api/t/:uid`) + عرض عدّاد المسح وآخر مسح

### إدارة الفريق/الأعضاء
- ✅ دعوة أعضاء بالبريد (رابط دعوة لمرة واحدة صالح ٧ أيام — الموظف نفسه يختار كلمة مروره عند التفعيل، ولا يطّلع عليها المالك/المسؤول)
- ✅ أدوار (OWNER/ADMIN/MANAGER/EMPLOYEE) + تغييرها + إزالة الأعضاء
- ✅ فرق: إنشاء/حذف + إسناد الأعضاء + عدّاد الأعضاء
- ✅ حُرّاس: لا يمكن إزالة آخر مالك / تعديل مالك إلا من مالك / لا تُزِل نفسك
- ✅ صفحة `/team` في الويب (إدارة كاملة للمالك/المسؤول، عرض للبقية)

### الفوترة (Stripe) + الخطط + الحدود
- ✅ 4 خطط (FREE/PRO/BUSINESS/ENTERPRISE) بحدود وأسعار في الحزمة المشتركة
- ✅ فرض الحدود على الإنشاء (بطاقات/أعضاء/تاجات) — `LimitsService` يقرأ خطة المؤسسة
- ✅ Stripe: Checkout + Customer Portal + webhook (تحديث الخطة) — مُعطَّل تلقائياً بلا مفتاح
- ✅ صفحة `/billing`: الخطة الحالية + أشرطة الاستخدام + بطاقات الترقية

### تطبيق الموبايل (Expo + NFC أصلي)
- ✅ `apps/mobile`: Expo Router + `react-native-nfc-manager` (CoreNFC / Android NFC)
- ✅ شاشات: دخول (SecureStore) · البطاقات · **برمجة تاج** · **مسح تاج**
- ✅ برمجة بلمسة واحدة: قراءة UID + كتابة NDEF (رابط البوابة) + تسجيل/إسناد
- ✅ مسح: قراءة تاج → حلّ عبر البوابة العامة → فتح البطاقة/الإجراء
- ✅ إعداد native كامل (app.json + config plugin + أذونات iOS/Android)
- ⚠️ يُختبر على جهاز فعلي (NFC غير متاح في المحاكيات؛ iOS يحتاج macOS)

### تصليب إنتاجي
- ✅ اختبارات: Jest للـ API (13 اختبار) + Vitest للحزمة المشتركة (7) — في CI
- ✅ Sentry: تهيئة مبكّرة (`instrument.ts`) + فلتر استثناءات عام يبلّغ عن أخطاء 5xx
- ✅ Dockerfiles (api + web standalone) + `docker-compose.prod.yml` + `.dockerignore`
- ✅ معالجة أخطاء موحّدة ترجع JSON نظيفاً؛ كل التهيئة مُعطَّلة بأمان بلا مفاتيح

### البريد الفعلي (دعوات + إعادة تعيين)
- ✅ رموز لمرة واحدة (`Token`): تُخزَّن مُجزّأة (sha256)، تنتهي صلاحيتها، لا تُعاد
- ✅ `MailService` عبر Resend (أو تسجيل الرابط في الـ console بلا مفتاح)
- ✅ الدعوة: حساب معلّق (بلا كلمة مرور) + رابط قبول → تعيين كلمة المرور وتفعيل
- ✅ إعادة التعيين: `forgot-password` (بلا تسريب وجود الحساب) → `reset-password`
- ✅ صفحات الويب: `/accept-invite` · `/forgot-password` · `/reset-password`

## التالي
- ربط Stripe بمفاتيح حقيقية + اختبار webhook عبر Stripe CLI.
- اختبارات تكامل (e2e) للمسارات المحمية + تشغيل الموبايل على جهاز (EAS).
- نشر فعلي على خادم (Railway/Fly/VPS) + مزوّد بريد حقيقي.
