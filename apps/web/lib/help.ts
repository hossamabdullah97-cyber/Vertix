/**
 * The help center: its articles in both languages, and the words around them.
 *
 * Kept here rather than in the i18n namespaces because those ship with every
 * page, and the articles are only read on /help. Each article is written to
 * match what the product does today; when a feature changes, change its
 * article here too (the spec checks both languages have the same articles,
 * and that every link points at a real page).
 */

export type HelpLocale = 'en' | 'ar';

export type HelpCategory = 'start' | 'cards' | 'sharing' | 'leads' | 'team' | 'integrations' | 'billing' | 'account';

export const HELP_CATEGORIES: { id: HelpCategory; icon: string }[] = [
  { id: 'start', icon: 'sparkle' },
  { id: 'cards', icon: 'grid' },
  { id: 'sharing', icon: 'tag' },
  { id: 'leads', icon: 'inbox' },
  { id: 'team', icon: 'users' },
  { id: 'integrations', icon: 'layers' },
  { id: 'billing', icon: 'credit-card' },
  { id: 'account', icon: 'shield' },
];

/** A paragraph, numbered steps, or a tip set apart. */
export type HelpBlock = { p: string } | { steps: string[] } | { tip: string };

export interface HelpArticleText {
  title: string;
  summary: string;
  body: HelpBlock[];
  /** The button at the end that takes the person to do it. */
  action?: string;
  /** Other words people search with. */
  keywords?: string;
}

interface HelpArticleMeta {
  slug: string;
  category: HelpCategory;
  /** Where the action button goes. */
  href?: string;
  related?: string[];
  /** Shown on the help home. */
  popular?: boolean;
}

export const HELP_ARTICLES: HelpArticleMeta[] = [
  { slug: 'what-is-vertex', category: 'start', href: '/dashboard', related: ['create-card', 'personal-or-team'], popular: true },
  { slug: 'personal-or-team', category: 'start', href: '/workspace', related: ['invite-team', 'roles'] },
  { slug: 'getting-started-guide', category: 'start', href: '/dashboard', related: ['create-card', 'share-card'] },

  { slug: 'create-card', category: 'cards', href: '/cards?new=1', related: ['card-links', 'card-design', 'share-card'], popular: true },
  { slug: 'card-links', category: 'cards', href: '/cards', related: ['card-sections', 'create-card'] },
  { slug: 'card-sections', category: 'cards', href: '/cards', related: ['card-links', 'meetings'] },
  { slug: 'card-design', category: 'cards', href: '/cards', related: ['create-card', 'brand'] },
  { slug: 'two-languages', category: 'cards', href: '/cards', related: ['card-design'] },
  { slug: 'card-profiles', category: 'cards', href: '/cards', related: ['card-address'] },
  { slug: 'card-address', category: 'cards', href: '/cards', related: ['share-card', 'move-card'] },
  { slug: 'move-card', category: 'cards', href: '/cards', related: ['personal-or-team'] },

  { slug: 'share-card', category: 'sharing', href: '/cards', related: ['met-someone', 'nfc-chips'], popular: true },
  { slug: 'nfc-chips', category: 'sharing', href: '/tags', related: ['program-chip', 'share-card'], popular: true },
  { slug: 'program-chip', category: 'sharing', href: '/tags', related: ['nfc-chips'] },
  { slug: 'met-someone', category: 'sharing', href: '/meet', related: ['share-card', 'leads-come-in'] },

  { slug: 'leads-come-in', category: 'leads', href: '/leads', related: ['lead-alerts', 'follow-up'], popular: true },
  { slug: 'lead-alerts', category: 'leads', href: '/notifications?settings=1', related: ['leads-come-in', 'weekly-report'] },
  { slug: 'follow-up', category: 'leads', href: '/leads', related: ['notes-mentions', 'leads-come-in'] },
  { slug: 'notes-mentions', category: 'leads', href: '/leads', related: ['follow-up'] },
  { slug: 'import-leads', category: 'leads', href: '/leads', related: ['duplicates', 'custom-fields'], popular: true },
  { slug: 'duplicates', category: 'leads', href: '/leads', related: ['import-leads'] },
  { slug: 'custom-fields', category: 'leads', href: '/leads', related: ['import-leads'] },
  { slug: 'meetings', category: 'leads', href: '/cards', related: ['leads-come-in', 'card-sections'] },
  { slug: 'analytics', category: 'leads', href: '/analytics', related: ['weekly-report'] },
  { slug: 'weekly-report', category: 'leads', href: '/notifications?settings=1', related: ['analytics', 'lead-alerts'] },

  { slug: 'invite-team', category: 'team', href: '/team', related: ['roles', 'personal-or-team'], popular: true },
  { slug: 'roles', category: 'team', href: '/team', related: ['invite-team'] },
  { slug: 'brand', category: 'team', href: '/workspace', related: ['card-design'] },

  { slug: 'connect-crm', category: 'integrations', href: '/integrations', related: ['automations', 'webhooks-api'] },
  { slug: 'automations', category: 'integrations', href: '/integrations', related: ['connect-crm'] },
  { slug: 'webhooks-api', category: 'integrations', href: '/integrations', related: ['connect-crm'] },

  { slug: 'plans', category: 'billing', href: '/billing', related: ['invoices'] },
  { slug: 'invoices', category: 'billing', href: '/billing', related: ['plans'] },

  { slug: 'two-step', category: 'account', href: '/account', related: ['devices'] },
  { slug: 'devices', category: 'account', href: '/account', related: ['two-step'] },
  { slug: 'your-data', category: 'account', href: '/account', related: ['devices'] },
];

interface HelpStrings {
  categories: Record<HelpCategory, { title: string; desc: string }>;
  ui: {
    title: string;
    ask: string;
    subtitle: string;
    search: string;
    searchLabel: string;
    popular: string;
    browse: string;
    results_zero: string;
    noResults: string;
    noResultsHint: string;
    clear: string;
    back: string;
    home: string;
    related: string;
    helpful: string;
    yes: string;
    no: string;
    thanks: string;
    thanksNo: string;
    stillStuck: string;
    contactTitle: string;
    contactBody: string;
    contact: string;
    tip: string;
    yourRequests: string;
    open: string;
    closed: string;
    notFound: string;
    notFoundBody: string;
    // The contact form
    formTitle: string;
    formSubtitle: string;
    topic: string;
    topics: Record<'account' | 'billing' | 'cards' | 'leads' | 'chips' | 'team' | 'integrations' | 'bug' | 'other', string>;
    subject: string;
    subjectPlaceholder: string;
    message: string;
    messagePlaceholder: string;
    messageHint: string;
    sending: string;
    send: string;
    cancel: string;
    close: string;
    sentTitle: string;
    sentBody: string;
    failed: string;
    tooMany: string;
    replyBy: string;
  };
  articles: Record<string, HelpArticleText>;
}

