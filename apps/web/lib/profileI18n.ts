export type Lang = 'en' | 'ar';

export interface ProfileStrings {
  save: string;
  saving: string;
  saved: string;
  connect: string;
  meeting: string;
  quote: string;
  pickDay: string;
  time: string;
  fullName: string;
  email: string;
  phone: string;
  company: string;
  shareDetails: string;
  requestMeeting: string;
  requestQuote: string;
  sending: string;
  doneContact: string;
  doneMeeting: string;
  doneQuote: string;
  followup: string;
  scanToConnect: string;
  pointCamera: string;
  poweredBy: string;
  noteOptional: string;
  quotePlaceholder: string;
  readMore: string;
  showLess: string;
  share: string;
  copyLink: string;
  copied: string;
  linkCopied: string;
  available: string;
  respondsIn: string;
  connectTitle: string;
  aboutTitle: string;
  paymentsTitle: string;
}

const EN: ProfileStrings = {
  save: 'Save contact',
  saving: 'Preparing…',
  saved: 'Saved to your phone',
  connect: 'Connect',
  meeting: 'Meeting',
  quote: 'Quote',
  pickDay: 'Pick a day',
  time: 'Time',
  fullName: 'Full name',
  email: 'Email',
  phone: 'Phone',
  company: 'Company',
  shareDetails: 'Share my details',
  requestMeeting: 'Request meeting',
  requestQuote: 'Request a quote',
  sending: 'Sending…',
  doneContact: 'Details shared',
  doneMeeting: 'Meeting requested',
  doneQuote: 'Quote request sent',
  followup: "You'll hear back shortly.",
  scanToConnect: 'Scan to connect',
  pointCamera: 'Point any phone camera here',
  poweredBy: 'Powered by',
  noteOptional: 'Add a note (optional)',
  quotePlaceholder: 'What do you need a quote for?',
  readMore: 'Read more',
  showLess: 'Show less',
  share: 'Share',
  copyLink: 'Copy link',
  copied: 'Copied!',
  linkCopied: 'Link copied to clipboard',
  available: 'Available now',
  respondsIn: 'Responds in',
  connectTitle: 'Connect',
  aboutTitle: 'About',
  paymentsTitle: 'Payments',
};

const AR: ProfileStrings = {
  save: 'حفظ جهة الاتصال',
  saving: 'جارٍ التحضير…',
  saved: 'تم الحفظ في هاتفك',
  connect: 'تواصل',
  meeting: 'اجتماع',
  quote: 'عرض سعر',
  pickDay: 'اختر يوماً',
  time: 'الوقت',
  fullName: 'الاسم الكامل',
  email: 'البريد الإلكتروني',
  phone: 'رقم الهاتف',
  company: 'الشركة',
  shareDetails: 'أرسل بياناتي',
  requestMeeting: 'طلب اجتماع',
  requestQuote: 'طلب عرض سعر',
  sending: 'جارٍ الإرسال…',
  doneContact: 'تم إرسال بياناتك',
  doneMeeting: 'تم طلب الاجتماع',
  doneQuote: 'تم إرسال طلب عرض السعر',
  followup: 'سنعاود التواصل معك قريباً.',
  scanToConnect: 'امسح للتواصل',
  pointCamera: 'وجّه كاميرا أي هاتف هنا',
  poweredBy: 'مُشغَّل بواسطة',
  noteOptional: 'أضف ملاحظة (اختياري)',
  quotePlaceholder: 'ما الذي تحتاج عرض سعر له؟',
  readMore: 'اقرأ المزيد',
  showLess: 'عرض أقل',
  share: 'مشاركة',
  copyLink: 'نسخ الرابط',
  copied: 'تم النسخ!',
  linkCopied: 'تم نسخ الرابط',
  available: 'متاح الآن',
  respondsIn: 'يردّ خلال',
  connectTitle: 'تواصل',
  aboutTitle: 'نبذة',
  paymentsTitle: 'المدفوعات',
};

export function profileStrings(lang: Lang): ProfileStrings {
  return lang === 'ar' ? AR : EN;
}
