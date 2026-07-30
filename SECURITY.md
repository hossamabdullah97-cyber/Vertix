# نموذج الأمان — Vertex Connect

دفاع متعدد الطبقات (Defense in Depth) لضمان "آمن افتراضياً" (Secure by Default).

## طبقات الطلب (بالترتيب)

```
الطلب
  │
  ├─ 1) ThrottlerGuard      حد معدّل (100 طلب/دقيقة افتراضياً)
  ├─ 2) JwtAuthGuard        يتحقق من رمز JWT (إلا @Public)
  ├─ 3) TenantGuard         يحلّ المؤسسة النشطة + يتحقق من العضوية الفعّالة
  ├─ 4) RolesGuard          يفرض @Roles بناءً على دور العضوية (من قاعدة البيانات)
  │
  ├─ TenantInterceptor      يلفّ المعالج داخل AsyncLocalStorage(orgId)
  │
  └─ Prisma Extension       يحقن orgId تلقائياً في كل استعلام مستأجَر
```

## 1) المصادقة (JWT + Refresh)
- `accessToken` قصير العمر (15m) + `refreshToken` (7d) بسرّين منفصلين.
- كل المسارات محمية افتراضياً عبر `JwtAuthGuard` العام؛ الاستثناء صريح بـ `@Public()`.

## 2) عزل المستأجرين (الطبقة الأهم)
المؤسسة النشطة تُحدَّد من ترويسة `x-organization-id` أو من رمز JWT، ثم **يُتحقق من
وجود عضوية فعّالة** للمستخدم فيها قبل أي وصول. الدور يُؤخذ من قاعدة البيانات (مرجع
موثوق) لا من الرمز.

### الحقن التلقائي لـ orgId
عبر `AsyncLocalStorage` + امتداد Prisma، يُحقن `orgId` تلقائياً في:
- **القراءة**: `findMany/findFirst/findUnique/count/aggregate/groupBy` → `where.orgId`
- **الكتابة**: `create/createMany` → `data.orgId` · `update/delete/upsert` → `where.orgId`

`orgId` **مفروض ولا يمكن تجاوزه** (يُكتب بعد دمج شرط المطوّر). النتيجة: يستحيل قراءة
أو تعديل بيانات مؤسسة أخرى حتى لو نسي المطوّر كتابة `where: { orgId }`، أو حاول تمرير
`id` من مؤسسة أخرى.

الجداول المستأجَرة المحمية تلقائياً:
`Membership, Team, Card, NfcTag, PipelineStage, Lead, ScoringRule, Event, Subscription, AuditLog`.

### ⚠️ قيد معروف — الجداول الأبناء
`CardSection`, `CardAction`, `LeadActivity` لا تحمل `orgId` (تُعزَل عبر آبائها).
**القاعدة الإلزامية:** أي وصول إليها يجب أن يمرّ عبر الأب المُتحقَّق منه (مثلاً تحميل
`Card` المملوكة للمؤسسة أولاً، ثم أقسامها). لا تستعلم عنها بالمعرّف مباشرة.
> خيار تصليب إضافي مقترح لاحقاً: إضافة `orgId` لهذه الجداول (denormalization) لتدخل
> ضمن الحقن التلقائي.

## 3) الصلاحيات (RBAC)
`@Roles('OWNER', 'ADMIN')` على المسار → يفرضها `RolesGuard` اعتماداً على دور العضوية.
الهرم: `OWNER > ADMIN > MANAGER > EMPLOYEE`.

## 4) طبقة قاعدة البيانات (موصى به للإنتاج)
فعّل **Row-Level Security (RLS)** في PostgreSQL على كل جدول يحمل `orgId` كشبكة أمان
ثالثة مستقلة عن التطبيق — حتى لو وُجد خلل في طبقة التطبيق، تمنع القاعدة التسريب.

## كيفية التحقق (مع قاعدة بيانات)
```bash
docker compose up -d && pnpm db:migrate && pnpm db:seed
# 1) سجّل دخول owner@vertex.dev → احصل على accessToken
# 2) GET /api/orgs/members → يعيد أعضاء مؤسسة demo فقط
# 3) أنشئ مؤسسة ثانية بمستخدم آخر، وتحقق أن /orgs/members لا يسرّب بياناتها
```

## ما تم التحقق منه (بدون قاعدة بيانات)
| الحالة | النتيجة |
|--------|---------|
| مسار عام (`/health`) | 200 |
| مسار محمي بلا رمز | 401 |
| رمز صالح، مسار مستخدم (`/auth/me`) | 200 + الحمولة |
| رمز صالح بلا مؤسسة نشطة + `@Roles` | 403 |