const en: HelpStrings = {
  categories: {
    start: { title: 'Getting started', desc: 'What Vertex Connect does, and the first steps.' },
    cards: { title: 'Your card', desc: 'Details, links, sections, design and languages.' },
    sharing: { title: 'Sharing and NFC chips', desc: 'Links, QR codes, chips and meeting people.' },
    leads: { title: 'Leads and follow-up', desc: 'Who left their details, and what to do next.' },
    team: { title: 'Your team', desc: 'Inviting people, roles and the company brand.' },
    integrations: { title: 'Integrations', desc: 'Your CRM, chat apps, webhooks and the API.' },
    billing: { title: 'Plans and payments', desc: 'Choosing a plan, paying, and invoices.' },
    account: { title: 'Account and security', desc: 'Sign-in, two-step verification and your data.' },
  },
  ui: {
    title: 'Help center',
    ask: 'How can we help?',
    subtitle: 'Answers to what people ask most, and a person when you need one.',
    search: 'Search help, like "import leads" or "chip"',
    searchLabel: 'Search help',
    popular: 'Popular',
    browse: 'Browse by topic',
    results_zero: 'No articles match',
    noResults: 'Nothing matches “{{q}}”.',
    noResultsHint: 'Try other words, or write to us and a person will answer.',
    clear: 'Clear',
    back: 'Help center',
    home: 'Help center',
    related: 'Related',
    helpful: 'Did this answer your question?',
    yes: 'Yes',
    no: 'No',
    thanks: 'Thanks for saying.',
    thanksNo: 'Thanks. Tell us what was missing and a person will help.',
    stillStuck: 'Still stuck?',
    contactTitle: 'Write to us',
    contactBody: 'A person from our team answers by email, usually within one working day.',
    contact: 'Contact support',
    tip: 'Tip',
    yourRequests: 'Your messages',
    open: 'Open',
    closed: 'Answered',
    notFound: 'This article isn’t here',
    notFoundBody: 'It may have moved. Search for it, or browse the topics.',
    formTitle: 'Contact support',
    formSubtitle: 'Tell us what happened. We see which page you were on, so you don’t need to explain where.',
    topic: 'About',
    topics: {
      account: 'Account and sign-in',
      billing: 'Plans and payments',
      cards: 'Cards',
      leads: 'Leads',
      chips: 'NFC chips',
      team: 'Team',
      integrations: 'Integrations',
      bug: 'Something is broken',
      other: 'Something else',
    },
    subject: 'Subject',
    subjectPlaceholder: 'In a few words',
    message: 'Message',
    messagePlaceholder: 'What you tried, what you expected, and what happened instead.',
    messageHint: 'At least 10 characters.',
    sending: 'Sending…',
    send: 'Send',
    cancel: 'Cancel',
    close: 'Close',
    sentTitle: 'We got your message',
    sentBody: 'Its reference is {{ref}}. We’ve emailed you a copy, and a person will answer at {{email}}.',
    failed: 'That didn’t send. Check your connection and try again.',
    tooMany: 'You’ve sent several messages just now. Wait a few minutes, or add to one by replying to its email.',
    replyBy: 'We answer at {{email}}',
  },
  articles: {
    'what-is-vertex': {
      title: 'What Vertex Connect does',
      summary: 'Digital business cards that bring in clients, and the place to follow them up.',
      body: [
        { p: 'Vertex Connect gives you, or each person in your company, a digital business card: a page with your name, photo, how to reach you and your links. People open it from a link, a QR code or a tap of an NFC chip, save you to their phone in one tap, and can leave their own details.' },
        { p: 'Everyone who leaves their details becomes a lead. Leads come to one place where you can see who is waiting for a reply, message them on WhatsApp or by email, add notes and tasks, and move them through your pipeline.' },
        { p: 'Analytics show how many people opened each card, from where, and how many became leads, for one person or the whole team.' },
      ],
      action: 'Open the home page',
      keywords: 'about overview intro what is',
    },
    'personal-or-team': {
      title: 'A personal workspace or a team',
      summary: 'Which one you have, what changes between them, and how to switch.',
      body: [
        { p: 'When you sign up you choose between a workspace for yourself and one for a company or team. A personal workspace has your cards and leads and nothing else. A team workspace adds members, roles, departments and teams, a shared brand, and leads that belong to the company.' },
        { p: 'You can turn a personal workspace into a team one at any time: open Settings, then “Make it a team workspace”, and give it the company name. Your cards and leads stay as they are.' },
        { tip: 'You can be in several workspaces at once, for example your own and your company’s. Switch between them from the menu at the top of the sidebar.' },
      ],
      action: 'Open workspace settings',
      keywords: 'workspace company organization switch convert',
    },
    'getting-started-guide': {
      title: 'The getting started guide',
      summary: 'The steps in the sidebar that take a new account to a card that brings in clients.',
      body: [
        { p: 'The guide at the bottom of the sidebar shows how far along you are and the next step. Click it to see every step; each one opens the page where you do it.' },
        { p: 'Steps tick themselves off as you go, from what your workspace actually has: a card, a photo, a way to reach you, the card published and opened by someone, your first lead, how you hear about leads, your team invited (for company owners and admins) and a chip linked.' },
        { p: 'You can hide the guide from its menu, and bring it back from “Show setup checklist” on the home page. Once everything is done it goes away on its own.' },
      ],
      action: 'Open the home page',
      keywords: 'onboarding checklist setup steps',
    },
    'create-card': {
      title: 'Make your card',
      summary: 'From a new card to one that is ready to share, in a few minutes.',
      body: [
        { steps: ['Open Cards and choose “New card”.', 'Pick a template, then fill in your name, job title and company.', 'Add your photo: people remember a face more than a name.', 'Add your phone or email, and the links people should use, like WhatsApp or LinkedIn.', 'Switch the card to Published so its link, QR code and chips work.'] },
        { p: 'The preview beside the editor shows the card as a phone will. Changes are saved as you type.' },
        { tip: 'A card in Draft can only be seen by you and your team, so you can get it right before anyone opens it.' },
      ],
      action: 'Make a card',
      keywords: 'new card create profile publish',
    },
    'card-links': {
      title: 'Links and buttons on your card',
      summary: 'Phone, email, WhatsApp, LinkedIn and any other way to reach you.',
      body: [
        { p: 'Links are the buttons on your card. In the card’s Content tab, use “Add a link” and pick a platform: phone, email, WhatsApp, a website, LinkedIn, Instagram and many more.' },
        { p: 'Drag links to change their order. Switch one off to hide it without deleting it. For WhatsApp you can write a message that is ready when the visitor opens the chat.' },
        { p: 'On a phone, WhatsApp and LinkedIn links open in their apps when the visitor has them.' },
      ],
      action: 'Open your cards',
      keywords: 'buttons whatsapp linkedin instagram website social',
    },
    'card-sections': {
      title: 'Sections: about, gallery, video and more',
      summary: 'Longer content below the buttons.',
      body: [
        { p: 'Sections add more to your card below its buttons: About (a few lines about you), Social profiles, a Gallery of your work, a Video from YouTube or Vimeo, a Booking button, your Certifications, and the logos of Clients you have worked with.' },
        { p: 'Add them from the card’s Content tab, under Sections. Each can be hidden without deleting it, and moved up or down.' },
      ],
      action: 'Open your cards',
      keywords: 'bio about gallery portfolio video booking certifications clients logos',
    },
    'card-design': {
      title: 'Your card’s look',
      summary: 'Templates, colours, the cover and your company’s brand.',
      body: [
        { p: 'The Templates tab changes the whole layout of the card; your details stay as they are. The Design tab changes colours, the cover, and whether the card follows the phone’s light or dark mode.' },
        { p: 'In a team workspace, the logo and colours set in Settings → Brand appear on everyone’s cards, so the company looks the same on every one.' },
      ],
      action: 'Open your cards',
      keywords: 'template theme colors cover dark mode logo style',
    },
    'two-languages': {
      title: 'A card in Arabic and English',
      summary: 'One card that speaks the visitor’s language.',
      body: [
        { p: 'You can add a second language to a card: your name, title, company and about text in Arabic and English. Visitors whose phone is in that language see it first, and anyone can switch language on the card.' },
        { p: 'Add the name in the second language first; once it has a name, the card offers the switch.' },
      ],
      action: 'Open your cards',
      keywords: 'arabic english bilingual language translation',
    },
    'card-profiles': {
      title: 'Several profiles on one link',
      summary: 'Show different details at an event, to some people, or at certain times.',
      body: [
        { p: 'A card keeps one public link, but can have several profiles, set up in the card’s Variants tab. Each profile can change the details, look, links and sections.' },
        { p: 'A profile shows to people with its private link or passcode, on a schedule (for example during an exhibition), or when you switch it on. When none applies, the default profile shows.' },
      ],
      action: 'Open your cards',
      keywords: 'variants profiles passcode private schedule event',
    },
    'card-address': {
      title: 'The card’s address, publishing and deleting',
      summary: 'Its link, who can see it, and removing it.',
      body: [
        { p: 'In the card’s Settings tab you can change the address in its link (letters, numbers and hyphens). Changing it breaks the old link, so do it before you share the card.' },
        { p: 'Published means anyone with the link or a chip can open it. Draft means only you and your team can.' },
        { p: 'Deleting a card removes it with its links and sections; chips linked to it become free to link to another card.' },
      ],
      action: 'Open your cards',
      keywords: 'slug url link address publish draft delete',
    },
    'move-card': {
      title: 'Move a card to another workspace',
      summary: 'For example from your own workspace to your company’s.',
      body: [
        { p: 'From the card’s Settings tab, choose “Move to another workspace” and pick one you are in. The card keeps its link and QR code, and its leads, views and taps go with it.' },
        { p: 'Its NFC chips stay in the old workspace and are unlinked, so link them again (or new ones) in the new workspace.' },
      ],
      action: 'Open your cards',
      keywords: 'transfer move workspace company',
    },
    'share-card': {
      title: 'Share your card',
      summary: 'A link, a QR code, or a tap.',
      body: [
        { p: 'Every published card has a link and a QR code. Open the card and use “Share & QR” to copy the link or download the code. Anyone can scan the code with their phone camera, no app needed.' },
        { p: 'Put the link in your email signature, WhatsApp status and social profiles. Print the QR code on brochures, stands and your paper card.' },
        { tip: 'Meeting someone in person? “Met someone” shows your QR code full screen, ready to scan.' },
      ],
      action: 'Open your cards',
      keywords: 'share link qr code send signature',
    },
    'nfc-chips': {
      title: 'NFC chips',
      summary: 'A card, sticker or keychain that opens your card with one tap.',
      body: [
        { p: 'A chip is a physical card, sticker or keychain. Tapping it against a phone opens the card it is linked to, on iPhone and Android, with no app.' },
        { steps: ['Open NFC Tags and choose “Add chips”.', 'Add the chips you received: tap them on an Android phone with Chrome, type the serial printed on the packaging, or paste a list.', 'Link each chip to a card.', 'Hand them out. You can link a chip to another card at any time; the chip itself doesn’t change.'] },
        { tip: 'Only chips issued to your workspace can be added. If one is refused, the reason is shown beside it.' },
      ],
      action: 'Open NFC Tags',
      keywords: 'nfc chip tag tap sticker keychain',
    },
    'program-chip': {
      title: 'Write a blank NFC tag from your phone',
      summary: 'Use any blank tag with your card.',
      body: [
        { p: 'On an Android phone with Chrome, open the card, go to its NFC chips tab and choose “Program tag”. Hold a blank tag to the back of the phone: the link is written to it and it is linked to the card.' },
        { p: 'Then tap it once more so the link on it can be checked. You can also lock the tag so nobody can change or wipe it, you included; this can’t be undone.' },
        { tip: 'iPhone doesn’t let websites write NFC tags. Use an Android phone, or chips from us.' },
      ],
      action: 'Open NFC chips',
      keywords: 'write program blank tag android lock',
    },
    'met-someone': {
      title: 'Met someone',
      summary: 'Swap details in person in a few seconds.',
      body: [
        { p: '“Met someone” shows your card as a large QR code for the other person to scan. Their phone opens your card, and they can save you or send you their details.' },
        { p: 'You can also add them yourself: scan their paper card, or type their number. They are added to your leads, with where you met.' },
      ],
      action: 'Open “Met someone”',
      keywords: 'meet event exhibition scan business card in person',
    },
    'leads-come-in': {
      title: 'Where leads come from',
      summary: 'Visitors who leave their details, imports, and people you meet.',
      body: [
        { p: 'A lead is someone who left their details on one of your cards, asked to meet, was imported from a file, or was added by you. Each one lands in Leads with the card it came from.' },
        { p: 'In a team, each lead belongs to the company. Employees see the leads their cards brought in and those given to them; managers, admins and owners see every lead. New leads that nobody has contacted yet show how long they have been waiting.' },
        { p: 'Move leads through your stages on the Pipeline board, mark them hot, warm or cold, and give them a value.' },
      ],
      action: 'Open leads',
      keywords: 'lead contact pipeline stage crm',
    },
    'lead-alerts': {
      title: 'Hear about new leads',
      summary: 'By email, WhatsApp, or a notification on your phone.',
      body: [
        { p: 'In Notifications → Settings, choose how you hear about a new lead: email, WhatsApp (with your number and its country code), or both. Send a test to check it arrives.' },
        { p: 'To get notifications on this phone or computer even when the app is closed, switch on device notifications there too. On iPhone, add the app to the home screen first.' },
      ],
      action: 'Choose alerts',
      keywords: 'notifications alerts email whatsapp push',
    },
    'follow-up': {
      title: 'Follow up with a lead',
      summary: 'Message them, set a reminder, and keep the history.',
      body: [
        { p: 'Open a lead and use Message to write to them on WhatsApp or by email. Pick a ready message or write your own; it opens ready to send, and is saved to the lead’s activity.' },
        { p: 'Add a task with a date to be reminded. The Activity tab keeps everything that happened with the lead: messages, stage changes, notes and meetings.' },
        { tip: 'Managers, admins and owners can edit the ready messages, so everyone answers in the same voice.' },
      ],
      action: 'Open leads',
      keywords: 'message whatsapp email reminder task template follow up',
    },
    'notes-mentions': {
      title: 'Notes and mentioning teammates',
      summary: 'Write what you learned, and bring someone in.',
      body: [
        { p: 'Add notes on a lead from its Notes tab. Notes are shared with everyone who can see the lead.' },
        { p: 'Type @ and a teammate’s name to mention them: they get a notification that opens the lead. Only people who can see the lead can be mentioned.' },
      ],
      action: 'Open leads',
      keywords: 'note mention @ comment teammate',
    },
    'import-leads': {
      title: 'Import leads from Excel or CSV',
      summary: 'From another CRM, an event list, or a spreadsheet.',
      body: [
        { steps: ['Open Leads and choose Import.', 'Pick an Excel or CSV file. It needs a header row, and for each lead a name, an email or a phone number.', 'Check the rows: problems are shown first, then those already in your leads.', 'Choose whether to skip leads already here or fill in what they are missing, then import.'] },
        { p: 'Column names can be in Arabic or English, in any order. Optional columns: company, job title, stage, temperature, value, owner (a teammate’s email), date added and notes.' },
        { tip: 'Download the starter file from the import window to see the columns, or export your leads: an exported file imports as it is.' },
      ],
      action: 'Open leads',
      keywords: 'import excel csv spreadsheet upload export',
    },
    duplicates: {
      title: 'Merge duplicate leads',
      summary: 'One person entered twice.',
      body: [
        { p: 'Leads with the same email or phone are usually one person. Open “Possible duplicates” in Leads, choose the lead to keep, and merge.' },
        { p: 'The kept lead’s empty details are filled from the others, and their history and tasks move to it. If two leads are really different people, mark them so, and they won’t be suggested again.' },
      ],
      action: 'Open leads',
      keywords: 'duplicate merge same person',
    },
    'custom-fields': {
      title: 'Your own lead fields',
      summary: 'Budget, city, industry, or whatever your team needs.',
      body: [
        { p: 'Owners and admins can add fields to every lead from Leads → Manage fields: text, a number, a date, a choice from a list, a checkbox or a link.' },
        { p: 'Fields show on each lead, can be filled in when importing, and are included in exports.' },
      ],
      action: 'Open leads',
      keywords: 'custom fields properties attributes',
    },
    meetings: {
      title: 'Meeting requests',
      summary: 'Let visitors ask for a time that suits you.',
      body: [
        { p: 'In the card editor, under Meeting times, choose your working days, hours, how long each meeting is and how much notice you need. The card then offers only those times, and never one already asked for.' },
        { p: 'A meeting request arrives as a lead, with the time asked for.' },
      ],
      action: 'Open your cards',
      keywords: 'meeting booking appointment calendar availability',
    },
    analytics: {
      title: 'Analytics and event reports',
      summary: 'Who opened your cards, from where, and what came of it.',
      body: [
        { p: 'Analytics shows views, saves, taps and leads for any period, where they came from (link, QR or chip), your best cards, and the team’s numbers. Export any of it as CSV.' },
        { p: 'For an exhibition or event, open its report to see the results of those days against your usual, hour by hour, by person and by chip.' },
      ],
      action: 'Open analytics',
      keywords: 'analytics stats views report event exhibition',
    },
    'weekly-report': {
      title: 'The weekly report',
      summary: 'Your week by email every Sunday morning.',
      body: [
        { p: 'Every Sunday morning you get the week’s leads, taps and meetings against the week before, who is waiting for a reply, and the team’s best.' },
        { p: 'Switch it on or off in Notifications → Settings, where you can also send this week’s report to yourself now.' },
      ],
      action: 'Open notification settings',
      keywords: 'weekly email report summary sunday',
    },
    'invite-team': {
      title: 'Invite your team',
      summary: 'Each person gets their own card, and their leads come to the company.',
      body: [
        { steps: ['Open Team and choose Invite.', 'Enter their email and choose their role.', 'They get an email, and join when they accept.'] },
        { p: 'You can invite many people at once from a file. Invitations can be resent or cancelled until they are accepted.' },
        { tip: 'Invitations need your email to be confirmed first. Check your inbox for the link we sent when you signed up.' },
      ],
      action: 'Open team',
      keywords: 'invite member employee add people',
    },
    roles: {
      title: 'Roles: who can do what',
      summary: 'Owner, Admin, Manager and Employee.',
      body: [
        { p: 'Owners can do everything, including billing and deleting the workspace. Admins manage people, teams, chips and the brand. Managers see every lead and can edit the ready messages. Employees work on their own cards, and on the leads their cards bring in or that are given to them.' },
        { p: 'The Roles view in Team shows exactly what each role can do. Change someone’s role from their details in Team.' },
      ],
      action: 'Open team',
      keywords: 'roles permissions owner admin manager employee access',
    },
    brand: {
      title: 'Your company’s brand',
      summary: 'One look on every card.',
      body: [
        { p: 'In Settings → Brand, owners and admins set the company logo and colours. They appear on every card in the workspace, so the company looks the same on each one.' },
      ],
      action: 'Open settings',
      keywords: 'brand logo colors company identity',
    },
    'connect-crm': {
      title: 'Connect your CRM or chat apps',
      summary: 'Send new leads where your team already works.',
      body: [
        { p: 'In Integrations → Apps, connect Salesforce, HubSpot, Pipedrive, Zoho, Microsoft Dynamics 365 or an email tool, and new leads are sent there as they come in.' },
        { p: 'Connect Slack, Microsoft Teams or Telegram to post new leads to a channel. If a connection expires, it shows “Needs attention”: reconnect it to keep it working.' },
      ],
      action: 'Open integrations',
      keywords: 'crm salesforce hubspot pipedrive zoho dynamics slack teams telegram mailchimp brevo',
    },
    automations: {
      title: 'Automations',
      summary: 'When something happens, do something.',
      body: [
        { p: 'An automation runs on its own when an event happens, for example posting every new lead to a channel. Create them in Integrations → Automations, and switch them off without deleting them.' },
      ],
      action: 'Open integrations',
      keywords: 'automation rule trigger workflow',
    },
    'webhooks-api': {
      title: 'Webhooks and API keys',
      summary: 'For developers connecting their own systems.',
      body: [
        { p: 'A webhook sends events (a new lead, a card opened…) to an address of yours as they happen. An API key lets your own systems read and write your workspace’s data.' },
        { p: 'Create both in Integrations. A key’s secret is shown once, so keep it somewhere safe; if it leaks, delete the key and make a new one.' },
        { tip: 'Every endpoint, with examples, and how to check a webhook’s signature are in the API documentation at /developers.' },
      ],
      action: 'Open integrations',
      keywords: 'webhook api key developer token',
    },
    plans: {
      title: 'Plans and paying',
      summary: 'What each plan includes, and changing it.',
      body: [
        { p: 'Plans differ in how many cards, members and NFC chips you can have. Billing shows your plan, what you use, and the plans side by side.' },
        { p: 'Pay by card or mobile wallet. You can change plan or cancel from Billing at any time.' },
      ],
      action: 'Open billing',
      keywords: 'plan price pay subscription upgrade cancel',
    },
    invoices: {
      title: 'Invoices',
      summary: 'Every payment, ready to print or save as PDF.',
      body: [
        { p: 'Each payment makes an invoice. Find them in Billing → Invoices, open one to print it or save it as PDF.' },
        { p: 'Add your company’s name, address and tax number in Billing details, and they appear on invoices from then on.' },
      ],
      action: 'Open billing',
      keywords: 'invoice receipt tax vat pdf',
    },
    'two-step': {
      title: 'Two-step verification',
      summary: 'A code from your phone as well as your password.',
      body: [
        { p: 'In Account, under Two-step verification, switch it on and scan the code with an authenticator app such as Google Authenticator or Microsoft Authenticator. From then on, signing in also asks for the code in the app.' },
        { p: 'Keep the recovery codes you are shown somewhere safe: each one signs you in once if you lose your phone.' },
        { tip: 'Workspace owners can require two-step verification for everyone in the workspace.' },
      ],
      action: 'Open account',
      keywords: '2fa two factor authenticator security code',
    },
    devices: {
      title: 'Where you’re signed in',
      summary: 'See your devices, and sign one out.',
      body: [
        { p: 'In Account, “Where you’re signed in” lists every browser and phone you are signed in on, with where and when it was last used. Sign out any you don’t recognise, or all of them except this one.' },
        { tip: 'If you see a device you don’t know, change your password too.' },
      ],
      action: 'Open account',
      keywords: 'sessions devices sign out logout security',
    },
    'your-data': {
      title: 'Your data, and closing your account',
      summary: 'Download everything, or delete your account.',
      body: [
        { p: 'In Account, under Your data, download a copy of everything about you as a file. Owners can also export a whole workspace.' },
        { p: 'Closing your account deletes your personal data and signs you out everywhere. If you are the only owner of a workspace that has other members, make someone else an owner first.' },
      ],
      action: 'Open account',
      keywords: 'export download delete close account privacy gdpr',
    },
  },
};

