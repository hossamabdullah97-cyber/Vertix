/**
 * The public API, described once: the endpoints an API key or personal access
 * token may call, what each takes and returns, and the webhook events. The API
 * serves it as OpenAPI (GET /api/openapi.json) and the web app renders it at
 * /developers, in English and Arabic.
 *
 * A spec in the API checks every endpoint here against the real route and the
 * scope it requires, so this can't drift from the code without a test failing.
 * Imported by deep path (@vertex/shared/dist/api-reference) so the app's own
 * pages don't carry it.
 */

export type Text = { en: string; ar: string };

export type ApiMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface ApiField {
  name: string;
  /** string | number | boolean | object | string[] | date-time … */
  type: string;
  required?: boolean;
  enum?: readonly string[];
  nullable?: boolean;
  desc: Text;
}

export interface ApiEndpoint {
  id: string;
  group: ApiGroupId;
  method: ApiMethod;
  /** OpenAPI style: /leads/{id} */
  path: string;
  scope: string;
  /** Workspace roles that may call it with a personal access token; omitted = everyone. */
  roles?: readonly string[];
  summary: Text;
  desc?: Text;
  pathParams?: ApiField[];
  query?: ApiField[];
  body?: ApiField[];
  /** HTTP status on success. */
  status: number;
  request?: unknown;
  response: unknown;
}

export type ApiGroupId = 'leads' | 'tasks' | 'cards' | 'chips' | 'webhooks';

export const API_GROUPS: { id: ApiGroupId; title: Text; desc: Text }[] = [
  {
    id: 'leads',
    title: { en: 'Leads', ar: 'العملاء المحتملون' },
    desc: {
      en: 'People who left their details on a card, were imported, or were added by hand.',
      ar: 'الأشخاص الذين تركوا بياناتهم في بطاقة، أو استُوردوا، أو أُضيفوا يدويًا.',
    },
  },
  {
    id: 'tasks',
    title: { en: 'Tasks', ar: 'المهام' },
    desc: { en: 'Follow-ups with a due date, on a lead or on their own.', ar: 'متابعات لها موعد، على عميل أو مستقلة.' },
  },
  {
    id: 'cards',
    title: { en: 'Cards', ar: 'البطاقات' },
    desc: { en: 'The digital business cards in the workspace.', ar: 'بطاقات الأعمال الرقمية في مساحة العمل.' },
  },
  {
    id: 'chips',
    title: { en: 'NFC chips', ar: 'شرائح NFC' },
    desc: { en: 'The chips the workspace holds, and the card each opens.', ar: 'الشرائح التي تملكها مساحة العمل، والبطاقة التي تفتحها كل منها.' },
  },
  {
    id: 'webhooks',
    title: { en: 'Webhooks', ar: 'الـ Webhooks' },
    desc: { en: 'Addresses of yours that events are sent to as they happen.', ar: 'عناوين لديك تُرسَل إليها الأحداث فور وقوعها.' },
  },
];

export const SCOPE_DOCS: { scope: string; desc: Text }[] = [
  { scope: 'crm:read', desc: { en: 'Read leads, stages, fields and tasks.', ar: 'قراءة العملاء والمراحل والحقول والمهام.' } },
  { scope: 'crm:write', desc: { en: 'Add and change leads, their activity, and tasks.', ar: 'إضافة العملاء ونشاطهم والمهام وتعديلها.' } },
  { scope: 'cards:read', desc: { en: 'Read cards.', ar: 'قراءة البطاقات.' } },
  { scope: 'cards:write', desc: { en: 'Create cards.', ar: 'إنشاء البطاقات.' } },
  { scope: 'nfc:read', desc: { en: 'Read NFC chips.', ar: 'قراءة شرائح NFC.' } },
  { scope: 'integration:read', desc: { en: 'Read webhook endpoints.', ar: 'قراءة عناوين الـ Webhooks.' } },
  { scope: 'integration:write', desc: { en: 'Add webhook endpoints.', ar: 'إضافة عناوين Webhooks.' } },
];

const id: ApiField = { name: 'id', type: 'string', required: true, desc: { en: 'The record’s id.', ar: 'معرّف السجل.' } };

