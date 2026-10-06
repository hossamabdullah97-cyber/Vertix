/**
 * The words around the API reference on /developers, in both languages. The
 * endpoints themselves come from @vertex/shared/dist/api-reference, which the
 * API also serves as OpenAPI.
 */

export const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api').replace(/\/$/, '');

type Strings = {
  title: string;
  lead: string;
  openapi: string;
  getKey: string;
  contents: string;
  guide: string;
  reference: string;
  sections: {
    start: { title: string; p: string[] };
    auth: { title: string; p: string[]; scopes: string; scope: string; allows: string };
    errors: { title: string; p: string[]; codes: [string, string][] };
    limits: { title: string; p: string[] };
    webhooks: { title: string; p: string[]; events: string; event: string; when: string; headers: string; verify: string };
  };
  endpoint: {
    scope: string;
    roles: string;
    pathParams: string;
    query: string;
    body: string;
    name: string;
    type: string;
    about: string;
    required: string;
    optional: string;
    oneOf: string;
    nullable: string;
    request: string;
    response: string;
  };
};

const en: Strings = {
  title: 'Vertex Connect API',
  lead: 'Bring your leads into your own systems, add the ones you collect elsewhere, and hear about every new one the moment it arrives.',
  openapi: 'OpenAPI file',
  getKey: 'Create an API key',
  contents: 'On this page',
  guide: 'Guide',
  reference: 'Reference',
  sections: {
    start: {
      title: 'Getting started',
      p: [
        'The API speaks JSON over HTTPS. Every address below starts with the base URL shown here.',
        'Create a key in Integrations → API keys (owners and admins), choose only the scopes you need, and send it with every request.',
      ],
    },
    auth: {
      title: 'Authentication',
      p: [
        'Send the key as a Bearer token in the Authorization header. A key (vxk_live_…) belongs to one workspace and acts as the person who made it, or the workspace owner once they have left. Anything it creates is theirs.',
        'A personal access token (vxp_…) acts as you, with your role. Send X-Organization-Id to choose the workspace when you are in more than one.',
        'A key can only reach the endpoints its scopes allow. A key or token is shown once when it is made; if one leaks, revoke it from the same page.',
      ],
      scopes: 'Scopes',
      scope: 'Scope',
      allows: 'Allows',
    },
    errors: {
      title: 'Errors',
      p: ['A failed request answers with an HTTP status and a JSON body with statusCode and message. The message says what to fix.'],
      codes: [
        ['400', 'Something sent is missing or not valid.'],
        ['401', 'The key is missing, wrong, revoked or expired.'],
        ['403', 'The key lacks the scope, or the role, for this.'],
        ['404', 'No such record in this workspace.'],
        ['429', 'Too many requests; wait and try again.'],
      ],
    },
    limits: {
      title: 'Rate limits',
      p: ['Up to 600 requests a minute from one address. Past that the API answers 429 until the minute is over; slow down and retry.'],
    },
    webhooks: {
      title: 'Webhooks',
      p: [
        'Add an endpoint (here or in Integrations → Webhooks) and we POST each event you choose to it as JSON. Answer with any 2xx status within 10 seconds. Anything else is retried up to 5 times: after 1 minute, 5 minutes, 30 minutes, 2 hours and 6 hours.',
        'Every delivery is signed. Check the signature before trusting the body, and use the event id to skip one you already handled (a retry has the same id).',
      ],
      events: 'Events',
      event: 'Event',
      when: 'Sent when',
      headers: 'Each delivery carries these headers',
      verify: 'Checking the signature (Node.js)',
    },
  },
  endpoint: {
    scope: 'Scope',
    roles: 'With a personal token, for',
    pathParams: 'Path',
    query: 'Query',
    body: 'Body',
    name: 'Name',
    type: 'Type',
    about: 'Description',
    required: 'required',
    optional: 'optional',
    oneOf: 'One of',
    nullable: 'or null',
    request: 'Request',
    response: 'Response',
  },
};

