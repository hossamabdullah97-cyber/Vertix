/**
 * The legal pages (/legal/privacy, /terms, /refunds, /contact): their text in
 * both languages and the company details they name.
 *
 * The details come from the build's environment, so the same text serves
 * whoever runs the platform. Until the support email and address are set the
 * pages say so at the top: a payment provider reviewing the site, or a
 * customer, must not find a policy that names nobody.
 *
 * The text is a starting point written to match what the platform actually
 * does (what it stores, who processes it, how billing works). Have it read by
 * a lawyer before launch, and change LEGAL_UPDATED whenever it changes.
 */

export type LegalDoc = 'privacy' | 'terms' | 'refunds' | 'contact';
export const LEGAL_DOCS: LegalDoc[] = ['privacy', 'terms', 'refunds', 'contact'];
export const LEGAL_UPDATED = '2026-10-03';

export const COMPANY = {
  name: process.env.NEXT_PUBLIC_COMPANY_NAME || 'Vertex Connect',
  email: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || '',
  phone: process.env.NEXT_PUBLIC_SUPPORT_PHONE || '',
  address: process.env.NEXT_PUBLIC_COMPANY_ADDRESS || '',
};
export const COMPANY_DETAILS_MISSING = !COMPANY.email || !COMPANY.address;

export interface LegalSection {
  h: string;
  p: string[];
}
export interface LegalText {
  title: string;
  summary: string;
  sections: LegalSection[];
}

interface Strings {
  nav: Record<LegalDoc, string>;
  updated: string;
  missing: string;
  contact: { title: string; summary: string; email: string; phone: string; address: string; hours: string; hoursValue: string; notSet: string };
  docs: Record<Exclude<LegalDoc, 'contact'>, LegalText>;
}

/** {company}, {email} in the text become the details above. */
export function fillLegal(text: string): string {
  return text.replace(/\{company\}/g, COMPANY.name).replace(/\{email\}/g, COMPANY.email || '—');
}