const LEAD = {
  id: 'cm3k9x2lead01',
  name: 'Mona Adel',
  email: 'mona@nile.example',
  phone: '+201001234567',
  company: 'Nile Co',
  score: 40,
  value: 25000,
  temperature: 'HOT',
  source: 'card',
  stageId: 'cm3k9x2stage2',
  assignedTo: null,
  firstContactedAt: null,
  lastContactedAt: null,
  createdAt: '2026-10-06T09:14:00.000Z',
  customFields: { cm3k9x2field1: 'Real estate' },
  card: { slug: 'omar-saeed' },
};

const TASK = {
  id: 'cm3k9x2task01',
  title: 'Send the price list',
  notes: null,
  priority: 'HIGH',
  dueDate: '2026-10-08T09:00:00.000Z',
  completed: false,
  completedAt: null,
  leadId: 'cm3k9x2lead01',
  createdAt: '2026-10-06T09:20:00.000Z',
  lead: { id: 'cm3k9x2lead01', name: 'Mona Adel' },
};

const TAG = {
  id: 'cm3k9x2tag001',
  uid: '04A2B3C4D5E6F7',
  status: 'ACTIVE',
  hardwareType: 'CARD',
  cardId: 'cm3k9x2card01',
  assignedUserId: 'cm3k9x2user01',
  batchId: null,
  activationCount: 128,
  lastScanAt: '2026-10-05T16:02:00.000Z',
  createdAt: '2026-09-01T10:00:00.000Z',
};

const leadText = (en: string, ar: string, extra: Partial<ApiField> = {}): ApiField => ({ name: '', type: 'string', desc: { en, ar }, ...extra });

