/** The ready messages a workspace starts with, in the language it first opens them in. */
export const DEFAULT_TEMPLATES: Record<'en' | 'ar', { name: string; channel: 'WHATSAPP' | 'EMAIL'; subject?: string; body: string }[]> = {
  en: [
    {
      name: 'Nice to meet you',
      channel: 'WHATSAPP',
      body: "Hi {{first_name}}, it's {{my_name}} from {{my_company}}. It was great meeting you! All my details are here: {{card_link}}",
    },
    {
      name: 'Following up',
      channel: 'WHATSAPP',
      body: 'Hi {{first_name}}, just following up on our conversation. Would a quick call this week suit you?',
    },
    {
      name: 'Your quote',
      channel: 'WHATSAPP',
      body: 'Hi {{first_name}}, thanks for your interest. To prepare your quote, could you confirm the quantities and when you need it?',
    },
    {
      name: 'Thanks for connecting',
      channel: 'EMAIL',
      subject: 'Great to meet you, {{first_name}}',
      body: "Hi {{first_name}},\n\nThank you for your time today. It was a pleasure meeting you.\n\nYou'll find all my details here: {{card_link}}\n\nI'd be glad to continue our conversation whenever suits you.\n\nBest regards,\n{{my_name}}\n{{my_company}}",
    },
  ],
  ar: [
    {
      name: 'سعدت بلقائك',
      channel: 'WHATSAPP',
      body: 'أهلاً {{first_name}}، معك {{my_name}} من {{my_company}}. سعدت جداً بلقائك! كل بياناتي هنا: {{card_link}}',
    },
    {
      name: 'متابعة',
      channel: 'WHATSAPP',
      body: 'أهلاً {{first_name}}، أتابع معك بخصوص حديثنا. هل يناسبك اتصال سريع هذا الأسبوع؟',
    },
    {
      name: 'عرض السعر',
      channel: 'WHATSAPP',
      body: 'أهلاً {{first_name}}، شكراً لاهتمامك. لتجهيز عرض السعر، هل يمكنك تأكيد الكميات والموعد المطلوب؟',
    },
    {
      name: 'شكراً على وقتك',
      channel: 'EMAIL',
      subject: 'سعدت بلقائك يا {{first_name}}',
      body: 'أهلاً {{first_name}}،\n\nشكراً على وقتك اليوم، سعدت جداً بلقائك.\n\nكل بياناتي هنا: {{card_link}}\n\nيسعدني أن نكمل حديثنا في الوقت الذي يناسبك.\n\nمع خالص التحية،\n{{my_name}}\n{{my_company}}',
    },
  ],
};