const en: Strings = {
  nav: { privacy: 'Privacy', terms: 'Terms', refunds: 'Refunds', contact: 'Contact' },
  updated: 'Last updated',
  missing:
    'The company details on these pages are not filled in yet (NEXT_PUBLIC_SUPPORT_EMAIL, NEXT_PUBLIC_COMPANY_ADDRESS).',
  contact: {
    title: 'Contact us',
    summary: 'Questions about your account, a payment, a chip or your data: write to us and a person will answer.',
    email: 'Email',
    phone: 'Phone',
    address: 'Address',
    hours: 'Replies',
    hoursValue: 'Within two working days, Sunday to Thursday.',
    notSet: 'Not set yet',
  },
  docs: {
    privacy: {
      title: 'Privacy policy',
      summary:
        '{company} runs a platform for digital business cards, NFC chips and the leads they bring. This policy says what we collect, why, who helps us process it and what you can ask of us.',
      sections: [
        {
          h: 'Who is responsible',
          p: [
            'For the accounts and workspaces on the platform, {company} is responsible for the data. For the leads a workspace collects through its cards, the workspace (the business that owns the card) decides what they are used for, and we process them on its behalf.',
          ],
        },
        {
          h: 'What we collect',
          p: [
            'Account data: your name, email address, a password (stored only as a one-way hash) or your Google sign-in, your photo if you add one, and the workspaces and roles you belong to.',
            'Card content: whatever you put on a card, such as names, titles, phone numbers, links, photos, files and branding.',
            'Leads: what a visitor chooses to send through a card form (for example name, email, phone, company and message), and the notes and activity your team adds.',
            'Visit and tap data: when a card is opened or a chip is tapped we record the time, the card or chip, the browser and device it reports, the IP address and the page that linked to it, and we give the browser a random identifier so repeat visits are counted once. We use this for the card owner\'s statistics and to prevent abuse, not for advertising.',
            'Payment data: payments are handled by Paymob. We receive the plan, status and dates of a subscription, never your full card number.',
          ],
        },
        {
          h: 'Why we use it',
          p: [
            'To run the service you signed up for: showing cards, routing chip taps, delivering leads to the right people, sending the emails the service needs (invitations, password resets, confirmations, alerts), billing, and keeping accounts secure.',
            'We do not sell personal data, and we do not use it for advertising.',
          ],
        },
        {
          h: 'Who processes it with us',
          p: [
            'We rely on providers who process data only to deliver their part of the service: our hosting provider and file storage (S3-compatible storage such as Cloudflare R2), Resend for email, Paymob for payments, Sentry for error reports, Google for Google sign-in and Google Wallet passes, Apple for Apple Wallet passes, Meta (WhatsApp Business) for WhatsApp alerts a workspace turns on, and Anthropic for reading the text on a photo of a paper business card when you use that feature.',
            'A workspace can also connect its own tools (Slack, webhooks, its CRM); data then goes where the workspace sends it.',
          ],
        },
        {
          h: 'Cookies and local storage',
          p: [
            'We use only what the service needs: cookies that keep you signed in, remember your language and count a visitor once, and local storage for preferences such as recent pages and layout. There are no advertising or third-party tracking cookies.',
          ],
        },
        {
          h: 'How long we keep it',
          p: [
            'As long as the account or workspace exists. When you ask us to delete a workspace, we take it off the service straight away and erase its data within 30 days of the request; backups that still hold it expire 14 days after they were made. Leads stay as long as the workspace that collected them keeps them.',
          ],
        },
        {
          h: 'Your rights',
          p: [
            'You can ask to see, correct, export or delete your personal data, or object to how it is used, as the law allows (including Egypt\'s Personal Data Protection Law No. 151 of 2020). If you left your details on someone\'s card, the business that owns the card is the first place to ask; we will help them answer. Write to {email}.',
          ],
        },
        {
          h: 'Security',
          p: [
            'Connections are encrypted, passwords are hashed, each workspace sees only its own data, sign-in attempts are limited, and access inside a workspace follows the roles its owner assigns. No system is perfectly secure; if a breach affects your data we will tell you and the authorities as the law requires.',
          ],
        },
        {
          h: 'Children',
          p: ['The service is for businesses and is not meant for anyone under 18.'],
        },
        {
          h: 'Changes',
          p: ['If we change this policy in a way that matters, we will say so in the app or by email before it takes effect.'],
        },
      ],
    },
    terms: {
      title: 'Terms of service',
      summary:
        'These terms are the agreement between {company} and you (and the business you sign up for) when you use the platform.',
      sections: [
        {
          h: 'The service',
          p: [
            'Digital business cards, NFC chips that open them, a lead pipeline, team management, statistics and integrations. What each workspace can use depends on its plan, as shown on the pricing page.',
          ],
        },
        {
          h: 'Accounts',
          p: [
            'Give accurate details, keep your password private and confirm your email address. You are responsible for what happens under your account. A workspace owner is responsible for the members they invite and the roles they give them.',
          ],
        },
        {
          h: 'Acceptable use',
          p: [
            'Do not use the service to send spam, mislead people or impersonate someone, publish unlawful or harmful content, collect personal data without a lawful basis, or attack, overload or reverse-engineer the platform. We may remove content or suspend an account that does.',
          ],
        },
        {
          h: 'Your content and your leads',
          p: [
            'What you put on cards and the leads you collect remain yours. You give us permission to store, process and display them only to run the service. You are responsible for having the right to publish your content and for using leads lawfully.',
          ],
        },
        {
          h: 'NFC chips',
          p: [
            'The platform works with chips issued by {company}. A chip opens the card it is linked to in your workspace, and you can relink or switch it off at any time. A chip locked when it was programmed cannot be rewritten by anyone.',
          ],
        },
        {
          h: 'Plans and payment',
          p: [
            'Paid plans are billed monthly in Egyptian pounds through Paymob at the price shown when you subscribe, and renew automatically until cancelled. You can cancel at any time; the plan stays active until the end of the period already paid for, then the workspace moves to the free plan. We will give at least 30 days\' notice of any price change. Refunds are covered by the refund policy.',
          ],
        },
        {
          h: 'Availability',
          p: [
            'We work to keep the service running and your data safe, but we do not promise it will be uninterrupted or error-free. Planned maintenance will be announced when it could affect you.',
          ],
        },
        {
          h: 'Suspension and ending',
          p: [
            'You may stop using the service and ask us to delete your workspace at any time. We may suspend or close an account that breaks these terms or the law, or that does not pay, telling you why unless the law prevents it.',
          ],
        },
        {
          h: 'Liability',
          p: [
            'As far as the law allows, {company} is not liable for indirect losses such as lost profits or lost opportunities, and its total liability for any claim is limited to the fees the workspace paid in the 12 months before it.',
          ],
        },
        {
          h: 'Law and disputes',
          p: [
            'These terms are governed by the laws of the Arab Republic of Egypt. We will try to settle any dispute by talking first; otherwise the courts of Cairo will decide it.',
          ],
        },
        {
          h: 'Changes',
          p: ['We will tell you about important changes to these terms before they apply. Continuing to use the service after that means you accept them.'],
        },
      ],
    },
    refunds: {
      title: 'Refund and cancellation policy',
      summary: 'How cancelling a plan works, and when you can have your money back.',
      sections: [
        {
          h: 'Cancelling a plan',
          p: [
            'Cancel at any time from Billing in your workspace. No further payments are taken, and the plan stays active until the end of the month already paid for.',
          ],
        },
        {
          h: 'Subscription refunds',
          p: [
            'Payments for a period that has started are not refunded in part. We do refund in full a payment taken by mistake, a duplicate payment, or a period in which the service was unavailable to you for a long time because of us. Ask within 14 days of the payment.',
          ],
        },
        {
          h: 'NFC chips and printed cards',
          p: [
            'A chip or card that arrives faulty, or stops working through no misuse within 14 days of delivery, is replaced, or refunded if a replacement is not possible. Cards printed to your design cannot be returned unless they are faulty.',
          ],
        },
        {
          h: 'How to ask',
          p: [
            'Write to {email} with your workspace name and the payment date. We reply within two working days. Approved refunds go back to the original payment method through Paymob; when they appear depends on your bank, usually within 14 working days.',
          ],
        },
      ],
    },
  },
};