export const API_ENDPOINTS: ApiEndpoint[] = [
  // ── Leads ──
  {
    id: 'listLeads',
    group: 'leads',
    method: 'GET',
    path: '/leads',
    scope: 'crm:read',
    summary: { en: 'List leads', ar: 'قائمة العملاء' },
    desc: {
      en: 'Every lead the caller can see, newest first. A key sees the whole workspace; a personal token sees what its owner sees.',
      ar: 'كل العملاء الذين يراهم المستدعي، الأحدث أولًا. المفتاح يرى مساحة العمل كلها؛ والرمز الشخصي يرى ما يراه صاحبه.',
    },
    status: 200,
    response: [LEAD],
  },
  {
    id: 'createLead',
    group: 'leads',
    method: 'POST',
    path: '/leads',
    scope: 'crm:write',
    summary: { en: 'Add a lead', ar: 'إضافة عميل' },
    desc: { en: 'Needs at least a name, an email or a phone number.', ar: 'يحتاج على الأقل إلى اسم أو بريد أو رقم هاتف.' },
    body: [
      { ...leadText('Full name.', 'الاسم الكامل.'), name: 'name' },
      { ...leadText('Email address.', 'البريد الإلكتروني.'), name: 'email' },
      { ...leadText('Phone number, ideally with its country code.', 'رقم الهاتف، ويُفضّل مع رمز الدولة.'), name: 'phone' },
      { ...leadText('Company.', 'الشركة.'), name: 'company' },
      { ...leadText('Job title.', 'المسمّى الوظيفي.'), name: 'title' },
      { ...leadText('Website.', 'الموقع.'), name: 'website' },
      { ...leadText('Address.', 'العنوان.'), name: 'address' },
      { ...leadText('A first note, kept in the lead’s activity.', 'ملاحظة أولى تُحفظ في نشاط العميل.'), name: 'note' },
      { ...leadText('Where it came from. Default: manual.', 'المصدر. الافتراضي: manual.', { enum: ['manual', 'card_scan', 'in_person'] }), name: 'source' },
    ],
    status: 201,
    request: { name: 'Mona Adel', email: 'mona@nile.example', phone: '+201001234567', company: 'Nile Co', note: 'Met at Cairo ICT' },
    response: {
      id: LEAD.id,
      name: LEAD.name,
      email: LEAD.email,
      phone: LEAD.phone,
      company: LEAD.company,
      score: 0,
      value: 0,
      temperature: 'COLD',
      source: 'manual',
      stageId: 'cm3k9x2stage1',
      createdAt: LEAD.createdAt,
      card: null,
    },
  },
  {
    id: 'getLead',
    group: 'leads',
    method: 'GET',
    path: '/leads/{id}',
    scope: 'crm:read',
    summary: { en: 'Get a lead', ar: 'عرض عميل' },
    desc: { en: 'The lead with its activity: notes, calls, messages, stage changes and meetings, newest first.', ar: 'العميل مع نشاطه: الملاحظات والمكالمات والرسائل وتغيير المراحل والمواعيد، الأحدث أولًا.' },
    pathParams: [id],
    status: 200,
    response: {
      ...LEAD,
      activities: [
        {
          id: 'cm3k9x2act001',
          type: 'NOTE',
          metadata: { note: 'Wants a demo next week', by: 'cm3k9x2user01' },
          createdAt: '2026-10-06T10:00:00.000Z',
          author: { id: 'cm3k9x2user01', name: 'Omar Saeed' },
        },
      ],
    },
  },
  {
    id: 'leadTimeline',
    group: 'leads',
    method: 'GET',
    path: '/leads/{id}/timeline',
    scope: 'crm:read',
    summary: { en: 'Get a lead’s timeline', ar: 'سجل العميل' },
    desc: {
      en: 'Everything that happened with the lead, newest first: their visits to your cards (before and after they left their details, with what they tapped), activity, tasks and when they were captured. With a summary.',
      ar: 'كل ما حدث مع العميل، الأحدث أولًا: زياراته لبطاقاتك (قبل ترك بياناته وبعدها، وما ضغط عليه)، والنشاط، والمهام، ووقت تسجيله. مع ملخص.',
    },
    pathParams: [id],
    status: 200,
    response: {
      items: [
        {
          kind: 'visit',
          id: 'visit-cm3k9x2evt009',
          at: '2026-10-07T09:12:00.000Z',
          endedAt: '2026-10-07T09:15:30.000Z',
          card: { id: 'cm3k9x2card01', name: 'Omar Saeed' },
          returning: true,
          tapped: false,
          actions: [{ type: 'CLICK', at: '2026-10-07T09:14:00.000Z', action: 'WHATSAPP' }],
        },
        { kind: 'activity', id: 'cm3k9x2act001', at: '2026-10-06T10:00:00.000Z', type: 'CALL', metadata: { note: 'Wants a demo', by: 'cm3k9x2user01' }, author: { id: 'cm3k9x2user01', name: 'Omar Saeed', avatarUrl: null } },
        { kind: 'task', id: 'task-cm3k9x2task1', at: '2026-10-06T10:05:00.000Z', event: 'created', title: 'Send the offer', dueDate: '2026-10-08T09:00:00.000Z', completed: false, assignee: null },
        { kind: 'created', id: `created-${LEAD.id}`, at: LEAD.createdAt, source: 'card_form', card: { id: 'cm3k9x2card01', name: 'Omar Saeed' }, tag: null },
      ],
      summary: { visits: 3, returns: 1, firstVisitAt: '2026-10-05T18:01:00.000Z', lastVisitAt: '2026-10-07T09:12:00.000Z', contacts: 1, lastContactAt: '2026-10-06T10:00:00.000Z', notes: 0, openTasks: 1, overdueTasks: 0 },
    },
  },
  {
    id: 'updateLead',
    group: 'leads',
    method: 'PATCH',
    path: '/leads/{id}',
    scope: 'crm:write',
    summary: { en: 'Update a lead', ar: 'تعديل عميل' },
    desc: { en: 'Send only what changes. An empty string or null clears a text field.', ar: 'أرسل ما يتغير فقط. النص الفارغ أو null يمسح الحقل.' },
    pathParams: [id],
    body: [
      { name: 'stageId', type: 'string', nullable: true, desc: { en: 'A stage from GET /leads/stages.', ar: 'مرحلة من GET /leads/stages.' } },
      { name: 'temperature', type: 'string', enum: ['COLD', 'WARM', 'HOT'], desc: { en: 'How interested they are.', ar: 'مدى اهتمامه.' } },
      { name: 'value', type: 'number', desc: { en: 'Expected deal value, in whole currency units.', ar: 'القيمة المتوقعة للصفقة بوحدات العملة.' } },
      { name: 'name', type: 'string', nullable: true, desc: { en: 'Full name.', ar: 'الاسم الكامل.' } },
      { name: 'email', type: 'string', nullable: true, desc: { en: 'Email address.', ar: 'البريد الإلكتروني.' } },
      { name: 'phone', type: 'string', nullable: true, desc: { en: 'Phone number.', ar: 'رقم الهاتف.' } },
      { name: 'company', type: 'string', nullable: true, desc: { en: 'Company.', ar: 'الشركة.' } },
      {
        name: 'customFields',
        type: 'object',
        desc: { en: 'Your own fields by field id (GET /leads/fields); null clears one.', ar: 'حقولك الخاصة حسب معرّف الحقل (GET /leads/fields)؛ وnull يمسح الحقل.' },
      },
    ],
    status: 200,
    request: { stageId: 'cm3k9x2stage3', temperature: 'HOT', value: 40000 },
    response: { id: LEAD.id, stageId: 'cm3k9x2stage3', temperature: 'HOT', value: 40000, name: LEAD.name, email: LEAD.email, phone: LEAD.phone, company: LEAD.company, customFields: LEAD.customFields },
  },
  {
    id: 'addLeadActivity',
    group: 'leads',
    method: 'POST',
    path: '/leads/{id}/activities',
    scope: 'crm:write',
    summary: { en: 'Log activity on a lead', ar: 'تسجيل نشاط على عميل' },
    desc: { en: 'A note, or a call, email, WhatsApp message or meeting that happened.', ar: 'ملاحظة، أو مكالمة أو بريد أو رسالة واتساب أو لقاء حدث.' },
    pathParams: [id],
    body: [
      { name: 'type', type: 'string', required: true, enum: ['NOTE', 'CALL', 'EMAIL', 'WHATSAPP', 'MEETING'], desc: { en: 'What happened.', ar: 'ما الذي حدث.' } },
      { name: 'note', type: 'string', desc: { en: 'What was said or agreed (up to 2,000 characters).', ar: 'ما قيل أو اتُّفق عليه (حتى 2000 حرف).' } },
      { name: 'meetingAt', type: 'date-time', desc: { en: 'For a MEETING: when.', ar: 'للقاء: موعده.' } },
    ],
    status: 201,
    request: { type: 'CALL', note: 'Called, sending the offer tomorrow' },
    response: {
      id: 'cm3k9x2act002',
      type: 'CALL',
      metadata: { note: 'Called, sending the offer tomorrow', meetingAt: null, manual: true, by: 'cm3k9x2user01' },
      createdAt: '2026-10-06T11:00:00.000Z',
    },
  },
  {
    id: 'listStages',
    group: 'leads',
    method: 'GET',
    path: '/leads/stages',
    scope: 'crm:read',
    summary: { en: 'List pipeline stages', ar: 'قائمة مراحل البيع' },
    status: 200,
    response: [
      { id: 'cm3k9x2stage1', name: 'New', order: 0, color: '#6366f1' },
      { id: 'cm3k9x2stage2', name: 'Contacted', order: 1, color: '#0ea5e9' },
    ],
  },
  {
    id: 'listFields',
    group: 'leads',
    method: 'GET',
    path: '/leads/fields',
    scope: 'crm:read',
    summary: { en: 'List your lead fields', ar: 'قائمة حقول العملاء الخاصة' },
    desc: { en: 'The workspace’s own fields, in order. Use their ids in customFields.', ar: 'حقول مساحة العمل الخاصة بالترتيب. استخدم معرّفاتها في customFields.' },
    status: 200,
    response: [{ id: 'cm3k9x2field1', label: 'Industry', type: 'SELECT', options: ['Retail', 'Real estate'], order: 0 }],
  },

  // ── Tasks ──
  {
    id: 'listTasks',
    group: 'tasks',
    method: 'GET',
    path: '/tasks',
    scope: 'crm:read',
    summary: { en: 'List tasks', ar: 'قائمة المهام' },
    desc: { en: 'Open tasks first, by due date.', ar: 'المهام المفتوحة أولًا، حسب الموعد.' },
    query: [{ name: 'leadId', type: 'string', desc: { en: 'Only this lead’s tasks.', ar: 'مهام هذا العميل فقط.' } }],
    status: 200,
    response: [TASK],
  },
  {
    id: 'createTask',
    group: 'tasks',
    method: 'POST',
    path: '/tasks',
    scope: 'crm:write',
    summary: { en: 'Add a task', ar: 'إضافة مهمة' },
    body: [
      { name: 'title', type: 'string', required: true, desc: { en: 'What to do.', ar: 'ما المطلوب.' } },
      { name: 'leadId', type: 'string', desc: { en: 'The lead it is about.', ar: 'العميل المعني.' } },
      { name: 'notes', type: 'string', desc: { en: 'Details.', ar: 'تفاصيل.' } },
      { name: 'priority', type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'], desc: { en: 'Default: MEDIUM.', ar: 'الافتراضي: MEDIUM.' } },
      { name: 'dueDate', type: 'date-time', desc: { en: 'When it is due; a reminder goes out then.', ar: 'موعدها؛ ويُرسل تذكير حينها.' } },
    ],
    status: 201,
    request: { title: 'Send the price list', leadId: 'cm3k9x2lead01', priority: 'HIGH', dueDate: '2026-10-08T09:00:00.000Z' },
    response: TASK,
  },
  {
    id: 'updateTask',
    group: 'tasks',
    method: 'PATCH',
    path: '/tasks/{id}',
    scope: 'crm:write',
    summary: { en: 'Update or complete a task', ar: 'تعديل مهمة أو إنهاؤها' },
    pathParams: [id],
    body: [
      { name: 'title', type: 'string', desc: { en: 'What to do.', ar: 'ما المطلوب.' } },
      { name: 'notes', type: 'string', desc: { en: 'Details.', ar: 'تفاصيل.' } },
      { name: 'priority', type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'], desc: { en: 'Priority.', ar: 'الأولوية.' } },
      { name: 'dueDate', type: 'date-time', nullable: true, desc: { en: 'When it is due; null removes it.', ar: 'الموعد؛ وnull يزيله.' } },
      { name: 'completed', type: 'boolean', desc: { en: 'Done or not.', ar: 'منجزة أم لا.' } },
    ],
    status: 200,
    request: { completed: true },
    response: { ...TASK, completed: true, completedAt: '2026-10-07T12:00:00.000Z' },
  },
  {
    id: 'deleteTask',
    group: 'tasks',
    method: 'DELETE',
    path: '/tasks/{id}',
    scope: 'crm:write',
    summary: { en: 'Delete a task', ar: 'حذف مهمة' },
    pathParams: [id],
    status: 200,
    response: { id: 'cm3k9x2task01', deleted: true },
  },

  // ── Cards ──
  {
    id: 'listCards',
    group: 'cards',
    method: 'GET',
    path: '/cards',
    scope: 'cards:read',
    summary: { en: 'List cards', ar: 'قائمة البطاقات' },
    desc: { en: 'Each card with its buttons and sections. Its public page is /c/{slug}.', ar: 'كل بطاقة مع أزرارها وأقسامها. صفحتها العامة هي ‎/c/{slug}.' },
    status: 200,
    response: [
      {
        id: 'cm3k9x2card01',
        slug: 'omar-saeed',
        ownerId: 'cm3k9x2user01',
        templateId: 'swiss-indigo',
        isPublished: true,
        vcardData: { fullName: 'Omar Saeed', title: 'Sales Manager', company: 'Nile Co', phone: '+201001234567', email: 'omar@nile.example' },
        actions: [{ id: 'cm3k9x2actn1', type: 'WHATSAPP', label: 'WhatsApp', value: '+201001234567', isActive: true, order: 0 }],
        sections: [],
        createdAt: '2026-09-01T10:00:00.000Z',
      },
    ],
  },
  {
    id: 'createCard',
    group: 'cards',
    method: 'POST',
    path: '/cards',
    scope: 'cards:write',
    summary: { en: 'Create a card', ar: 'إنشاء بطاقة' },
    desc: {
      en: 'Made as a draft; publish it from the app. Counts toward the plan’s card limit.',
      ar: 'تُنشأ كمسودة؛ وانشرها من التطبيق. تُحسب ضمن حد البطاقات في الخطة.',
    },
    body: [
      { name: 'templateId', type: 'string', required: true, desc: { en: 'The design, such as swiss-indigo.', ar: 'التصميم، مثل swiss-indigo.' } },
      { name: 'fullName', type: 'string', desc: { en: 'The name on the card.', ar: 'الاسم على البطاقة.' } },
      { name: 'title', type: 'string', desc: { en: 'Job title.', ar: 'المسمّى الوظيفي.' } },
      { name: 'slug', type: 'string', desc: { en: 'Its address (lowercase letters, numbers, hyphens); made from the name when left out.', ar: 'عنوانها (حروف صغيرة وأرقام وشرطات)؛ ويُصنع من الاسم إن لم يُرسل.' } },
      { name: 'ownerId', type: 'string', desc: { en: 'A member to own it. Default: whoever the credential acts as (see Authentication).', ar: 'عضو يملكها. الافتراضي: من يعمل المفتاح باسمه (راجع المصادقة).' } },
    ],
    status: 201,
    request: { templateId: 'swiss-indigo', fullName: 'Sara Nabil', title: 'Account Manager' },
    response: { id: 'cm3k9x2card02', slug: 'sara-nabil', templateId: 'swiss-indigo', isPublished: false, vcardData: { fullName: 'Sara Nabil', title: 'Account Manager' } },
  },

  // ── NFC chips ──
  {
    id: 'listChips',
    group: 'chips',
    method: 'GET',
    path: '/nfc/tags',
    scope: 'nfc:read',
    summary: { en: 'List NFC chips', ar: 'قائمة شرائح NFC' },
    query: [
      { name: 'status', type: 'string', enum: ['UNASSIGNED', 'ACTIVE', 'DISABLED'], desc: { en: 'Only chips in this state.', ar: 'الشرائح في هذه الحالة فقط.' } },
      { name: 'batchId', type: 'string', desc: { en: 'Only chips from this delivery batch.', ar: 'شرائح دفعة التوريد هذه فقط.' } },
      { name: 'assignedUserId', type: 'string', desc: { en: 'Only chips given to this member.', ar: 'الشرائح المسلّمة لهذا العضو فقط.' } },
    ],
    status: 200,
    response: [{ ...TAG, assignedUser: { id: 'cm3k9x2user01', name: 'Omar Saeed', email: 'omar@nile.example' } }],
  },
  {
    id: 'getChip',
    group: 'chips',
    method: 'GET',
    path: '/nfc/tags/{id}',
    scope: 'nfc:read',
    summary: { en: 'Get an NFC chip', ar: 'عرض شريحة NFC' },
    pathParams: [id],
    status: 200,
    response: TAG,
  },

  // ── Webhooks ──
  {
    id: 'listWebhooks',
    group: 'webhooks',
    method: 'GET',
    path: '/webhooks',
    scope: 'integration:read',
    roles: ['OWNER', 'ADMIN', 'MANAGER'],
    summary: { en: 'List webhook endpoints', ar: 'قائمة عناوين الـ Webhooks' },
    status: 200,
    response: [
      {
        id: 'cm3k9x2hook01',
        url: 'https://example.com/vertex',
        description: 'CRM sync',
        secretHint: 'whsec_…9f2c',
        events: ['lead.created', 'lead.updated'],
        enabled: true,
        createdAt: '2026-09-10T08:00:00.000Z',
        updatedAt: '2026-09-10T08:00:00.000Z',
      },
    ],
  },
  {
    id: 'createWebhook',
    group: 'webhooks',
    method: 'POST',
    path: '/webhooks',
    scope: 'integration:write',
    roles: ['OWNER', 'ADMIN'],
    summary: { en: 'Add a webhook endpoint', ar: 'إضافة عنوان Webhook' },
    desc: {
      en: 'The answer carries the signing secret, once. Keep it to check the signature on each delivery.',
      ar: 'يحمل الرد سرّ التوقيع مرة واحدة. احتفظ به للتحقق من توقيع كل إرسال.',
    },
    body: [
      { name: 'url', type: 'string', required: true, desc: { en: 'An HTTPS address of yours.', ar: 'عنوان HTTPS لديك.' } },
      { name: 'events', type: 'string[]', required: true, desc: { en: 'Events to send; see Webhook events.', ar: 'الأحداث المطلوب إرسالها؛ راجع أحداث الـ Webhooks.' } },
      { name: 'description', type: 'string', desc: { en: 'What it is for.', ar: 'الغرض منه.' } },
    ],
    status: 201,
    request: { url: 'https://example.com/vertex', events: ['lead.created'], description: 'CRM sync' },
    response: {
      id: 'cm3k9x2hook02',
      url: 'https://example.com/vertex',
      description: 'CRM sync',
      secretHint: 'whsec_…3f9a',
      events: ['lead.created'],
      enabled: true,
      createdAt: '2026-10-06T09:00:00.000Z',
      updatedAt: '2026-10-06T09:00:00.000Z',
      secret: 'whsec_5c1e…3f9a',
    },
  },
];

/** The events that are sent, with what each one is. (Others in the subscribable list are reserved and not sent yet.) */
export const WEBHOOK_EVENT_DOCS: { event: string; desc: Text }[] = [
  { event: 'lead.created', desc: { en: 'A new lead: from a card, a meeting request, an import or by hand.', ar: 'عميل جديد: من بطاقة أو طلب موعد أو استيراد أو يدويًا.' } },
  { event: 'lead.updated', desc: { en: 'A lead’s stage, temperature, value or details changed, or duplicates were merged into it.', ar: 'تغيّرت مرحلة العميل أو اهتمامه أو قيمته أو بياناته، أو دُمج فيه عملاء مكررون.' } },
  { event: 'contact.saved', desc: { en: 'A visitor saved a card to their phone’s contacts.', ar: 'حفظ زائر بطاقة في جهات اتصال هاتفه.' } },
  { event: 'card.viewed', desc: { en: 'A card was opened (by link, QR code or chip).', ar: 'فُتحت بطاقة (من رابط أو رمز QR أو شريحة).' } },
  { event: 'nfc.tapped', desc: { en: 'A chip was tapped.', ar: 'لُمست شريحة.' } },
  { event: 'meeting.requested', desc: { en: 'A visitor asked to meet.', ar: 'طلب زائر موعدًا.' } },
  { event: 'quote.requested', desc: { en: 'A visitor asked for a quote.', ar: 'طلب زائر عرض سعر.' } },
  { event: 'member.added', desc: { en: 'Someone joined the workspace.', ar: 'انضم أحد إلى مساحة العمل.' } },
];

export const WEBHOOK_PAYLOAD_EXAMPLE = {
  id: 'evt_5b1d0c3e-8f7a-4f53-9f0e-2a6b1c9d7e41',
  event: 'lead.created',
  createdAt: '2026-10-06T09:14:00.000Z',
  data: { leadId: 'cm3k9x2lead01', name: 'Mona Adel', email: 'mona@nile.example', phone: '+201001234567', company: 'Nile Co', source: 'manual' },
};

/** Paths from the API's own path syntax (/leads/:id) to the one documented here (/leads/{id}). */
export const toOpenApiPath = (p: string) => p.replace(/:([A-Za-z]+)/g, '{$1}');

function schemaOf(f: ApiField): Record<string, unknown> {
  let s: Record<string, unknown>;
  if (f.type === 'string[]') s = { type: 'array', items: { type: 'string' } };
  else if (f.type === 'date-time') s = { type: 'string', format: 'date-time' };
  else s = { type: f.type };
  if (f.enum) s.enum = [...f.enum];
  if (f.nullable) s.type = [s.type as string, 'null'];
  s.description = f.desc.en;
  return s;
}

/** The catalog as an OpenAPI 3.1 document, with the server's own address. */
export function openApiDocument(serverUrl: string): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const e of API_ENDPOINTS) {
    const params = [
      ...(e.pathParams ?? []).map((p) => ({ name: p.name, in: 'path', required: true, description: p.desc.en, schema: schemaOf(p) })),
      ...(e.query ?? []).map((p) => ({ name: p.name, in: 'query', required: !!p.required, description: p.desc.en, schema: schemaOf(p) })),
    ];
    const op: Record<string, unknown> = {
      operationId: e.id,
      tags: [API_GROUPS.find((g) => g.id === e.group)!.title.en],
      summary: e.summary.en,
      ...(e.desc ? { description: e.desc.en } : {}),
      security: [{ bearer: [e.scope] }],
      'x-required-scope': e.scope,
      ...(e.roles ? { 'x-roles': e.roles } : {}),
      ...(params.length ? { parameters: params } : {}),
      ...(e.body
        ? {
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: Object.fromEntries(e.body.map((f) => [f.name, schemaOf(f)])),
                    ...(e.body.some((f) => f.required) ? { required: e.body.filter((f) => f.required).map((f) => f.name) } : {}),
                  },
                  ...(e.request ? { example: e.request } : {}),
                },
              },
            },
          }
        : {}),
      responses: {
        [String(e.status)]: { description: 'OK', content: { 'application/json': { example: e.response } } },
        '400': { $ref: '#/components/responses/Invalid' },
        '401': { $ref: '#/components/responses/Unauthorized' },
        '403': { $ref: '#/components/responses/Forbidden' },
        ...(e.pathParams ? { '404': { $ref: '#/components/responses/NotFound' } } : {}),
        '429': { $ref: '#/components/responses/TooMany' },
      },
    };
    (paths[e.path] ??= {})[e.method.toLowerCase()] = op;
  }
  const error = (status: number, message: string) => ({
    description: message,
    content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { statusCode: status, message } } },
  });
  return {
    openapi: '3.1.0',
    info: {
      title: 'Vertex Connect API',
      version: '1',
      description:
        'Read and write your workspace’s leads, tasks, cards, NFC chips and webhooks. Authenticate with an API key (Integrations → API keys) or a personal access token, sent as a Bearer token.',
    },
    servers: [{ url: serverUrl }],
    tags: API_GROUPS.map((g) => ({ name: g.title.en, description: g.desc.en })),
    paths,
    components: {
      securitySchemes: {
        bearer: {
          type: 'http',
          scheme: 'bearer',
          description: 'An API key (vxk_live_…) acts in its workspace. A personal access token (vxp_…) acts as its user; send X-Organization-Id to choose the workspace.',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: { statusCode: { type: 'integer' }, message: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] } },
        },
      },
      responses: {
        Invalid: error(400, 'email: Invalid email'),
        Unauthorized: error(401, 'Invalid or expired API credentials'),
        Forbidden: error(403, 'This token is missing the required scope(s): crm:write'),
        NotFound: error(404, 'Lead not found'),
        TooMany: error(429, 'ThrottlerException: Too Many Requests'),
      },
    },
    webhooks: Object.fromEntries(
      WEBHOOK_EVENT_DOCS.map((w) => [
        w.event,
        {
          post: {
            summary: w.desc.en,
            parameters: [
              { name: 'X-Vertex-Signature', in: 'header', required: true, schema: { type: 'string' }, description: 't=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">' },
              { name: 'X-Vertex-Event', in: 'header', required: true, schema: { type: 'string' } },
              { name: 'X-Vertex-Event-Id', in: 'header', required: true, schema: { type: 'string' }, description: 'The same on every retry: use it to skip duplicates.' },
            ],
            requestBody: { content: { 'application/json': { example: { ...WEBHOOK_PAYLOAD_EXAMPLE, event: w.event } } } },
            responses: { '200': { description: 'Any 2xx means received; anything else is retried.' } },
          },
        },
      ]),
    ),
  };
}
