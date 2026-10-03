/**
 * The API answers in English. This puts its messages in the language the page
 * is shown in, so someone using the app in Arabic never reads an English
 * error. A message missing from the list falls back to a general one rather
 * than showing English; apiErrors.spec.ts fails when the API gains a message
 * this file does not know.
 */

type Locale = 'en' | 'ar';

/** Exact API messages, in Arabic. */
export const AR_MESSAGES: Record<string, string> = {
  // Accounts and sign-in
  'Account not found': 'الحساب غير موجود',
  'Email is already in use': 'هذا البريد الإلكتروني مستخدم بالفعل',
  'Google has not verified this email address': 'لم تتحقق Google من هذا البريد الإلكتروني',
  'Google sign-in failed': 'تعذّر تسجيل الدخول بحساب Google',
  'Google sign-in is not set up on this server': 'تسجيل الدخول بحساب Google غير مُفعّل على هذا الخادم',
  'Invalid credentials': 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
  'Invalid invitation': 'الدعوة غير صالحة',
  'Invalid or expired link': 'الرابط غير صالح أو انتهت صلاحيته',
  'Invalid refresh token': 'انتهت الجلسة. سجّل الدخول مرة أخرى',
  'Invalid token': 'الرمز غير صالح',
  'Token not found': 'الرمز غير موجود',
  'There is no account with this email yet. Set a password of at least 8 characters to create one.':
    'لا يوجد حساب بهذا البريد الإلكتروني بعد. اختر كلمة مرور من 8 أحرف على الأقل لإنشاء حساب.',
  'This account has been suspended. Ask your workspace owner to restore it.':
    'تم إيقاف هذا الحساب. اطلب من مالك مساحة العمل إعادة تفعيله.',
  'This account has no email address': 'لا يوجد بريد إلكتروني لهذا الحساب',
  'This account is linked to a different Google account': 'هذا الحساب مرتبط بحساب Google آخر',
  'The email could not be sent. Try again in a moment.': 'تعذّر إرسال البريد. حاول مرة أخرى بعد لحظات.',
  'User not found': 'المستخدم غير موجود',
  'Confirm your email address first: open the link we sent you, or send a new one from the notice at the top of the app.':
    'أكّد بريدك الإلكتروني أولاً: افتح الرابط الذي أرسلناه إليك، أو أرسل رابطاً جديداً من التنبيه أعلى التطبيق.',
  'Password must be at least 8 characters': 'يجب أن تتكون كلمة المرور من 8 أحرف على الأقل',

  // Workspaces, members and permissions
  'An active organization is required': 'اختر مساحة عمل أولاً',
  'An organization with this name already exists.': 'توجد مساحة عمل بهذا الاسم بالفعل.',
  'Organization not found': 'مساحة العمل غير موجودة',
  'Selected organization does not exist': 'مساحة العمل المختارة غير موجودة',
  'Selected organization or account owner no longer exists': 'مساحة العمل المختارة أو مالك الحساب لم يعد موجوداً',
  'This organization is currently suspended or deleted': 'مساحة العمل هذه موقوفة أو محذوفة',
  'You do not have access to this organization': 'ليست لديك صلاحية الوصول إلى مساحة العمل هذه',
  'Your role does not permit this action': 'دورك لا يسمح بهذا الإجراء',
  Forbidden: 'ليست لديك صلاحية لهذا الإجراء',
  Unauthorized: 'انتهت الجلسة. سجّل الدخول مرة أخرى',
  'Super Admin access required': 'هذا الإجراء يتطلب صلاحية مدير المنصة',
  'Platform administration is not available to this account': 'إدارة المنصة غير متاحة لهذا الحساب',
  'Member not found': 'العضو غير موجود',
  'That member is not part of this workspace.': 'هذا العضو ليس ضمن مساحة العمل.',
  'This user is already a member': 'هذا المستخدم عضو بالفعل',
  'Manager is not a member of this organization': 'المدير ليس عضواً في مساحة العمل هذه',
  'Only an owner can grant the owner role': 'المالك وحده يستطيع منح دور المالك',
  'Only an owner can modify an owner': 'المالك وحده يستطيع تعديل مالك آخر',
  'Only an owner can remove an owner': 'المالك وحده يستطيع إزالة مالك آخر',
  'Owners cannot be suspended': 'لا يمكن إيقاف المالكين',
  'The organization must keep at least one owner': 'يجب أن يبقى لمساحة العمل مالك واحد على الأقل',
  'You cannot remove yourself': 'لا يمكنك إزالة نفسك',
  'Department not found': 'القسم غير موجود',
  'Team not found': 'الفريق غير موجود',
  'Approval request not found': 'طلب الموافقة غير موجود',
  'Approval request has already been resolved': 'تم البت في طلب الموافقة بالفعل',

  // Cards
  'Card not found': 'البطاقة غير موجودة',
  'Could not generate a unique card link': 'تعذّر إنشاء رابط فريد للبطاقة. حاول مرة أخرى',
  'slug is already in use': 'رابط البطاقة هذا مستخدم بالفعل',
  'slug may contain lowercase letters, digits and dashes only': 'يمكن أن يحتوي رابط البطاقة على أحرف إنجليزية صغيرة وأرقام وشرطات فقط',
  'You cannot create a card for another user': 'لا يمكنك إنشاء بطاقة لمستخدم آخر',
  'You do not have permission to edit this card': 'ليست لديك صلاحية تعديل هذه البطاقة',
  'You do not have permission to view this card': 'ليست لديك صلاحية عرض هذه البطاقة',
  'This access key is already used on this card': 'مفتاح الوصول هذا مستخدم بالفعل على هذه البطاقة',
  'Variant not found': 'النسخة غير موجودة',
  'Action not found': 'الرابط غير موجود، أو مرّ وقت طويل على حذفه',
  'Section not found': 'القسم غير موجود، أو مرّ وقت طويل على حذفه',
  'Payment link not found': 'رابط الدفع غير موجود، أو مرّ وقت طويل على حذفه',
  'Asset not found': 'الملف غير موجود',
  'No file uploaded': 'لم يتم رفع أي ملف',
  'Only image files are allowed': 'يُسمح بملفات الصور فقط',
  'Apple Wallet is not set up': 'Apple Wallet غير مُفعّل بعد',
  'Google Wallet is not set up': 'Google Wallet غير مُفعّل بعد',
  'Occasion not found': 'المناسبة غير موجودة',
  'The occasion ends before it starts': 'تاريخ انتهاء المناسبة قبل تاريخ بدايتها',
  'Use a date like 2026-09-20': 'اكتب التاريخ بهذا الشكل: 2026-09-20',
  'Payment link is required': 'رابط الدفع مطلوب',
  'Enter a valid link starting with https://': 'أدخل رابطاً صحيحاً يبدأ بـ https://',
  'Enter a mobile number': 'أدخل رقم هاتف محمول',

  // Leads and meetings
  'Lead not found': 'العميل المحتمل غير موجود',
  'Task not found': 'المهمة غير موجودة',
  'Pipeline stage not found': 'مرحلة المسار غير موجودة',
  'Give a name, an email or a phone number': 'أدخل الاسم أو البريد الإلكتروني أو رقم الهاتف',
  'Provide an email or a phone number': 'أدخل البريد الإلكتروني أو رقم الهاتف',
  'This card does not take meeting requests': 'هذه البطاقة لا تستقبل طلبات الاجتماعات',
  'Choose a time for the meeting': 'اختر موعداً للاجتماع',
  'That time is no longer free': 'هذا الموعد لم يعد متاحاً',
  'Someone else has asked for this time since': 'طلب شخص آخر هذا الموعد في هذه الأثناء',
  'This meeting time has passed': 'موعد هذا الاجتماع قد مضى',
  'This lead has no meeting request': 'لا يوجد طلب اجتماع لهذا العميل',
  'Already accepted': 'تم قبوله بالفعل',
  'Already declined': 'تم رفضه بالفعل',
  'Card scanning is not set up on this server': 'مسح البطاقات غير مُفعّل على هذا الخادم',
  'No business card found in the photo': 'لم نجد بطاقة عمل في الصورة',
  'The card could not be read right now': 'تعذّرت قراءة البطاقة الآن. حاول مرة أخرى',
  'Send a JPEG, PNG or WebP photo': 'أرسل صورة بصيغة JPEG أو PNG أو WebP',
  'Send a photo of the card': 'أرسل صورة للبطاقة',

  // NFC chips and tags
  'A chip UID is required.': 'رقم الشريحة مطلوب.',
  'A tag with this UID already exists': 'توجد شريحة بهذا الرقم بالفعل',
  'Chip not found': 'الشريحة غير موجودة',
  'Tag not found': 'الشريحة غير موجودة',
  'Unknown or disabled tag': 'الشريحة غير معروفة أو معطّلة',
  'Give either a list of UIDs or a batch to allocate.': 'أدخل قائمة بأرقام الشرائح أو دفعة لتخصيصها.',
  'No chip UIDs were supplied.': 'لم يتم إدخال أي أرقام شرائح.',
  'This chip has been blocked and cannot be used.': 'تم حظر هذه الشريحة ولا يمكن استخدامها.',
  'This chip is claimed by a workspace. Block it instead of deleting it.': 'هذه الشريحة مسجلة لمساحة عمل. احظرها بدلاً من حذفها.',
  'This chip is not registered with the platform. Only chips issued by Vertex Connect can be used.':
    'هذه الشريحة غير مسجلة في المنصة. يمكن استخدام الشرائح الصادرة من Vertex Connect فقط.',
  'This chip was issued to another workspace.': 'هذه الشريحة صادرة لمساحة عمل أخرى.',
  'You can only link your own cards to a chip.': 'يمكنك ربط بطاقاتك أنت فقط بالشريحة.',

  // Notifications
  'Add your WhatsApp number first': 'أضف رقم واتساب أولاً',
  'Enter the number with its country code, like +20 100 123 4567': 'أدخل الرقم مع كود الدولة، مثل ‎+20 100 123 4567',
  'WhatsApp alerts are not set up on this server': 'تنبيهات واتساب غير مُفعّلة على هذا الخادم',
  'WhatsApp did not accept the message. Check the number and try again.': 'رفض واتساب الرسالة. تأكد من الرقم وحاول مرة أخرى.',

  // Billing
  'Billing is not configured': 'الدفع غير مُفعّل بعد',
  'There is no subscription to cancel.': 'لا يوجد اشتراك لإلغائه.',
  'This workspace is already on this plan.': 'مساحة العمل مشتركة في هذه الباقة بالفعل.',

  // Integrations, webhooks and API keys
  'API key not found': 'مفتاح API غير موجود',
  'At least one scope is required.': 'اختر صلاحية واحدة على الأقل.',
  'Automation not found': 'الأتمتة غير موجودة',
  'Both client ID and client secret are required.': 'معرّف العميل والرمز السري مطلوبان معاً.',
  'Credential storage is not configured on this server.': 'تخزين بيانات الاعتماد غير مُفعّل على هذا الخادم.',
  'Delivery not found': 'عملية الإرسال غير موجودة',
  'Invalid or expired API credentials': 'بيانات اعتماد API غير صالحة أو منتهية',
  'Invalid or expired OAuth state.': 'انتهت صلاحية طلب الربط. حاول مرة أخرى.',
  'No OAuth app configured for this provider.': 'لم يتم إعداد تطبيق OAuth لهذه الخدمة.',
  'Nothing to sync — the field mapping produced no values.': 'لا يوجد ما تتم مزامنته — ربط الحقول لم ينتج أي قيم.',
  'Only a failed delivery can be retried.': 'يمكن إعادة المحاولة لعمليات الإرسال الفاشلة فقط.',
  'Only a failed webhook delivery can be retried; automation runs are a historical record.':
    'يمكن إعادة محاولة إرسال Webhook الفاشل فقط؛ تشغيلات الأتمتة سجل تاريخي.',
  'This credential cannot be used on this endpoint.': 'لا يمكن استخدام بيانات الاعتماد هذه هنا.',
  'Webhook URL is not valid.': 'رابط Webhook غير صالح.',
  'Webhook URL must be https.': 'يجب أن يبدأ رابط Webhook بـ https.',
  'Webhook endpoint not found': 'نقطة Webhook غير موجودة',
  'Webhook signing is not configured on this server (INTEGRATION_ENCRYPTION_KEY).': 'توقيع Webhook غير مُفعّل على هذا الخادم.',
  'Disable it instead — that stops it resolving while keeping its history.': 'عطّلها بدلاً من ذلك — يوقفها ذلك مع الاحتفاظ بسجلها.',

  // Validation and general
  'Invalid input': 'تحقق من البيانات المُدخلة',
  Required: 'هذا الحقل مطلوب',
  'Invalid email': 'البريد الإلكتروني غير صحيح',
  'Invalid url': 'الرابط غير صحيح',
  'Too Many Requests': 'طلبات كثيرة جداً. حاول مرة أخرى بعد قليل',
  'ThrottlerException: Too Many Requests': 'طلبات كثيرة جداً. حاول مرة أخرى بعد قليل',
  'Not Found': 'غير موجود',
  'Could not reach the server': 'تعذّر الاتصال بالخادم. تأكد من اتصالك بالإنترنت وحاول مرة أخرى',
  'Internal server error': 'حدث خطأ في الخادم. حاول مرة أخرى',
};