const ar: Strings = {
  nav: { privacy: 'الخصوصية', terms: 'الشروط', refunds: 'الاسترداد', contact: 'تواصل معنا' },
  updated: 'آخر تحديث',
  missing: 'بيانات الشركة في هذه الصفحات لم تُضبط بعد (NEXT_PUBLIC_SUPPORT_EMAIL و NEXT_PUBLIC_COMPANY_ADDRESS).',
  contact: {
    title: 'تواصل معنا',
    summary: 'أسئلة عن حسابك أو دفعة أو شريحة أو بياناتك: راسلنا وسيرد عليك شخص من فريقنا.',
    email: 'البريد الإلكتروني',
    phone: 'الهاتف',
    address: 'العنوان',
    hours: 'الرد',
    hoursValue: 'خلال يومي عمل، من الأحد إلى الخميس.',
    notSet: 'لم يُضبط بعد',
  },
  docs: {
    privacy: {
      title: 'سياسة الخصوصية',
      summary:
        'تدير {company} منصة لبطاقات الأعمال الرقمية وشرائح NFC والعملاء المحتملين الذين تجلبهم. توضح هذه السياسة ما نجمعه ولماذا، ومن يساعدنا في معالجته، وما يمكنك أن تطلبه منا.',
      sections: [
        {
          h: 'من المسؤول',
          p: [
            'بالنسبة للحسابات ومساحات العمل على المنصة، {company} هي المسؤولة عن البيانات. أما العملاء المحتملون الذين تجمعهم مساحة العمل عبر بطاقاتها، فمساحة العمل (النشاط التجاري صاحب البطاقة) هي التي تحدد كيفية استخدامهم، ونحن نعالج بياناتهم نيابة عنها.',
          ],
        },
        {
          h: 'ما الذي نجمعه',
          p: [
            'بيانات الحساب: اسمك وبريدك الإلكتروني وكلمة المرور (نحفظها مشفّرة تشفيراً أحادي الاتجاه فقط) أو تسجيل دخولك بحساب Google، وصورتك إن أضفتها، ومساحات العمل والأدوار التي تنتمي إليها.',
            'محتوى البطاقات: كل ما تضعه على البطاقة، مثل الأسماء والمسميات الوظيفية وأرقام الهواتف والروابط والصور والملفات والهوية البصرية.',
            'العملاء المحتملون: ما يختار الزائر إرساله عبر نموذج البطاقة (مثل الاسم والبريد والهاتف والشركة والرسالة)، والملاحظات والأنشطة التي يضيفها فريقك.',
            'بيانات الزيارات واللمسات: عند فتح بطاقة أو لمس شريحة نسجّل الوقت والبطاقة أو الشريحة، والمتصفح والجهاز كما يعرّفان نفسيهما، وعنوان IP، والصفحة التي جاء منها الزائر، ونمنح المتصفح معرّفاً عشوائياً حتى تُحسب الزيارات المتكررة مرة واحدة. نستخدم ذلك لإحصاءات صاحب البطاقة ولمنع إساءة الاستخدام، لا للإعلانات.',
            'بيانات الدفع: تتم المدفوعات عبر Paymob. نتلقى الخطة وحالة الاشتراك وتواريخه، ولا نتلقى رقم بطاقتك كاملاً أبداً.',
          ],
        },
        {
          h: 'لماذا نستخدمها',
          p: [
            'لتشغيل الخدمة التي اشتركت فيها: عرض البطاقات، وتوجيه لمسات الشرائح، وإيصال العملاء المحتملين إلى الأشخاص المعنيين، وإرسال الرسائل التي تحتاجها الخدمة (الدعوات واستعادة كلمة المرور والتأكيدات والتنبيهات)، والفوترة، وحماية الحسابات.',
            'لا نبيع البيانات الشخصية، ولا نستخدمها للإعلانات.',
          ],
        },
        {
          h: 'من يعالجها معنا',
          p: [
            'نعتمد على مزوّدين يعالجون البيانات فقط لتقديم جزئهم من الخدمة: مزوّد الاستضافة وتخزين الملفات (تخزين متوافق مع S3 مثل Cloudflare R2)، وResend للبريد الإلكتروني، وPaymob للمدفوعات، وSentry لتقارير الأخطاء، وGoogle لتسجيل الدخول بحساب Google وبطاقات Google Wallet، وApple لبطاقات Apple Wallet، وMeta (واتساب للأعمال) لتنبيهات واتساب التي تفعّلها مساحة العمل، وAnthropic لقراءة النص من صورة بطاقة أعمال ورقية عند استخدامك هذه الميزة.',
            'يمكن لمساحة العمل أيضاً ربط أدواتها الخاصة (Slack وwebhooks ونظام CRM الخاص بها)، وعندها تذهب البيانات إلى حيث ترسلها مساحة العمل.',
          ],
        },
        {
          h: 'ملفات تعريف الارتباط والتخزين المحلي',
          p: [
            'نستخدم فقط ما تحتاجه الخدمة: ملفات تعريف ارتباط تبقيك مسجّلاً للدخول، وتتذكر لغتك، وتحسب الزائر مرة واحدة، والتخزين المحلي لتفضيلات مثل الصفحات الأخيرة وطريقة العرض. لا توجد ملفات تعريف ارتباط إعلانية أو للتتبع من جهات خارجية.',
          ],
        },
        {
          h: 'مدة الاحتفاظ',
          p: [
            'طوال وجود الحساب أو مساحة العمل. عندما تطلب منا حذف مساحة عمل، نوقفها على الخدمة فوراً ونمحو بياناتها خلال 30 يوماً من الطلب، أما النسخ الاحتياطية التي ما زالت تحتويها فتنتهي صلاحيتها بعد 14 يوماً من إنشائها. يبقى العملاء المحتملون ما دامت مساحة العمل التي جمعتهم تحتفظ بهم.',
          ],
        },
        {
          h: 'حقوقك',
          p: [
            'يمكنك طلب الاطلاع على بياناتك الشخصية أو تصحيحها أو تصديرها أو حذفها، أو الاعتراض على طريقة استخدامها، وفق ما يسمح به القانون (بما في ذلك قانون حماية البيانات الشخصية المصري رقم 151 لسنة 2020). إن كنت قد تركت بياناتك على بطاقة شخص ما، فالنشاط التجاري صاحب البطاقة هو أول من تسأله، وسنساعده في الرد. راسلنا على {email}.',
          ],
        },
        {
          h: 'الأمان',
          p: [
            'الاتصالات مشفّرة، وكلمات المرور مشفّرة، وكل مساحة عمل لا ترى إلا بياناتها، ومحاولات تسجيل الدخول محدودة، والصلاحيات داخل مساحة العمل تتبع الأدوار التي يحددها مالكها. لا يوجد نظام آمن تماماً؛ وإن تعرّضت بياناتك لاختراق فسنبلغك ونبلغ الجهات المختصة وفق ما يقتضيه القانون.',
          ],
        },
        {
          h: 'الأطفال',
          p: ['الخدمة موجّهة للأنشطة التجارية وليست مخصصة لمن هم دون 18 عاماً.'],
        },
        {
          h: 'التغييرات',
          p: ['إذا غيّرنا هذه السياسة تغييراً مهماً، فسنعلن ذلك في التطبيق أو بالبريد الإلكتروني قبل سريانه.'],
        },
      ],
    },
    terms: {
      title: 'شروط الاستخدام',
      summary: 'هذه الشروط هي الاتفاق بين {company} وبينك (وبين النشاط التجاري الذي تسجّل له) عند استخدامك المنصة.',
      sections: [
        {
          h: 'الخدمة',
          p: [
            'بطاقات أعمال رقمية، وشرائح NFC تفتحها، ومسار لإدارة العملاء المحتملين، وإدارة الفريق، والإحصاءات، والتكاملات. ما يمكن لكل مساحة عمل استخدامه يعتمد على خطتها كما هو موضح في صفحة الأسعار.',
          ],
        },
        {
          h: 'الحسابات',
          p: [
            'قدّم بيانات صحيحة، وحافظ على سرية كلمة المرور، وأكّد بريدك الإلكتروني. أنت مسؤول عما يحدث من خلال حسابك. ومالك مساحة العمل مسؤول عن الأعضاء الذين يدعوهم والأدوار التي يمنحها لهم.',
          ],
        },
        {
          h: 'الاستخدام المقبول',
          p: [
            'لا تستخدم الخدمة لإرسال رسائل مزعجة، أو تضليل الناس أو انتحال شخصية أحد، أو نشر محتوى غير قانوني أو ضار، أو جمع بيانات شخصية دون سند قانوني، أو مهاجمة المنصة أو إثقالها أو محاولة الهندسة العكسية لها. يحق لنا إزالة المحتوى أو إيقاف الحساب الذي يفعل ذلك.',
          ],
        },
        {
          h: 'محتواك وعملاؤك',
          p: [
            'ما تضعه على البطاقات والعملاء المحتملون الذين تجمعهم يبقون ملكاً لك. وتمنحنا الإذن بتخزينهم ومعالجتهم وعرضهم فقط لتشغيل الخدمة. وأنت مسؤول عن امتلاك حق نشر محتواك وعن استخدام بيانات العملاء استخداماً قانونياً.',
          ],
        },
        {
          h: 'شرائح NFC',
          p: [
            'تعمل المنصة مع الشرائح الصادرة من {company}. تفتح الشريحة البطاقة المربوطة بها في مساحة عملك، ويمكنك إعادة ربطها أو إيقافها في أي وقت. الشريحة التي قُفلت عند برمجتها لا يمكن لأحد إعادة الكتابة عليها.',
          ],
        },
        {
          h: 'الخطط والدفع',
          p: [
            'تُحصَّل الخطط المدفوعة شهرياً بالجنيه المصري عبر Paymob بالسعر المعروض عند الاشتراك، وتتجدد تلقائياً حتى إلغائها. يمكنك الإلغاء في أي وقت، وتبقى الخطة فعّالة حتى نهاية الفترة المدفوعة ثم تنتقل مساحة العمل إلى الخطة المجانية. سنخطرك قبل 30 يوماً على الأقل من أي تغيير في الأسعار. وتنظّم سياسة الاسترداد حالات استرداد المبالغ.',
          ],
        },
        {
          h: 'توفر الخدمة',
          p: [
            'نعمل على إبقاء الخدمة متاحة وبياناتك آمنة، لكننا لا نضمن أن تعمل دون انقطاع أو أخطاء. وسنعلن مسبقاً عن الصيانة المخطط لها إن كانت قد تؤثر عليك.',
          ],
        },
        {
          h: 'الإيقاف والإنهاء',
          p: [
            'يمكنك التوقف عن استخدام الخدمة وطلب حذف مساحة عملك في أي وقت. ويحق لنا إيقاف أو إغلاق الحساب الذي يخالف هذه الشروط أو القانون أو لا يسدد المستحقات، مع إبلاغك بالسبب ما لم يمنع القانون ذلك.',
          ],
        },
        {
          h: 'المسؤولية',
          p: [
            'في حدود ما يسمح به القانون، لا تتحمل {company} المسؤولية عن الخسائر غير المباشرة مثل فوات الأرباح أو الفرص، ويقتصر إجمالي مسؤوليتها عن أي مطالبة على الرسوم التي دفعتها مساحة العمل خلال الاثني عشر شهراً السابقة لها.',
          ],
        },
        {
          h: 'القانون والنزاعات',
          p: [
            'تخضع هذه الشروط لقوانين جمهورية مصر العربية. سنحاول تسوية أي نزاع بالتفاهم أولاً، وإلا تختص محاكم القاهرة بالفصل فيه.',
          ],
        },
        {
          h: 'التغييرات',
          p: ['سنبلغك بالتغييرات المهمة على هذه الشروط قبل سريانها، واستمرارك في استخدام الخدمة بعد ذلك يعني قبولك لها.'],
        },
      ],
    },
    refunds: {
      title: 'سياسة الاسترداد والإلغاء',
      summary: 'كيف يتم إلغاء الخطة، ومتى يمكنك استرداد أموالك.',
      sections: [
        {
          h: 'إلغاء الخطة',
          p: [
            'ألغِ في أي وقت من صفحة الفوترة في مساحة عملك. لن تُحصَّل أي مدفوعات أخرى، وتبقى الخطة فعّالة حتى نهاية الشهر المدفوع.',
          ],
        },
        {
          h: 'استرداد مبالغ الاشتراك',
          p: [
            'لا تُسترد مدفوعات الفترة التي بدأت بشكل جزئي. لكننا نرد المبلغ كاملاً عن الدفعة التي خُصمت بالخطأ، أو الدفعة المكررة، أو الفترة التي تعذّر عليك فيها استخدام الخدمة لمدة طويلة بسببنا. قدّم الطلب خلال 14 يوماً من تاريخ الدفع.',
          ],
        },
        {
          h: 'شرائح NFC والبطاقات المطبوعة',
          p: [
            'الشريحة أو البطاقة التي تصل معيبة، أو تتوقف عن العمل دون سوء استخدام خلال 14 يوماً من الاستلام، تُستبدل، أو يُرد ثمنها إن تعذّر الاستبدال. البطاقات المطبوعة بتصميمك لا تُرتجع إلا إذا كانت معيبة.',
          ],
        },
        {
          h: 'طريقة الطلب',
          p: [
            'راسلنا على {email} باسم مساحة العمل وتاريخ الدفع، وسنرد خلال يومي عمل. تُرد المبالغ الموافق عليها إلى وسيلة الدفع الأصلية عبر Paymob، ويعتمد موعد ظهورها على البنك، وعادةً خلال 14 يوم عمل.',
          ],
        },
      ],
    },
  },
};

export const LEGAL_STRINGS: Record<'en' | 'ar', Strings> = { en, ar };