const ar: Strings = {
  title: 'واجهة Vertex Connect البرمجية (API)',
  lead: 'انقل عملاءك إلى أنظمتك، وأضف من تجمعهم في أماكن أخرى، واعرف بكل عميل جديد لحظة وصوله.',
  openapi: 'ملف OpenAPI',
  getKey: 'أنشئ مفتاح API',
  contents: 'في هذه الصفحة',
  guide: 'الدليل',
  reference: 'المرجع',
  sections: {
    start: {
      title: 'البداية',
      p: [
        'تعمل الواجهة بصيغة JSON عبر HTTPS. كل عنوان أدناه يبدأ بالعنوان الأساسي الظاهر هنا.',
        'أنشئ مفتاحًا من التكاملات ← مفاتيح API (للمالكين والمسؤولين)، واختر الصلاحيات التي تحتاجها فقط، وأرسله مع كل طلب.',
      ],
    },
    auth: {
      title: 'المصادقة',
      p: [
        'أرسل المفتاح كـ Bearer token في ترويسة Authorization. المفتاح \u2066(vxk_live_…)\u2069 يتبع مساحة عمل واحدة ويعمل باسم من أنشأه، أو باسم مالك المساحة إن غادرها. وكل ما ينشئه يُنسب إليه.',
        'رمز الوصول الشخصي \u2066(vxp_…)\u2069 يعمل باسمك وبدورك. أرسل X-Organization-Id لتختار مساحة العمل إن كنت في أكثر من واحدة.',
        'لا يصل المفتاح إلا إلى ما تسمح به صلاحياته. يظهر المفتاح أو الرمز مرة واحدة عند إنشائه؛ وإن تسرّب ألغِه من الصفحة نفسها.',
      ],
      scopes: 'الصلاحيات',
      scope: 'الصلاحية',
      allows: 'تتيح',
    },
    errors: {
      title: 'الأخطاء',
      p: ['الطلب الفاشل يردّ بحالة HTTP وجسم JSON فيه statusCode وmessage. تقول الرسالة ما يجب إصلاحه.'],
      codes: [
        ['400', 'شيء مُرسل ناقص أو غير صالح.'],
        ['401', 'المفتاح غير موجود أو خاطئ أو ملغى أو منتهٍ.'],
        ['403', 'المفتاح لا يملك الصلاحية أو الدور المطلوب.'],
        ['404', 'لا يوجد هذا السجل في مساحة العمل.'],
        ['429', 'طلبات كثيرة جدًا؛ انتظر وحاول مرة أخرى.'],
      ],
    },
    limits: {
      title: 'حدود الطلبات',
      p: ['حتى 600 طلب في الدقيقة من العنوان الواحد. بعدها تردّ الواجهة 429 حتى تنتهي الدقيقة؛ أبطئ وأعد المحاولة.'],
    },
    webhooks: {
      title: 'الـ Webhooks',
      p: [
        'أضف عنوانًا (هنا أو من التكاملات ← Webhooks) ونرسل إليه كل حدث تختاره بطلب POST بصيغة JSON. ردّ بأي حالة 2xx خلال 10 ثوانٍ، وإلا نعيد المحاولة حتى 5 مرات: بعد دقيقة، ثم 5 دقائق، ثم 30 دقيقة، ثم ساعتين، ثم 6 ساعات.',
        'كل إرسال موقَّع. تحقّق من التوقيع قبل الوثوق بالمحتوى، واستخدم معرّف الحدث لتتجاهل ما عالجته من قبل (إعادة المحاولة تحمل المعرّف نفسه).',
      ],
      events: 'الأحداث',
      event: 'الحدث',
      when: 'يُرسل حين',
      headers: 'يحمل كل إرسال هذه الترويسات',
      verify: 'التحقق من التوقيع (Node.js)',
    },
  },
  endpoint: {
    scope: 'الصلاحية',
    roles: 'بالرمز الشخصي، لـ',
    pathParams: 'في العنوان',
    query: 'في الاستعلام',
    body: 'في الجسم',
    name: 'الاسم',
    type: 'النوع',
    about: 'الوصف',
    required: 'مطلوب',
    optional: 'اختياري',
    oneOf: 'أحد',
    nullable: 'أو null',
    request: 'الطلب',
    response: 'الرد',
  },
};

export const DEV_STRINGS = { en, ar };

export const VERIFY_SNIPPET = `import { createHmac, timingSafeEqual } from 'node:crypto';

// rawBody: the request body exactly as received (a string, not parsed JSON).
export function isFromVertex(rawBody, header, secret) {
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=')));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > 300) return false; // older than 5 minutes
  const expected = createHmac('sha256', secret).update(\`\${t}.\${rawBody}\`).digest('hex');
  const given = Buffer.from(parts.v1 ?? '');
  return given.length === expected.length && timingSafeEqual(given, Buffer.from(expected));
}`;

/** A curl command for an endpoint, with its example body. */
export function curlFor(method: string, path: string, body?: unknown): string {
  const lines = [`curl ${method === 'GET' ? '' : `-X ${method} `}${API_BASE}${path.replace(/\{id\}/g, '$ID')} \\`, '  -H "Authorization: Bearer $VERTEX_API_KEY"'];
  if (body) {
    lines[lines.length - 1] += ' \\';
    lines.push('  -H "Content-Type: application/json" \\', `  -d '${JSON.stringify(body)}'`);
  }
  return lines.join('\n');
}