const ar: HelpStrings = {
  categories: {
    start: { title: 'البداية', desc: 'ما يقدّمه Vertex Connect، والخطوات الأولى.' },
    cards: { title: 'بطاقتك', desc: 'البيانات والروابط والأقسام والتصميم واللغات.' },
    sharing: { title: 'المشاركة وشرائح NFC', desc: 'الروابط ورموز QR والشرائح ومقابلة الناس.' },
    leads: { title: 'العملاء والمتابعة', desc: 'من ترك بياناته، وما الخطوة التالية.' },
    team: { title: 'فريقك', desc: 'دعوة الأعضاء والأدوار وهوية الشركة.' },
    integrations: { title: 'التكاملات', desc: 'نظام CRM وتطبيقات المحادثة والـ Webhooks والـ API.' },
    billing: { title: 'الخطط والدفع', desc: 'اختيار الخطة والدفع والفواتير.' },
    account: { title: 'الحساب والأمان', desc: 'تسجيل الدخول والتحقق بخطوتين وبياناتك.' },
  },
  ui: {
    title: 'مركز المساعدة',
    ask: 'كيف يمكننا مساعدتك؟',
    subtitle: 'إجابات لأكثر ما يُسأل عنه، وشخص من فريقنا حين تحتاجه.',
    search: 'ابحث في المساعدة، مثل «استيراد العملاء» أو «شريحة»',
    searchLabel: 'ابحث في المساعدة',
    popular: 'الأكثر قراءة',
    browse: 'تصفّح حسب الموضوع',
    results_zero: 'لا مقالات مطابقة',
    noResults: 'لا شيء يطابق «{{q}}».',
    noResultsHint: 'جرّب كلمات أخرى، أو راسلنا وسيردّ عليك أحد أفراد فريقنا.',
    clear: 'مسح',
    back: 'مركز المساعدة',
    home: 'مركز المساعدة',
    related: 'مقالات ذات صلة',
    helpful: 'هل أجاب هذا عن سؤالك؟',
    yes: 'نعم',
    no: 'لا',
    thanks: 'شكرًا لك.',
    thanksNo: 'شكرًا. أخبرنا بما كان ناقصًا وسيساعدك أحد أفراد فريقنا.',
    stillStuck: 'ما زلت تحتاج مساعدة؟',
    contactTitle: 'راسلنا',
    contactBody: 'يردّ عليك أحد أفراد فريقنا بالبريد، عادةً خلال يوم عمل.',
    contact: 'تواصل مع الدعم',
    tip: 'نصيحة',
    yourRequests: 'رسائلك',
    open: 'مفتوحة',
    closed: 'تم الرد',
    notFound: 'هذا المقال غير موجود',
    notFoundBody: 'ربما نُقل. ابحث عنه أو تصفّح المواضيع.',
    formTitle: 'تواصل مع الدعم',
    formSubtitle: 'أخبرنا بما حدث. نعرف الصفحة التي كنت فيها، فلا داعي لشرح مكانها.',
    topic: 'الموضوع',
    topics: {
      account: 'الحساب وتسجيل الدخول',
      billing: 'الخطط والدفع',
      cards: 'البطاقات',
      leads: 'العملاء',
      chips: 'شرائح NFC',
      team: 'الفريق',
      integrations: 'التكاملات',
      bug: 'شيء لا يعمل',
      other: 'شيء آخر',
    },
    subject: 'العنوان',
    subjectPlaceholder: 'في كلمات قليلة',
    message: 'الرسالة',
    messagePlaceholder: 'ما الذي جرّبته، وما الذي توقعته، وما الذي حدث بدلًا منه.',
    messageHint: '10 أحرف على الأقل.',
    sending: 'جارٍ الإرسال…',
    send: 'إرسال',
    cancel: 'إلغاء',
    close: 'إغلاق',
    sentTitle: 'وصلتنا رسالتك',
    sentBody: 'رقمها {{ref}}. أرسلنا لك نسخة بالبريد، وسيردّ عليك أحد أفراد فريقنا على {{email}}.',
    failed: 'لم تُرسَل الرسالة. تحقّق من اتصالك وحاول مرة أخرى.',
    tooMany: 'أرسلت عدة رسائل للتو. انتظر بضع دقائق، أو أضف إلى رسالة سابقة بالرد على بريدها.',
    replyBy: 'نردّ عليك على {{email}}',
  },
  articles: {
    'what-is-vertex': {
      title: 'ما الذي يقدّمه Vertex Connect',
      summary: 'بطاقات أعمال رقمية تجلب العملاء، ومكان واحد لمتابعتهم.',
      body: [
        { p: 'يمنحك Vertex Connect، أو يمنح كل فرد في شركتك، بطاقة أعمال رقمية: صفحة فيها اسمك وصورتك وطرق التواصل معك وروابطك. يفتحها الناس من رابط أو رمز QR أو بلمسة شريحة NFC، ويحفظونك في هواتفهم بلمسة واحدة، ويمكنهم ترك بياناتهم لك.' },
        { p: 'كل من يترك بياناته يصبح عميلًا محتملًا. يصل العملاء إلى مكان واحد ترى فيه من ينتظر الرد، وتراسلهم على واتساب أو بالبريد، وتضيف الملاحظات والمهام، وتنقلهم بين مراحل البيع.' },
        { p: 'تُظهر التحليلات عدد من فتح كل بطاقة، ومن أين، وكم منهم أصبح عميلًا، لشخص واحد أو للفريق كله.' },
      ],
      action: 'افتح الرئيسية',
      keywords: 'عن البرنامج مقدمة ما هو نبذة',
    },
    'personal-or-team': {
      title: 'مساحة عمل شخصية أم فريق',
      summary: 'أيهما لديك، وما الفرق بينهما، وكيف تنتقل.',
      body: [
        { p: 'عند التسجيل تختار بين مساحة عمل لنفسك ومساحة لشركة أو فريق. المساحة الشخصية فيها بطاقاتك وعملاؤك فقط. مساحة الفريق تضيف الأعضاء والأدوار والأقسام والفرق، وهوية موحّدة للشركة، وعملاء يتبعون الشركة.' },
        { p: 'يمكنك تحويل المساحة الشخصية إلى مساحة فريق في أي وقت: افتح الإعدادات ثم «حوّلها إلى مساحة فريق» واكتب اسم الشركة. تبقى بطاقاتك وعملاؤك كما هم.' },
        { tip: 'يمكنك أن تكون في عدة مساحات عمل معًا، مثل مساحتك ومساحة شركتك. انتقل بينها من القائمة أعلى الشريط الجانبي.' },
      ],
      action: 'افتح إعدادات المساحة',
      keywords: 'مساحة عمل شركة مؤسسة تحويل تبديل شخصي فريق',
    },
    'getting-started-guide': {
      title: 'دليل البداية',
      summary: 'الخطوات في الشريط الجانبي التي توصل الحساب الجديد إلى بطاقة تجلب العملاء.',
      body: [
        { p: 'يُظهر الدليل أسفل الشريط الجانبي إلى أين وصلت والخطوة التالية. اضغط عليه لترى كل الخطوات؛ كل خطوة تفتح الصفحة التي تُنجزها فيها.' },
        { p: 'تكتمل الخطوات وحدها كلما تقدّمت، بحسب ما في مساحة عملك فعلًا: بطاقة، وصورة، وطريقة للتواصل، ونشر البطاقة وفتحها من أحد، وأول عميل، وطريقة معرفتك بالعملاء الجدد، ودعوة فريقك (لمالكي الشركات ومديريها)، وربط شريحة.' },
        { p: 'يمكنك إخفاء الدليل من قائمته، وإعادته من «عرض قائمة الإعداد» في الرئيسية. وحين تكتمل كل الخطوات يختفي وحده.' },
      ],
      action: 'افتح الرئيسية',
      keywords: 'بداية إعداد خطوات دليل قائمة',
    },
    'create-card': {
      title: 'أنشئ بطاقتك',
      summary: 'من بطاقة جديدة إلى بطاقة جاهزة للمشاركة في دقائق.',
      body: [
        { steps: ['افتح البطاقات واختر «بطاقة جديدة».', 'اختر قالبًا، ثم اكتب اسمك ومسمّاك الوظيفي وشركتك.', 'أضف صورتك: يتذكر الناس الوجه أكثر من الاسم.', 'أضف هاتفك أو بريدك، والروابط التي يتواصل بها الناس معك مثل واتساب أو لينكدإن.', 'غيّر حالة البطاقة إلى «منشورة» ليعمل رابطها ورمز QR والشرائح.'] },
        { p: 'تعرض المعاينة بجانب المحرّر البطاقة كما ستظهر على الهاتف. تُحفظ التغييرات أثناء الكتابة.' },
        { tip: 'البطاقة في حالة «مسودة» لا يراها إلا أنت وفريقك، فتستطيع ضبطها قبل أن يفتحها أحد.' },
      ],
      action: 'أنشئ بطاقة',
      keywords: 'بطاقة جديدة إنشاء نشر ملف',
    },
    'card-links': {
      title: 'الروابط والأزرار في بطاقتك',
      summary: 'الهاتف والبريد وواتساب ولينكدإن وأي طريقة أخرى للتواصل.',
      body: [
        { p: 'الروابط هي أزرار بطاقتك. من تبويب «المحتوى» في البطاقة اختر «أضف رابطًا» ثم المنصة: الهاتف، البريد، واتساب، موقع، لينكدإن، إنستجرام وغيرها الكثير.' },
        { p: 'اسحب الروابط لتغيير ترتيبها. أوقف أي رابط لإخفائه دون حذفه. ولواتساب يمكنك كتابة رسالة تظهر جاهزة حين يفتح الزائر المحادثة.' },
        { p: 'على الهاتف تفتح روابط واتساب ولينكدإن في تطبيقاتها إن كانت لدى الزائر.' },
      ],
      action: 'افتح بطاقاتك',
      keywords: 'أزرار روابط واتساب لينكدإن انستجرام موقع سوشيال',
    },
    'card-sections': {
      title: 'الأقسام: نبذة ومعرض وفيديو والمزيد',
      summary: 'محتوى أطول أسفل الأزرار.',
      body: [
        { p: 'تضيف الأقسام المزيد إلى بطاقتك أسفل أزرارها: نبذة (سطور عنك)، وحسابات التواصل الاجتماعي، ومعرض لأعمالك، وفيديو من يوتيوب أو فيميو، وزر حجز، وشهاداتك، وشعارات العملاء الذين عملت معهم.' },
        { p: 'أضفها من تبويب «المحتوى» في البطاقة تحت «الأقسام». يمكن إخفاء أي قسم دون حذفه، وتحريكه لأعلى أو لأسفل.' },
      ],
      action: 'افتح بطاقاتك',
      keywords: 'نبذة معرض أعمال فيديو حجز شهادات عملاء شعارات أقسام',
    },
    'card-design': {
      title: 'شكل بطاقتك',
      summary: 'القوالب والألوان والغلاف وهوية شركتك.',
      body: [
        { p: 'يغيّر تبويب «القوالب» تصميم البطاقة بالكامل وتبقى بياناتك كما هي. ويغيّر تبويب «التصميم» الألوان والغلاف، وهل تتبع البطاقة الوضع الفاتح أو الداكن في الهاتف.' },
        { p: 'في مساحة الفريق، يظهر الشعار والألوان المحددة في الإعدادات ← الهوية على بطاقات الجميع، فتبدو الشركة واحدة في كل بطاقة.' },
      ],
      action: 'افتح بطاقاتك',
      keywords: 'قالب تصميم ألوان غلاف وضع داكن شعار شكل',
    },
    'two-languages': {
      title: 'بطاقة بالعربية والإنجليزية',
      summary: 'بطاقة واحدة تتحدث لغة الزائر.',
      body: [
        { p: 'يمكنك إضافة لغة ثانية للبطاقة: اسمك ومسمّاك وشركتك ونبذتك بالعربية والإنجليزية. يرى الزائر الذي لغة هاتفه تلك اللغة أولًا، ويستطيع أي أحد تبديل اللغة من البطاقة.' },
        { p: 'أضف الاسم باللغة الثانية أولًا؛ حين يكون له اسم تعرض البطاقة زر التبديل.' },
      ],
      action: 'افتح بطاقاتك',
      keywords: 'عربي انجليزي لغتين لغة ترجمة',
    },
    'card-profiles': {
      title: 'عدة ملفات على رابط واحد',
      summary: 'اعرض بيانات مختلفة في معرض، أو لأشخاص معيّنين، أو في أوقات محددة.',
      body: [
        { p: 'تحتفظ البطاقة برابط عام واحد، لكن يمكن أن يكون لها عدة ملفات تُعدّها من تبويب «النسخ». كل ملف يمكنه تغيير البيانات والشكل والروابط والأقسام.' },
        { p: 'يظهر الملف لمن معه رابطه الخاص أو رمز المرور، أو حسب جدول زمني (مثلًا أثناء معرض)، أو حين تشغّله أنت. وإن لم ينطبق أيّها يظهر الملف الافتراضي.' },
      ],
      action: 'افتح بطاقاتك',
      keywords: 'ملفات نسخ رمز مرور خاص جدول معرض',
    },
    'card-address': {
      title: 'عنوان البطاقة ونشرها وحذفها',
      summary: 'رابطها، ومن يستطيع رؤيتها، وإزالتها.',
      body: [
        { p: 'من تبويب «الإعدادات» في البطاقة يمكنك تغيير العنوان في رابطها (حروف وأرقام وشرطات). تغييره يوقف الرابط القديم، فغيّره قبل مشاركة البطاقة.' },
        { p: '«منشورة» تعني أن أي أحد معه الرابط أو شريحة يستطيع فتحها. «مسودة» تعني أنك وفريقك فقط تستطيعون ذلك.' },
        { p: 'حذف البطاقة يزيلها مع روابطها وأقسامها؛ والشرائح المرتبطة بها تصبح متاحة لربطها ببطاقة أخرى.' },
      ],
      action: 'افتح بطاقاتك',
      keywords: 'رابط عنوان نشر مسودة حذف',
    },
    'move-card': {
      title: 'انقل بطاقة إلى مساحة عمل أخرى',
      summary: 'مثلًا من مساحتك الشخصية إلى مساحة شركتك.',
      body: [
        { p: 'من تبويب «الإعدادات» في البطاقة اختر «انقل إلى مساحة عمل أخرى» ثم اختر مساحة أنت فيها. تحتفظ البطاقة برابطها ورمز QR، وينتقل معها عملاؤها ومشاهداتها ولمساتها.' },
        { p: 'تبقى شرائح NFC الخاصة بها في المساحة القديمة وتُفصل عنها، فاربطها من جديد (أو شرائح أخرى) في المساحة الجديدة.' },
      ],
      action: 'افتح بطاقاتك',
      keywords: 'نقل تحويل مساحة شركة',
    },
    'share-card': {
      title: 'شارك بطاقتك',
      summary: 'رابط، أو رمز QR، أو لمسة.',
      body: [
        { p: 'لكل بطاقة منشورة رابط ورمز QR. افتح البطاقة واستخدم «المشاركة ورمز QR» لنسخ الرابط أو تنزيل الرمز. يستطيع أي أحد مسح الرمز بكاميرا هاتفه دون أي تطبيق.' },
        { p: 'ضع الرابط في توقيع بريدك وحالة واتساب وحساباتك على مواقع التواصل. واطبع رمز QR على الكتيّبات وأجنحة المعارض وبطاقتك الورقية.' },
        { tip: 'تقابل أحدًا وجهًا لوجه؟ «قابلت شخصًا» يعرض رمز QR الخاص بك بملء الشاشة جاهزًا للمسح.' },
      ],
      action: 'افتح بطاقاتك',
      keywords: 'مشاركة رابط رمز qr كيو ار إرسال توقيع',
    },
    'nfc-chips': {
      title: 'شرائح NFC',
      summary: 'بطاقة أو ملصق أو ميدالية تفتح بطاقتك بلمسة.',
      body: [
        { p: 'الشريحة بطاقة أو ملصق أو ميدالية. لمسها بالهاتف يفتح البطاقة المرتبطة بها، على آيفون وأندرويد، دون أي تطبيق.' },
        { steps: ['افتح «بطاقات NFC» واختر «أضف شرائح».', 'أضف الشرائح التي استلمتها: المسها بهاتف أندرويد في كروم، أو اكتب الرقم التسلسلي المطبوع على العبوة، أو الصق قائمة.', 'اربط كل شريحة ببطاقة.', 'وزّعها. يمكنك ربط الشريحة ببطاقة أخرى في أي وقت، ولا تتغير الشريحة نفسها.'] },
        { tip: 'لا يمكن إضافة إلا الشرائح المخصّصة لمساحة عملك. إن رُفضت شريحة يظهر السبب بجانبها.' },
      ],
      action: 'افتح بطاقات NFC',
      keywords: 'شريحة nfc لمس ملصق ميدالية تاج',
    },
    'program-chip': {
      title: 'اكتب على شريحة NFC فارغة من هاتفك',
      summary: 'استخدم أي شريحة فارغة مع بطاقتك.',
      body: [
        { p: 'على هاتف أندرويد في كروم، افتح البطاقة ثم تبويب «شرائح NFC» واختر «برمجة الشريحة». ضع شريحة فارغة على ظهر الهاتف: يُكتب الرابط عليها وتُربط بالبطاقة.' },
        { p: 'ثم المسها مرة أخرى للتحقق من الرابط المكتوب عليها. ويمكنك أيضًا قفل الشريحة فلا يستطيع أحد تغييرها أو مسحها، ولا أنت؛ ولا يمكن التراجع عن ذلك.' },
        { tip: 'لا يسمح آيفون للمواقع بالكتابة على شرائح NFC. استخدم هاتف أندرويد، أو شرائح من عندنا.' },
      ],
      action: 'افتح شرائح NFC',
      keywords: 'كتابة برمجة شريحة فارغة اندرويد قفل',
    },
    'met-someone': {
      title: 'قابلت شخصًا',
      summary: 'تبادل البيانات وجهًا لوجه في ثوانٍ.',
      body: [
        { p: 'يعرض «قابلت شخصًا» بطاقتك كرمز QR كبير ليمسحه الشخص الآخر. يفتح هاتفه بطاقتك، ويستطيع حفظك أو إرسال بياناته لك.' },
        { p: 'ويمكنك أيضًا إضافته بنفسك: صوّر بطاقته الورقية أو اكتب رقمه. يُضاف إلى عملائك مع مكان لقائكما.' },
      ],
      action: 'افتح «قابلت شخصًا»',
      keywords: 'مقابلة معرض حدث مسح بطاقة ورقية وجها لوجه',
    },
    'leads-come-in': {
      title: 'من أين يأتي العملاء',
      summary: 'زوار يتركون بياناتهم، وملفات تستوردها، وأشخاص تقابلهم.',
      body: [
        { p: 'العميل المحتمل هو من ترك بياناته في إحدى بطاقاتك، أو طلب موعدًا، أو استوردته من ملف، أو أضفته بنفسك. يصل كل عميل إلى «العملاء المحتملون» مع البطاقة التي جاء منها.' },
        { p: 'في الفريق، يتبع كل عميل الشركة. يرى الموظف العملاء الذين جلبتهم بطاقاته والمسندين إليه، ويرى المديرون والمسؤولون والمالكون كل العملاء. والعملاء الجدد الذين لم يتواصل معهم أحد بعد يظهر بجانبهم منذ متى ينتظرون.' },
        { p: 'انقل العملاء بين المراحل على لوحة المراحل، وصنّفهم ساخن أو دافئ أو بارد، وحدّد قيمة لكل منهم.' },
      ],
      action: 'افتح العملاء',
      keywords: 'عميل عملاء محتملين مراحل crm بيع',
    },
    'lead-alerts': {
      title: 'اعرف بالعملاء الجدد',
      summary: 'بالبريد أو واتساب أو إشعار على هاتفك.',
      body: [
        { p: 'من الإشعارات ← الإعدادات اختر كيف تعرف بالعميل الجديد: البريد، أو واتساب (برقمك مع رمز الدولة)، أو كلاهما. أرسل تجربة لتتأكد أنها تصل.' },
        { p: 'لتصلك الإشعارات على هذا الهاتف أو الكمبيوتر حتى والتطبيق مغلق، شغّل إشعارات الجهاز من هناك أيضًا. على آيفون أضف التطبيق إلى الشاشة الرئيسية أولًا.' },
      ],
      action: 'اختر التنبيهات',
      keywords: 'إشعارات تنبيهات بريد واتساب',
    },
    'follow-up': {
      title: 'تابع العميل',
      summary: 'راسله، وضع تذكيرًا، واحتفظ بالسجل.',
      body: [
        { p: 'افتح العميل واستخدم «رسالة» لمراسلته على واتساب أو بالبريد. اختر رسالة جاهزة أو اكتب رسالتك؛ تُفتح جاهزة للإرسال وتُحفظ في سجل العميل.' },
        { p: 'أضف مهمة بتاريخ ليصلك تذكير. ويحتفظ تبويب «النشاط» بكل ما حدث مع العميل: الرسائل وتغيير المراحل والملاحظات والمواعيد.' },
        { tip: 'يستطيع المديرون والمسؤولون والمالكون تعديل الرسائل الجاهزة، فيردّ الجميع بالأسلوب نفسه.' },
      ],
      action: 'افتح العملاء',
      keywords: 'رسالة واتساب بريد تذكير مهمة قالب متابعة',
    },
    'notes-mentions': {
      title: 'الملاحظات والإشارة إلى زملائك',
      summary: 'اكتب ما عرفته، وأشرك زميلًا.',
      body: [
        { p: 'أضف ملاحظات على العميل من تبويب «الملاحظات». الملاحظات مشتركة مع كل من يرى العميل.' },
        { p: 'اكتب @ ثم اسم زميلك للإشارة إليه: يصله إشعار يفتح العميل. ولا يمكن الإشارة إلا لمن يستطيع رؤية العميل.' },
      ],
      action: 'افتح العملاء',
      keywords: 'ملاحظة منشن إشارة @ تعليق زميل',
    },
    'import-leads': {
      title: 'استورد العملاء من إكسل أو CSV',
      summary: 'من نظام CRM آخر، أو قائمة معرض، أو جدول بيانات.',
      body: [
        { steps: ['افتح العملاء واختر «استيراد».', 'اختر ملف إكسل أو CSV. يحتاج إلى صف عناوين، ولكل عميل اسم أو بريد أو رقم هاتف.', 'راجع الصفوف: تظهر المشكلات أولًا، ثم من هم موجودون بالفعل في عملائك.', 'اختر تخطّي الموجودين أو استكمال ما ينقصهم، ثم استورد.'] },
        { p: 'يمكن أن تكون أسماء الأعمدة بالعربية أو الإنجليزية وبأي ترتيب. الأعمدة الاختيارية: الشركة، المسمّى الوظيفي، المرحلة، الاهتمام، القيمة، المسؤول (بريد زميل)، تاريخ الإضافة، الملاحظات.' },
        { tip: 'نزّل الملف النموذجي من نافذة الاستيراد لترى الأعمدة، أو صدّر عملاءك: الملف المصدَّر يُستورد كما هو.' },
      ],
      action: 'افتح العملاء',
      keywords: 'استيراد إكسل اكسل csv جدول رفع ملف تصدير',
    },
    duplicates: {
      title: 'دمج العملاء المكررين',
      summary: 'شخص واحد مُدخل مرتين.',
      body: [
        { p: 'العملاء الذين لهم البريد نفسه أو الهاتف نفسه غالبًا شخص واحد. افتح «عملاء محتملون مكررون» في العملاء، واختر العميل الذي تبقيه، ثم ادمج.' },
        { p: 'تُستكمل البيانات الفارغة في العميل الباقي من الآخرين، وينتقل إليه سجلهم ومهامهم. وإن كانا شخصين مختلفين فعلًا، حدّد ذلك فلن يُقترحا مرة أخرى.' },
      ],
      action: 'افتح العملاء',
      keywords: 'تكرار مكرر دمج نفس الشخص',
    },
    'custom-fields': {
      title: 'حقول العملاء الخاصة بك',
      summary: 'الميزانية أو المدينة أو المجال، أو أي شيء يحتاجه فريقك.',
      body: [
        { p: 'يستطيع المالكون والمديرون إضافة حقول لكل العملاء من العملاء ← إدارة الحقول: نص، رقم، تاريخ، اختيار من قائمة، مربع اختيار، أو رابط.' },
        { p: 'تظهر الحقول في كل عميل، ويمكن ملؤها عند الاستيراد، وتُضمَّن في التصدير.' },
      ],
      action: 'افتح العملاء',
      keywords: 'حقول مخصصة خصائص بيانات إضافية',
    },
    meetings: {
      title: 'طلبات المواعيد',
      summary: 'دع الزوار يطلبون وقتًا يناسبك.',
      body: [
        { p: 'في محرّر البطاقة تحت «مواعيد اللقاءات»، اختر أيام عملك وساعاتك ومدة كل لقاء والمهلة التي تحتاجها. تعرض البطاقة بعدها هذه الأوقات فقط، ولا تعرض وقتًا طُلب من قبل.' },
        { p: 'يصل طلب الموعد كعميل محتمل مع الوقت المطلوب.' },
      ],
      action: 'افتح بطاقاتك',
      keywords: 'موعد لقاء حجز تقويم أوقات',
    },
    analytics: {
      title: 'التحليلات وتقارير الفعاليات',
      summary: 'من فتح بطاقاتك، ومن أين، وماذا نتج عن ذلك.',
      body: [
        { p: 'تعرض التحليلات المشاهدات والحفظ واللمسات والعملاء لأي فترة، ومصدرها (رابط أو QR أو شريحة)، وأفضل بطاقاتك، وأرقام الفريق. ويمكن تصدير أيٍّ منها CSV.' },
        { p: 'لمعرض أو فعالية، افتح تقريرها لترى نتائج تلك الأيام مقارنة بالمعتاد، ساعة بساعة، ولكل شخص ولكل شريحة.' },
      ],
      action: 'افتح التحليلات',
      keywords: 'تحليلات إحصائيات مشاهدات تقرير معرض فعالية',
    },
    'weekly-report': {
      title: 'التقرير الأسبوعي',
      summary: 'أسبوعك بالبريد كل صباح أحد.',
      body: [
        { p: 'كل صباح أحد يصلك عملاء الأسبوع ولمساته ومواعيده مقارنة بالأسبوع السابق، ومن ينتظر الرد، والأفضل في الفريق.' },
        { p: 'شغّله أو أوقفه من الإشعارات ← الإعدادات، ومن هناك يمكنك أيضًا إرسال تقرير هذا الأسبوع لنفسك الآن.' },
      ],
      action: 'افتح إعدادات الإشعارات',
      keywords: 'أسبوعي بريد تقرير ملخص الأحد',
    },
    'invite-team': {
      title: 'ادعُ فريقك',
      summary: 'لكل شخص بطاقته، وعملاؤه يأتون للشركة.',
      body: [
        { steps: ['افتح الفريق واختر «دعوة».', 'اكتب بريده واختر دوره.', 'تصله رسالة بالبريد، وينضم حين يقبل.'] },
        { p: 'يمكنك دعوة عدد كبير دفعة واحدة من ملف. ويمكن إعادة إرسال الدعوات أو إلغاؤها حتى تُقبل.' },
        { tip: 'تحتاج الدعوات إلى تأكيد بريدك أولًا. ابحث في بريدك عن الرابط الذي أرسلناه عند التسجيل.' },
      ],
      action: 'افتح الفريق',
      keywords: 'دعوة عضو موظف إضافة أشخاص',
    },
    roles: {
      title: 'الأدوار: من يستطيع ماذا',
      summary: 'المالك والمسؤول والمدير والموظف.',
      body: [
        { p: 'المالك يستطيع كل شيء، ومنه الفوترة وحذف مساحة العمل. المسؤول يدير الأشخاص والفرق والشرائح والهوية. المدير يرى كل العملاء ويعدّل الرسائل الجاهزة. والموظف يعمل على بطاقاته، وعلى العملاء الذين جلبتهم بطاقاته أو أُسندوا إليه.' },
        { p: 'يُظهر عرض «الأدوار» في الفريق بالضبط ما يستطيعه كل دور. وغيّر دور أي شخص من تفاصيله في الفريق.' },
      ],
      action: 'افتح الفريق',
      keywords: 'أدوار صلاحيات مالك مسؤول مدير موظف',
    },
    brand: {
      title: 'هوية شركتك',
      summary: 'شكل واحد في كل بطاقة.',
      body: [
        { p: 'من الإعدادات ← الهوية، يحدد المالكون والمسؤولون شعار الشركة وألوانها. تظهر على كل بطاقة في مساحة العمل، فتبدو الشركة واحدة في كل بطاقة.' },
      ],
      action: 'افتح الإعدادات',
      keywords: 'هوية شعار ألوان شركة براند',
    },
    'connect-crm': {
      title: 'اربط نظام CRM أو تطبيقات المحادثة',
      summary: 'أرسل العملاء الجدد إلى حيث يعمل فريقك.',
      body: [
        { p: 'من التكاملات ← التطبيقات اربط Salesforce أو HubSpot أو Pipedrive أو Zoho أو Microsoft Dynamics 365 أو أداة بريد تسويقي، فيُرسَل إليها العملاء الجدد فور وصولهم.' },
        { p: 'اربط Slack أو Microsoft Teams أو Telegram لنشر العملاء الجدد في قناة. وإن انتهت صلاحية ربط يظهر «يحتاج انتباهك»: أعد الربط ليستمر في العمل.' },
      ],
      action: 'افتح التكاملات',
      keywords: 'crm سيلزفورس هبسبوت بايبدرايف زوهو داينامكس سلاك تيمز تيليجرام ميلشيمب',
    },
    automations: {
      title: 'الأتمتة',
      summary: 'حين يحدث شيء، افعل شيئًا.',
      body: [
        { p: 'تعمل الأتمتة وحدها عند وقوع حدث، مثل نشر كل عميل جديد في قناة. أنشئها من التكاملات ← الأتمتة، وأوقفها دون حذفها.' },
      ],
      action: 'افتح التكاملات',
      keywords: 'أتمتة قاعدة تلقائي سير عمل',
    },
    'webhooks-api': {
      title: 'الـ Webhooks ومفاتيح الـ API',
      summary: 'للمطوّرين الذين يربطون أنظمتهم.',
      body: [
        { p: 'يرسل الـ Webhook الأحداث (عميل جديد، فتح بطاقة…) إلى عنوان لديك فور حدوثها. ويتيح مفتاح الـ API لأنظمتك قراءة بيانات مساحة عملك وكتابتها.' },
        { p: 'أنشئ الاثنين من التكاملات. يظهر سرّ المفتاح مرة واحدة، فاحفظه في مكان آمن؛ وإن تسرّب احذف المفتاح وأنشئ غيره.' },
        { tip: 'كل نقاط الواجهة مع أمثلتها، وطريقة التحقق من توقيع الـ Webhook، في توثيق الـ API على ‎/developers.' },
      ],
      action: 'افتح التكاملات',
      keywords: 'webhook ويب هوك api مفتاح مطور توكن',
    },
    plans: {
      title: 'الخطط والدفع',
      summary: 'ما تتضمنه كل خطة، وكيف تغيّرها.',
      body: [
        { p: 'تختلف الخطط في عدد البطاقات والأعضاء وشرائح NFC المتاحة. تعرض صفحة الفوترة خطتك وما تستخدمه والخطط جنبًا إلى جنب.' },
        { p: 'ادفع بالبطاقة أو المحفظة الإلكترونية. يمكنك تغيير الخطة أو إلغاؤها من الفوترة في أي وقت.' },
      ],
      action: 'افتح الفوترة',
      keywords: 'خطة سعر دفع اشتراك ترقية إلغاء',
    },
    invoices: {
      title: 'الفواتير',
      summary: 'كل دفعة، جاهزة للطباعة أو الحفظ PDF.',
      body: [
        { p: 'كل دفعة تُنشئ فاتورة. تجدها في الفوترة ← الفواتير، وافتح أيًّا منها لطباعتها أو حفظها PDF.' },
        { p: 'أضف اسم شركتك وعنوانها ورقمها الضريبي في «بيانات الفوترة»، فتظهر على الفواتير من حينها.' },
      ],
      action: 'افتح الفوترة',
      keywords: 'فاتورة إيصال ضريبة pdf',
    },
    'two-step': {
      title: 'التحقق بخطوتين',
      summary: 'رمز من هاتفك إلى جانب كلمة المرور.',
      body: [
        { p: 'من الحساب، تحت «التحقق بخطوتين»، شغّله وامسح الرمز بتطبيق مصادقة مثل Google Authenticator أو Microsoft Authenticator. بعدها يطلب تسجيل الدخول أيضًا الرمز الظاهر في التطبيق.' },
        { p: 'احفظ رموز الاسترداد التي تظهر لك في مكان آمن: كل رمز يُدخلك مرة واحدة إن فقدت هاتفك.' },
        { tip: 'يستطيع مالكو مساحات العمل إلزام كل من فيها بالتحقق بخطوتين.' },
      ],
      action: 'افتح الحساب',
      keywords: 'خطوتين تحقق مصادقة أمان رمز 2fa',
    },
    devices: {
      title: 'الأجهزة المسجَّل دخولك عليها',
      summary: 'اعرض أجهزتك، وأخرِج أيًّا منها.',
      body: [
        { p: 'يعرض الحساب تحت «الأجهزة المسجّل دخولك عليها» كل متصفح وهاتف سجّلت الدخول عليه، مع مكانه وآخر استخدام له. سجّل الخروج من أي جهاز لا تعرفه، أو من الجميع ما عدا هذا الجهاز.' },
        { tip: 'إن رأيت جهازًا لا تعرفه، غيّر كلمة المرور أيضًا.' },
      ],
      action: 'افتح الحساب',
      keywords: 'جلسات أجهزة تسجيل خروج أمان',
    },
    'your-data': {
      title: 'بياناتك وإغلاق حسابك',
      summary: 'نزّل كل شيء، أو احذف حسابك.',
      body: [
        { p: 'من الحساب، تحت «بياناتك»، نزّل نسخة من كل ما يخصك في ملف. ويستطيع المالكون أيضًا تصدير مساحة عمل كاملة.' },
        { p: 'إغلاق الحساب يحذف بياناتك الشخصية ويُخرجك من كل الأجهزة. وإن كنت المالك الوحيد لمساحة فيها أعضاء آخرون، اجعل شخصًا آخر مالكًا أولًا.' },
      ],
      action: 'افتح الحساب',
      keywords: 'تصدير تنزيل حذف إغلاق حساب خصوصية',
    },
  },
};