/** Messages with a value in them. The capture groups carry that value across. */
export const AR_PATTERNS: [RegExp, (...m: string[]) => string][] = [
  [/^(\S+) is not connected\.$/, (p) => `${p} غير متصل.`],
  [/^(\S+) is not connected yet — this organization has not registered its OAuth app credentials\.$/, (p) => `${p} غير متصل بعد — لم تسجّل مساحة العمل بيانات تطبيق OAuth الخاص بها.`],
  [/^(\S+) needs to be reconnected\.$/, (p) => `يجب إعادة ربط ${p}.`],
  [/^(\S+) does not support OAuth\.$/, (p) => `${p} لا يدعم الربط عبر OAuth.`],
  [/^(\S+) does not support CRM sync\.$/, (p) => `${p} لا يدعم مزامنة CRM.`],
  [/^(\S+) is not a supported CRM connector\.$/, (p) => `${p} ليس من أنظمة CRM المدعومة.`],
  [/^(\d+) of these chips are already claimed by a workspace and cannot be reallocated\.$/, (n) => `${n} من هذه الشرائح مسجلة بالفعل لمساحة عمل ولا يمكن إعادة تخصيصها.`],
  [/^Cannot delete this tag: it has (\d+) recorded scan\(s\)\./, (n) => `لا يمكن حذف هذه الشريحة: لها ${n} عملية مسح مسجلة. عطّلها بدلاً من ذلك — يوقفها ذلك مع الاحتفاظ بسجلها.`],
  [/^Feature flag (.+) not found$/, (f) => `الخاصية ${f} غير موجودة`],
  [/^Status must be one of: (.+)$/, (s) => `يجب أن تكون الحالة إحدى القيم: ${s}`],
  [/^The (\S+) plan is not on sale$/, (p) => `باقة ${p} غير متاحة للشراء`],
  [/^This token is missing the required scope\(s\): (.+)$/, (s) => `ينقص هذا الرمز الصلاحيات المطلوبة: ${s}`],
  [/^Token endpoint returned a non-JSON response \(HTTP (\d+)\)\.$/, (s) => `ردّت الخدمة برد غير مفهوم (HTTP ${s}).`],
  [/^Token exchange failed: (.*)$/, (e) => `تعذّر إتمام الربط: ${e}`],
  [/^Too many attempts\. Try again in (\d+) minutes?\.$/, (n) => `محاولات كثيرة. حاول مرة أخرى بعد ${n} دقيقة.`],
  [/^Unknown action type: (.+)$/, (a) => `نوع إجراء غير معروف: ${a}`],
  [/^Unknown event\(s\): (.+)$/, (e) => `أحداث غير معروفة: ${e}`],
  [/^Unknown scope\(s\): (.+)$/, (s) => `صلاحيات غير معروفة: ${s}`],
  [/^Plan limit reached/, () => 'وصلت إلى حد باقتك. رقِّ الباقة لإضافة المزيد.'],
  [/^An occasion can last at most (\d+) days$/, (n) => `يمكن أن تستمر المناسبة ${n} يوماً على الأكثر`],
  [/^Request failed \((\d+)\)$/, (s) => `تعذّر إتمام الطلب (${s}). حاول مرة أخرى`],
  [/^Upload failed \((\d+)\)$/, (s) => `تعذّر رفع الملف (${s}). حاول مرة أخرى`],
  // zod's own wording, for fields without a message of their own
  [/^String must contain at least (\d+) character\(s\)$/, (n) => `يجب أن يحتوي الحقل على ${n} حرف على الأقل`],
  [/^String must contain at most (\d+) character\(s\)$/, (n) => `يجب ألا يزيد الحقل عن ${n} حرف`],
  [/^Number must be greater than or equal to (-?[\d.]+)$/, (n) => `يجب أن يكون الرقم ${n} أو أكثر`],
  [/^Number must be less than or equal to (-?[\d.]+)$/, (n) => `يجب أن يكون الرقم ${n} أو أقل`],
  [/^Expected .+, received .+$/, () => 'قيمة غير صحيحة في أحد الحقول'],
  [/^Invalid enum value\./, () => 'اختر قيمة من القائمة'],
];

