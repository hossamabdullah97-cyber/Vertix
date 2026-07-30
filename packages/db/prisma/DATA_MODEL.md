# نموذج بيانات Vertex Connect

16 جدولاً موزّعة على 4 نطاقات. كل جدول مستأجَر يحمل `orgId` لعزل المؤسسات (Multi-tenant).

## النطاقات والعلاقات

### ① الهوية والمستأجرون
- `User` ⟷ `Organization` علاقة many-to-many عبر `Membership` (مع الدور `Role`).
- `Organization` 1—N `Team` ، و `Team` 1—N `Membership` (عبر `teamId`).
- `User` 1—N `Team` كمدير (`managerId`).

### ② البطاقات و NFC
- `Organization` 1—N `Card` ، و `User` 1—N `Card` (المالك).
- `Card` 1—N `CardSection` (5 أنواع) ، 1—N `CardAction` (10 إجراءات) ، 1—N `NfcTag`.

### ③ إدارة العملاء (CRM)
- `Organization` 1—N `Lead` / `PipelineStage` (7 مراحل) / `ScoringRule`.
- `Card` 1—N `Lead` (مصدر العميل) ، `PipelineStage` 1—N `Lead`.
- `User` 1—N `Lead` (المسؤول) ، `Lead` 1—N `LeadActivity`.

### ④ التحليلات والفوترة والتدقيق
- `Card` 1—N `Event` ، `Visitor` 1—N `Event`.
- `Organization` 1—1 `Subscription` ، 1—N `AuditLog`.

## ملاحظات إنتاجية

- **Row-Level Security:** فعّل RLS على كل جدول يحمل `orgId` كطبقة دفاع ثانية فوق فلترة التطبيق.
- **المعرّفات:** `cuid()` — آمنة للكشف العام في الروابط.

### الحذف الآمن (Soft Delete)
- جداول الكيانات الرئيسية تحمل `deletedAt DateTime?`: `User`, `Organization`, `Membership`, `Team`, `Card`, `CardSection`, `CardAction`, `NfcTag`, `PipelineStage`, `Lead`, `ScoringRule`, `Subscription`.
- الجداول السجلّية **لا تأخذ** soft delete (append-only): `Event`, `LeadActivity`, `AuditLog`, `Visitor` — لضمان سلامة التدقيق والتحليلات حتى لو حُذف الكيان المرجعي.
- **التطبيق:** افرض فلتر `{ deletedAt: null }` تلقائياً عبر **Prisma Client Extension** (query middleware) كي لا يتسرب أي سجلّ محذوف. فهرس `@@index([deletedAt])` مضاف للجداول كثيرة الاستعلام.
- علاقات الملكية تبقى `onDelete: Cascade` (للحذف الفعلي النهائي عند الحاجة)، والمراجع الاختيارية `SetNull`.

### تصنيع الـ NFC
- `NfcTag.hardwareType` (enum: CARD / STICKER / KEYCHAIN / WRISTBAND / OTHER) — لتحديد نوع القطعة الفيزيائية عند خدمة العملاء.
- `NfcTag.batchId` + `@@index([batchId])` — لتتبع دفعات الإنتاج من المصنع.

### فهرسة التحليلات (Time-series)
- جدول `events` سينمو انفجارياً. الفهارس المركّبة:
  - `@@index([orgId, createdAt])` — تقارير لوحات التحكم على مستوى المؤسسة.
  - `@@index([cardId, createdAt])` — أداء بطاقة محددة عبر الزمن.
  - `@@index([orgId, type, createdAt])` — تصفية حسب نوع الحدث (views / scans / saves).
- **الخطوة التالية للحجم الكبير:** تقسيم زمني (PostgreSQL partitioning بـ `createdAt`) أو نقل إلى ClickHouse.

## الخطوات التالية
1. `npm i -D prisma && npm i @prisma/client`
2. `npx prisma validate` ثم `npx prisma migrate dev --name init`
3. كتابة seed للمراحل الافتراضية (7) وقواعد التسجيل وقوالب البطاقات.