export const HELP: Record<HelpLocale, HelpStrings> = { en, ar };

/** "3 articles" / "٣ مقالات", in each language's own plural. */
export function articleCount(locale: HelpLocale, n: number): string {
  if (locale === 'en') return n === 1 ? '1 article' : `${n} articles`;
  if (n === 1) return 'مقال واحد';
  if (n === 2) return 'مقالان';
  if (n % 100 >= 3 && n % 100 <= 10) return `${n} مقالات`;
  return `${n} مقالًا`;
}

export const helpLocale = (lang: string | undefined): HelpLocale => (lang?.startsWith('ar') ? 'ar' : 'en');

export interface HelpArticle extends HelpArticleMeta, HelpArticleText {}

export function article(locale: HelpLocale, slug: string): HelpArticle | null {
  const meta = HELP_ARTICLES.find((a) => a.slug === slug);
  const text = HELP[locale].articles[slug];
  return meta && text ? { ...meta, ...text } : null;
}

export const articlesIn = (locale: HelpLocale, category: HelpCategory): HelpArticle[] =>
  HELP_ARTICLES.filter((a) => a.category === category).map((a) => article(locale, a.slug)!);

/**
 * Arabic letters that are written several ways (أ إ آ ا, ة ه, ى ي) and the
 * marks over them, made one, so "اضافة" finds "إضافة". Lower case for English.
 */