export const AR_FALLBACK = 'حدث خطأ ما. حاول مرة أخرى.';
export const AR_INVALID = 'تحقق من البيانات المُدخلة وحاول مرة أخرى.';

/** The Arabic for one API message, or null when it is not known. */
export function arabicFor(message: string): string | null {
  const exact = AR_MESSAGES[message.trim()];
  if (exact) return exact;
  for (const [re, fn] of AR_PATTERNS) {
    const m = re.exec(message.trim());
    if (m) return fn(...m.slice(1));
  }
  return null;
}

/** The page's language, as <html lang> says. */
export function pageLocale(): Locale {
  return typeof document !== 'undefined' && document.documentElement?.lang === 'ar' ? 'ar' : 'en';
}

/**
 * The text to show for a refused call: the API's message, in `locale`.
 * `fields` are the per-field messages of a validation error, when it gave them.
 */
export function apiErrorText(message: string, fields: string[] = [], locale: Locale = pageLocale()): string {
  if (locale === 'en') return fields.length ? fields.join(', ') : message;
  if (fields.length) {
    const known = [...new Set(fields.map(arabicFor))];
    return known.every(Boolean) ? known.join('، ') : AR_INVALID;
  }
  return arabicFor(message) ?? AR_FALLBACK;
}

/** A refused API call. `message` is for people; `apiMessage` is the API's own words, for code that reacts to them. */
export class ApiError extends Error {
  constructor(
    readonly apiMessage: string,
    readonly status: number,
    fields: string[] = [],
  ) {
    super(apiErrorText(apiMessage, fields));
  }
}

/** The API's own words for a caught error, when it came from the API. */
export function apiMessageOf(err: unknown): string {
  if (err instanceof ApiError) return err.apiMessage;
  return err instanceof Error ? err.message : String(err);
}
