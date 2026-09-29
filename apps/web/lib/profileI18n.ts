/**
 * Strings for the public profile. They follow the card's own language, not
 * the visitor's app settings, so they live apart from the dashboard locales.
 */
export type Lang = 'en' | 'ar';

const EN = {
  yourName: 'Your name',
  save: 'Save contact',
  saving: 'Preparing…',
  saved: 'Saved',
  exchange: 'Exchange',
  share: 'Share',
  close: 'Close',
  verified: 'Verified',
  available: 'Available now',
  respondsIn: 'Replies in {{time}}',
  about: 'About',
  readMore: 'Read more',
  showLess: 'Show less',
  links: 'Links',
  payments: 'Payments',
  open: 'Open',
  poweredBy: 'Made with',
  profileTag: 'Profile',

  // Share sheet
  shareTitle: 'Share this card',
  shareHint: 'Scan with any phone camera, or send the link.',
  copyLink: 'Copy link',
  linkCopied: 'Link copied',
  shareVia: 'Share via…',

  // Exchange sheet
  exchangeTitle: 'Share your details with {{name}}',
  exchangeHint: 'They get your details right away and can reply.',
  intents: { CONTACT: 'My details', MEETING: 'Meeting', QUOTE: 'Quote' },
  fullName: 'Full name',
  email: 'Email',
  phone: 'Phone',
  company: 'Company',
  optional: 'optional',
  pickDay: 'Day',
  time: 'Time',
  note: 'Note',
  quoteNote: 'What do you need a quote for?',
  send: { CONTACT: 'Send my details', MEETING: 'Request meeting', QUOTE: 'Request quote' },
  sending: 'Sending…',
  done: { CONTACT: 'Details sent', MEETING: 'Meeting requested', QUOTE: 'Quote requested' },
  doneHint: '{{name}} will get back to you.',
  needContact: 'Add an email or a phone number so they can reach you.',
  failed: 'Could not send. Check your connection and try again.',
  previewOnly: 'In the preview, nothing is sent.',

  // Link labels for the generic kinds; brand names stay as they are.
  labels: {
    Call: 'Call',
    Email: 'Email',
    Website: 'Website',
    'Book a meeting': 'Book a meeting',
    'Request a quote': 'Request a quote',
    Directions: 'Directions',
    Location: 'Location',
    Download: 'Download',
    'Save contact': 'Save contact',
  } as Record<string, string>,

  // Passcode-protected profiles
  lockedTitle: 'Private profile',
  lockedBody: '“{{name}}” is protected. Enter its passcode to view it.',
  lockedBodyNoName: 'This profile is protected. Enter its passcode to view it.',
  passcode: 'Passcode',
  unlock: 'Unlock',
  unlocking: 'Unlocking…',
  wrongCode: 'That passcode is not right. Try again.',

  // Beside the card on a computer
  companionTitle: 'Keep this card on your phone',
  companionHint: 'Point your phone camera at the code to open it there, then save the contact.',
};

export type ProfileStrings = typeof EN;

const AR: ProfileStrings = {
  yourName: 'اسمك',
  save: 'حفظ جهة الاتصال',
  saving: 'جارٍ التحضير…',
  saved: 'تم الحفظ',
  exchange: 'تبادل البيانات',
  share: 'مشاركة',
  close: 'إغلاق',
  verified: 'موثّق',
  available: 'متاح الآن',
  respondsIn: 'يرد خلال {{time}}',
  about: 'نبذة',
  readMore: 'اقرأ المزيد',
  showLess: 'عرض أقل',
  links: 'الروابط',
  payments: 'الدفع',
  open: 'فتح',
  poweredBy: 'صُنعت باستخدام',
  profileTag: 'ملف',

  shareTitle: 'شارك هذه البطاقة',
  shareHint: 'امسحها بكاميرا أي هاتف، أو أرسل الرابط.',
  copyLink: 'نسخ الرابط',
  linkCopied: 'نُسخ الرابط',
  shareVia: 'مشاركة عبر…',

  exchangeTitle: 'شارك بياناتك مع {{name}}',
  exchangeHint: 'تصله بياناتك فوراً ويمكنه الرد عليك.',
  intents: { CONTACT: 'بياناتي', MEETING: 'اجتماع', QUOTE: 'عرض سعر' },
  fullName: 'الاسم الكامل',
  email: 'البريد الإلكتروني',
  phone: 'رقم الهاتف',
  company: 'الشركة',
  optional: 'اختياري',
  pickDay: 'اليوم',
  time: 'الوقت',
  note: 'ملاحظة',
  quoteNote: 'ما الذي تحتاج عرض سعر له؟',
  send: { CONTACT: 'أرسل بياناتي', MEETING: 'اطلب اجتماعاً', QUOTE: 'اطلب عرض سعر' },
  sending: 'جارٍ الإرسال…',
  done: { CONTACT: 'أُرسلت بياناتك', MEETING: 'أُرسل طلب الاجتماع', QUOTE: 'أُرسل طلب عرض السعر' },
  doneHint: 'سيتواصل معك {{name}}.',
  needContact: 'أضف بريداً إلكترونياً أو رقم هاتف ليتمكن من التواصل معك.',
  failed: 'تعذّر الإرسال. تحقق من الاتصال وحاول مرة أخرى.',
  previewOnly: 'في المعاينة لا يُرسل أي شيء.',

  labels: {
    Call: 'اتصال',
    Email: 'البريد الإلكتروني',
    Website: 'الموقع الإلكتروني',
    'Book a meeting': 'احجز موعداً',
    'Request a quote': 'اطلب عرض سعر',
    Directions: 'الاتجاهات',
    Location: 'الموقع',
    Download: 'تحميل',
    'Save contact': 'حفظ جهة الاتصال',
  },

  lockedTitle: 'ملف خاص',
  lockedBody: '«{{name}}» محمي. أدخل رمز الدخول لعرضه.',
  lockedBodyNoName: 'هذا الملف محمي. أدخل رمز الدخول لعرضه.',
  passcode: 'رمز الدخول',
  unlock: 'فتح',
  unlocking: 'جارٍ الفتح…',
  wrongCode: 'رمز الدخول غير صحيح. حاول مرة أخرى.',

  companionTitle: 'احتفظ بهذه البطاقة على هاتفك',
  companionHint: 'وجّه كاميرا هاتفك إلى الرمز لتفتحها عليه، ثم احفظ جهة الاتصال.',
};

export function profileStrings(lang: Lang): ProfileStrings {
  return lang === 'ar' ? AR : EN;
}

/** Fills {{name}}-style placeholders. */
export function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => values[k] ?? '');
}