export function fold(s: string): string {
  return s
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي');
}

/**
 * Articles for what someone typed, best first: every word has to be found
 * somewhere, and a word in the title counts most, then the summary and
 * keywords, then the body.
 */
export function searchHelp(locale: HelpLocale, query: string): HelpArticle[] {
  const words = fold(query)
    .split(/[\s,،.?؟!]+/)
    .filter((w) => w.length > 1 || /\d/.test(w));
  if (!words.length) return [];
  const scored: { a: HelpArticle; score: number }[] = [];
  for (const meta of HELP_ARTICLES) {
    const a = article(locale, meta.slug)!;
    const title = fold(a.title);
    const lead = fold(`${a.summary} ${a.keywords ?? ''} ${HELP[locale].categories[a.category].title}`);
    const body = fold(a.body.map((b) => ('p' in b ? b.p : 'tip' in b ? b.tip : b.steps.join(' '))).join(' '));
    let score = 0;
    let all = true;
    for (const w of words) {
      const s = (title.includes(w) ? 10 : 0) + (lead.includes(w) ? 4 : 0) + (body.includes(w) ? 1 : 0);
      if (!s) {
        all = false;
        break;
      }
      score += s;
    }
    if (all) scored.push({ a, score });
  }
  return scored.sort((x, y) => y.score - x.score).map((s) => s.a);
}
