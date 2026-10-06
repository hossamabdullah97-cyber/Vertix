'use client';

import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import QRCode from 'qrcode';
import { motion, AnimatePresence } from 'framer-motion';
import { offerUndo } from '@/lib/undo';
import { problemOf, useChecks } from '@/lib/validate';
import { FieldError } from '@/components/ui/FieldError';
import { authFetch, getToken, peek, remember, type Card as CardType, type Section, type CardAction, type NfcTag } from '@/lib/client';

import type { Template } from '@/lib/templates';
import { TemplateMarketplace } from '@/components/TemplateMarketplace';
import { CardProfiles } from '@/components/CardProfiles';
import PaymentLinksManager, { type PaymentLinkRow } from '@/components/cards/PaymentLinksManager';
import ActionCard, { isQuickAction } from '@/components/cards/ActionCard';
import QuickStart from '@/components/cards/QuickStart';
import NfcProgrammer from '@/components/nfc/NfcProgrammer';
import AppShell from '@/components/AppShell';
import nextDynamic from 'next/dynamic';
// The live-preview simulator (device frames, 3D NFC, QR, heavy motion) loads on
// demand so the editor shell is interactive sooner.
const LivePreview = nextDynamic(() => import('@/components/preview/LivePreview'), {
  loading: () => <div className="v-skeleton mx-auto h-[620px] w-[320px] rounded-[44px]" />,
});
import ShareCard from '@/components/ShareCard';
import { PublishedSheet } from '@/components/cards/PublishedSheet';
import { COVER_STYLES, LAYOUTS, LINK_STYLES, layoutOf, linkStyleOf, modeOf, type CoverStyle, type Layout, type LinkStyle, type ThemeMode } from '@/lib/profile';
import { Toggle } from '@/components/ui/Toggle';
import { MeetingHours } from '@/components/cards/MeetingHours';
import { SecondLanguage, type AltIdentity } from '@/components/cards/SecondLanguage';
import { shade } from '@/lib/color';
import { PresenceBadge, useCardPresence } from '@/components/cards/Presence';
import { Icon } from '@/components/Icon';
import { ImageUpload } from '@/components/ImageUpload';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { MoveCard } from '@/components/cards/MoveCard';

const SWATCHES = ['#2563eb', '#1d4ed8', '#06b6d4', '#0ea5e9', '#10b981', '#16a34a', '#ec4899', '#f97316', '#eab308', '#ffffff', '#09090b'];

/**
 * The single canonical shape persisted for a card's identity + theme. Both the
 * auto-save effect and the manual save build the request body from this helper,
 * so there is exactly one serialization of "what the editor holds".
 */
function identityPayload(
  slug: string,
  templateId: string,
  vcard: Record<string, string>,
  theme: { accent: string; mode: string; cover: string; lang: string; links: LinkStyle; openInApp: boolean; layout: Layout; brand: boolean },
) {
  return { slug, templateId, theme, vcardData: vcard };
}
/** Where each completion step is done in the Content tab. */
const RECOMMENDATION_TARGET: Record<string, string> = {
  fullName: 'studio-profile',
  avatar: 'studio-profile',
  phone: 'studio-links',
  email: 'studio-links',
  actions: 'studio-links',
  sections: 'studio-sections',
};
const BRANDS_COLORS: Record<string, string> = {
  LINKEDIN: '#0a66c2',
  WHATSAPP: '#25d366',
  INSTAGRAM: '#e1306c',
  FACEBOOK: '#1877f2',
  TIKTOK: '#000000',
  YOUTUBE: '#ff0000',
  GITHUB: '#24292e',
};

const ACTION_DETAILS: Record<string, { label: string; arLabel: string; color: string; icon: string; desc: string }> = {
  SAVE_CONTACT: { label: 'Save Contact', arLabel: 'حفظ جهة الاتصال', color: '#1d4ed8', icon: 'user-plus', desc: 'Adds a contact card download button' },
  WHATSAPP: { label: 'WhatsApp', arLabel: 'واتساب', color: '#25d366', icon: 'whatsapp', desc: 'Direct chat with prefilled message' },
  CALL: { label: 'Phone Call', arLabel: 'اتصال هاتفي', color: '#10b981', icon: 'phone', desc: 'Initiate a mobile phone call' },
  EMAIL: { label: 'Send Email', arLabel: 'بريد إلكتروني', color: '#ef4444', icon: 'mail', desc: 'Open email client composer' },
  LINKEDIN: { label: 'LinkedIn', arLabel: 'لينكد إن', color: '#0a66c2', icon: 'linkedin', desc: 'Link professional LinkedIn profile' },
  WEBSITE: { label: 'Website Link', arLabel: 'موقع إلكتروني', color: '#2563eb', icon: 'globe', desc: 'Redirect to custom web URL' },
  BOOK_MEETING: { label: 'Book Meeting', arLabel: 'حجز موعد', color: '#f59e0b', icon: 'calendar', desc: 'Connect booking calendar tools' },
  REQUEST_QUOTE: { label: 'Request Quote', arLabel: 'طلب تسعيرة', color: '#0ea5e9', icon: 'file-text', desc: 'Collect quote requests from users' },
  MAPS: { label: 'Google Maps', arLabel: 'خرائط جوجل', color: '#f43f5e', icon: 'map-pin', desc: 'Show store or office address' },
  FILE: { label: 'Download File', arLabel: 'تحميل ملف PDF', color: '#64748b', icon: 'download', desc: 'Provide PDF guides or resume' },
};

const SECTION_DETAILS: Record<string, { label: string; arLabel: string; color: string; icon: string; desc: string }> = {
  BIO: { label: 'About Bio', arLabel: 'نبذة عني', color: '#2563eb', icon: 'user', desc: 'A custom text description block' },
  SOCIAL: { label: 'Social Grid', arLabel: 'شبكات التواصل', color: '#ec4899', icon: 'users', desc: 'Grid layout of social profiles' },
  PORTFOLIO: { label: 'Portfolio Gallery', arLabel: 'معرض الأعمال', color: '#0ea5e9', icon: 'grid', desc: 'Visual grid block of projects' },
  BOOKING: { label: 'Booking Widget', arLabel: 'جدول مواعيد', color: '#f59e0b', icon: 'calendar', desc: 'Interactive booking calendar' },
  VIDEO: { label: 'Video Player', arLabel: 'مشغل الفيديو', color: '#ef4444', icon: 'youtube', desc: 'Embed YouTube or Vimeo video' },
  CREDENTIALS: { label: 'Certifications', arLabel: 'الشهادات', color: '#16a34a', icon: 'shield', desc: 'Certificates, licences and awards' },
  CLIENTS: { label: 'Clients', arLabel: 'العملاء', color: '#7c3aed', icon: 'briefcase', desc: 'Logos of clients you have worked with' },
};

/** One certificate, licence or award in a Certifications block. */
type Credential = { id: string; name: string; issuer: string; year: string };
const newId = () => Math.random().toString(36).slice(2, 10);

const SOCIAL_PRESETS: Record<
  string,
  { label: string; arLabel: string; color: string; icon: string; desc: string; type: string; initialUrl: string }
> = {
  INSTAGRAM: { label: 'Instagram', arLabel: 'انستجرام', color: '#e1306c', icon: 'instagram', desc: 'Link to your Instagram profile', type: 'WEBSITE', initialUrl: 'https://instagram.com/' },
  FACEBOOK: { label: 'Facebook', arLabel: 'فيسبوك', color: '#1877f2', icon: 'facebook', desc: 'Link to your Facebook page/profile', type: 'WEBSITE', initialUrl: 'https://facebook.com/' },
  TWITTER: { label: 'Twitter / X', arLabel: 'تويتر / إكس', color: '#000000', icon: 'twitter', desc: 'Link to your Twitter / X profile', type: 'WEBSITE', initialUrl: 'https://x.com/' },
  YOUTUBE: { label: 'YouTube', arLabel: 'يوتيوب', color: '#ff0000', icon: 'youtube', desc: 'Link to your YouTube channel', type: 'WEBSITE', initialUrl: 'https://youtube.com/' },
  TELEGRAM: { label: 'Telegram', arLabel: 'تليجرام', color: '#24a1de', icon: 'telegram', desc: 'Link to your Telegram direct message', type: 'WEBSITE', initialUrl: 'https://t.me/' },
  GITHUB: { label: 'GitHub', arLabel: 'جيتهاب', color: '#24292e', icon: 'github', desc: 'Link to your GitHub profile', type: 'WEBSITE', initialUrl: 'https://github.com/' },
  SNAPCHAT: { label: 'Snapchat', arLabel: 'سناب شات', color: '#fffc00', icon: 'snapchat', desc: 'Link to your Snapchat account', type: 'WEBSITE', initialUrl: 'https://snapchat.com/add/' },
};

const ALL_PLATFORMS = [
  { key: 'CALL', label: 'Phone', arLabel: 'رقم الهاتف', color: '#10b981', icon: 'phone', type: 'CALL', category: 'quickActions' },
  { key: 'EMAIL', label: 'Email', arLabel: 'البريد الإلكتروني', color: '#ef4444', icon: 'mail', type: 'EMAIL', category: 'quickActions' },
  { key: 'WHATSAPP', label: 'WhatsApp', arLabel: 'واتساب', color: '#25d366', icon: 'whatsapp', type: 'WHATSAPP', category: 'quickActions' },
  { key: 'SMS', label: 'SMS', arLabel: 'رسالة قصيرة', color: '#0ea5e9', icon: 'message', type: 'WEBSITE', initialUrl: 'sms:', category: 'quickActions' },
  { key: 'MAPS', label: 'Maps', arLabel: 'خرائط جوجل', color: '#f43f5e', icon: 'map-pin', type: 'MAPS', category: 'quickActions' },
  { key: 'ADDRESS', label: 'Address', arLabel: 'العنوان الجغرافي', color: '#2563eb', icon: 'map-pin', type: 'MAPS', category: 'quickActions' },
  { key: 'LOCATION', label: 'Location', arLabel: 'الموقع الحالي', color: '#3b82f6', icon: 'map-pin', type: 'MAPS', category: 'quickActions' },
  { key: 'SAVE_CONTACT', label: 'Save Contact', arLabel: 'حفظ جهة الاتصال', color: '#1d4ed8', icon: 'user-plus', type: 'SAVE_CONTACT', category: 'quickActions' },
  { key: 'CONTACT_FORM', label: 'Contact Form', arLabel: 'نموذج التواصل', color: '#14b8a6', icon: 'mail', type: 'WEBSITE', category: 'quickActions' },

  { key: 'LINKEDIN', label: 'LinkedIn', arLabel: 'لينكد إن', color: '#0a66c2', icon: 'linkedin', type: 'LINKEDIN', category: 'socialMedia' },
  { key: 'FACEBOOK', label: 'Facebook', arLabel: 'فيسبوك', color: '#1877f2', icon: 'facebook', type: 'WEBSITE', initialUrl: 'https://facebook.com/', category: 'socialMedia' },
  { key: 'INSTAGRAM', label: 'Instagram', arLabel: 'انستجرام', color: '#e1306c', icon: 'instagram', type: 'WEBSITE', initialUrl: 'https://instagram.com/', category: 'socialMedia' },
  { key: 'TWITTER', label: 'X / Twitter', arLabel: 'إكس / تويتر', color: '#000000', icon: 'twitter', type: 'WEBSITE', initialUrl: 'https://x.com/', category: 'socialMedia' },
  { key: 'THREADS', label: 'Threads', arLabel: 'ثريدز', color: '#000000', icon: 'link', type: 'WEBSITE', initialUrl: 'https://threads.net/@', category: 'socialMedia' },
  { key: 'TIKTOK', label: 'TikTok', arLabel: 'تيك توك', color: '#ff0050', icon: 'youtube', type: 'WEBSITE', initialUrl: 'https://tiktok.com/@', category: 'socialMedia' },
  { key: 'YOUTUBE', label: 'YouTube', arLabel: 'يوتيوب', color: '#ff0000', icon: 'youtube', type: 'WEBSITE', initialUrl: 'https://youtube.com/', category: 'socialMedia' },
  { key: 'PINTEREST', label: 'Pinterest', arLabel: 'بينتريست', color: '#bd081c', icon: 'tag', type: 'WEBSITE', initialUrl: 'https://pinterest.com/', category: 'socialMedia' },
  { key: 'BEHANCE', label: 'Behance', arLabel: 'بيهانس', color: '#1769ff', icon: 'layers', type: 'WEBSITE', initialUrl: 'https://behance.net/', category: 'socialMedia' },
  { key: 'DRIBBBLE', label: 'Dribbble', arLabel: 'دريبل', color: '#ea4c89', icon: 'globe', type: 'WEBSITE', initialUrl: 'https://dribbble.com/', category: 'socialMedia' },
  { key: 'GITHUB', label: 'GitHub', arLabel: 'جيتهاب', color: '#24292e', icon: 'github', type: 'WEBSITE', initialUrl: 'https://github.com/', category: 'socialMedia' },
  { key: 'REDDIT', label: 'Reddit', arLabel: 'ريديت', color: '#ff4500', icon: 'users', type: 'WEBSITE', initialUrl: 'https://reddit.com/u/', category: 'socialMedia' },
  { key: 'DISCORD', label: 'Discord', arLabel: 'ديسكورد', color: '#5865f2', icon: 'message', type: 'WEBSITE', initialUrl: 'https://discord.gg/', category: 'socialMedia' },
  { key: 'TELEGRAM', label: 'Telegram', arLabel: 'تليجرام', color: '#24a1de', icon: 'telegram', type: 'WEBSITE', initialUrl: 'https://t.me/', category: 'socialMedia' },
  { key: 'SNAPCHAT', label: 'Snapchat', arLabel: 'سناب شات', color: '#fffc00', icon: 'snapchat', type: 'WEBSITE', initialUrl: 'https://snapchat.com/add/', category: 'socialMedia' },

  { key: 'WEBSITE', label: 'Website', arLabel: 'موقع إلكتروني', color: '#2563eb', icon: 'globe', type: 'WEBSITE', category: 'business' },
  { key: 'PORTFOLIO', label: 'Portfolio', arLabel: 'معرض الأعمال', color: '#3b82f6', icon: 'briefcase', type: 'WEBSITE', category: 'business' },
  { key: 'CALENDLY', label: 'Calendly', arLabel: 'حجز كاليندلي', color: '#006bff', icon: 'calendar', type: 'BOOK_MEETING', initialUrl: 'https://calendly.com/', category: 'business' },
  { key: 'BOOKING', label: 'Booking', arLabel: 'صفحة الحجز', color: '#f59e0b', icon: 'clock', type: 'BOOK_MEETING', category: 'business' },
  { key: 'STRIPE', label: 'Stripe', arLabel: 'بوابة سترايب', color: '#635bff', icon: 'link', type: 'WEBSITE', category: 'business' },
  { key: 'PAYPAL', label: 'PayPal', arLabel: 'حساب بايبال', color: '#003087', icon: 'globe', type: 'WEBSITE', initialUrl: 'https://paypal.me/', category: 'business' },
  { key: 'ZOOM', label: 'Zoom Meeting', arLabel: 'اجتماع زووم', color: '#2d8cff', icon: 'youtube', type: 'BOOK_MEETING', category: 'business' },
  { key: 'GOOGLE_MEET', label: 'Google Meet', arLabel: 'جوجل ميت', color: '#00897b', icon: 'youtube', type: 'BOOK_MEETING', category: 'business' },
  { key: 'TEAMS', label: 'Microsoft Teams', arLabel: 'مايكروسوفت تيمز', color: '#464eb8', icon: 'youtube', type: 'BOOK_MEETING', category: 'business' },
  { key: 'CRM', label: 'CRM Link', arLabel: 'رابط CRM', color: '#ec4899', icon: 'users', type: 'WEBSITE', category: 'business' },
  { key: 'STORE', label: 'Online Store', arLabel: 'المتجر الإلكتروني', color: '#10b981', icon: 'globe', type: 'WEBSITE', category: 'business' },
  { key: 'PRODUCT', label: 'Product Link', arLabel: 'رابط المنتج', color: '#0ea5e9', icon: 'tag', type: 'WEBSITE', category: 'business' },

  { key: 'GALLERY', label: 'Gallery', arLabel: 'معرض صور', color: '#ec4899', icon: 'image', type: 'WEBSITE', category: 'media' },
  { key: 'VIDEO', label: 'Video', arLabel: 'رابط فيديو', color: '#ff0000', icon: 'youtube', type: 'WEBSITE', category: 'media' },
  { key: 'PDF', label: 'PDF Document', arLabel: 'ملف PDF', color: '#ef4444', icon: 'file-text', type: 'FILE', category: 'media' },
  { key: 'PRESENTATION', label: 'Presentation', arLabel: 'عرض تقديمي', color: '#f59e0b', icon: 'file-text', type: 'FILE', category: 'media' },
  { key: 'RESUME', label: 'Resume', arLabel: 'السيرة الذاتية', color: '#10b981', icon: 'file-text', type: 'FILE', category: 'media' },
  { key: 'DOWNLOAD', label: 'Download File', arLabel: 'تحميل ملف', color: '#64748b', icon: 'download', type: 'FILE', category: 'media' },
  { key: 'CASE_STUDY', label: 'Case Study', arLabel: 'دراسة حالة', color: '#2563eb', icon: 'file-text', type: 'FILE', category: 'media' },

  { key: 'CUSTOM', label: 'Custom Button', arLabel: 'زر مخصص', color: '#3b82f6', icon: 'link', type: 'WEBSITE', category: 'custom' },
  { key: 'URL', label: 'External URL', arLabel: 'رابط خارجي', color: '#2563eb', icon: 'external-link', type: 'WEBSITE', category: 'custom' },
  { key: 'INTERNAL_LINK', label: 'Internal Link', arLabel: 'رابط داخلي', color: '#1d4ed8', icon: 'link', type: 'WEBSITE', category: 'custom' },
  { key: 'EMBED', label: 'Embed Action', arLabel: 'رابط تضمين', color: '#ec4899', icon: 'layers', type: 'WEBSITE', category: 'custom' },
  { key: 'API_ACTION', label: 'API Action', arLabel: 'أمر API برمي', color: '#10b981', icon: 'settings', type: 'WEBSITE', category: 'custom' }
];

/** Picker groups, in the order they are listed (and keyboard-walked). */
const CATEGORY_KEYS = ['quickActions', 'socialMedia', 'business', 'media', 'custom'] as const;

const getActionBrandDetails = (a: { type: string; config: any }) => {
  const defaultDetails = ACTION_DETAILS[a.type] ?? { label: 'Link', arLabel: 'رابط', color: '#2563eb', icon: 'link', desc: 'Redirect to custom url' };
  
  if (a.type === 'WEBSITE' && typeof a.config?.url === 'string') {
    const url = a.config.url;
    if (/instagram\.com/i.test(url)) return { label: 'Instagram', arLabel: 'انستجرام', color: '#e1306c', icon: 'instagram', desc: 'Link to your Instagram profile' };
    if (/facebook\.com|fb\.com|fb\.me/i.test(url)) return { label: 'Facebook', arLabel: 'فيسبوك', color: '#1877f2', icon: 'facebook', desc: 'Link to your Facebook page/profile' };
    if (/(?:twitter|x)\.com/i.test(url)) return { label: 'Twitter / X', arLabel: 'تويتر / إكس', color: '#000000', icon: 'twitter', desc: 'Link to your Twitter / X profile' };
    if (/youtube\.com|youtu\.be/i.test(url)) return { label: 'YouTube', arLabel: 'يوتيوب', color: '#ff0000', icon: 'youtube', desc: 'Link to your YouTube channel' };
    if (/t\.me|telegram\.(me|org)/i.test(url)) return { label: 'Telegram', arLabel: 'تليجرام', color: '#24a1de', icon: 'telegram', desc: 'Link to your Telegram direct message' };
    if (/github\.com/i.test(url)) return { label: 'GitHub', arLabel: 'جيتهاب', color: '#24292e', icon: 'github', desc: 'Link to your GitHub profile' };
    if (/snapchat\.com/i.test(url)) return { label: 'Snapchat', arLabel: 'سناب شات', color: '#fffc00', icon: 'snapchat', desc: 'Link to your Snapchat account' };
    if (/threads\.net/i.test(url)) return { label: 'Threads', arLabel: 'ثريدز', color: '#000000', icon: 'link', desc: 'Link to your Threads profile' };
    if (/tiktok\.com/i.test(url)) return { label: 'TikTok', arLabel: 'تيك توك', color: '#ff0050', icon: 'youtube', desc: 'Link to your TikTok account' };
    if (/pinterest\.com/i.test(url)) return { label: 'Pinterest', arLabel: 'بينتريست', color: '#bd081c', icon: 'tag', desc: 'Link to Pinterest' };
    if (/behance\.net/i.test(url)) return { label: 'Behance', arLabel: 'بيهانس', color: '#1769ff', icon: 'layers', desc: 'Link to Behance portfolio' };
    if (/dribbble\.com/i.test(url)) return { label: 'Dribbble', arLabel: 'دريبل', color: '#ea4c89', icon: 'globe', desc: 'Link to Dribbble showcase' };
    if (/reddit\.com/i.test(url)) return { label: 'Reddit', arLabel: 'ريديت', color: '#ff4500', icon: 'users', desc: 'Link to Reddit profile' };
    if (/discord/i.test(url)) return { label: 'Discord', arLabel: 'ديسكورد', color: '#5865f2', icon: 'message', desc: 'Invite link to Discord server' };
    if (/paypal\.me/i.test(url)) return { label: 'PayPal', arLabel: 'بايبال', color: '#003087', icon: 'globe', desc: 'Send payments via PayPal' };
    if (/stripe\.com/i.test(url)) return { label: 'Stripe', arLabel: 'سترايب', color: '#635bff', icon: 'link', desc: 'Stripe payment page' };
    if (/calendly\.com/i.test(url)) return { label: 'Calendly', arLabel: 'كاليندلي', color: '#006bff', icon: 'calendar', desc: 'Schedule a meeting' };
  }
  return defaultDetails;
};

export default function CardBuilderStudio({ params }: { params: { id: string } }) {
  const { t } = useTranslation('cardEditor');
  const { locale } = useLocale();
  const router = useRouter();
  const id = params.id;

  // Visual Builder States
  // Below the desktop layout the preview is not beside the editor; this opens it over the page.
  const [previewOpen, setPreviewOpen] = useState(false);
  const [justPublished, setJustPublished] = useState(false);
  useEffect(() => {
    if (!previewOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPreviewOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [previewOpen]);
  const [activeTab, setActiveTab] = useState<'content' | 'design' | 'templates' | 'profiles' | 'nfc' | 'settings'>('content');
  const [activeSection, setActiveSection] = useState<'profile' | string>('profile');
  const [autoSaveStatus, setAutoSaveStatus] = useState<'Saved' | 'Saving...' | 'Offline'>('Saved');

  // Backend States
  const [card, setCard] = useState<CardType | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [actions, setActions] = useState<CardAction[]>([]);
  // Default-profile payment links, mirrored here so the live preview reflects
  // edits instantly. Per-variant links are managed inside the Profiles tab.
  const [paymentLinks, setPaymentLinks] = useState<PaymentLinkRow[]>([]);
  const [tags, setTags] = useState<NfcTag[]>([]);
  const [error, setError] = useState('');
  
  // UX Enhancement States
  const [expandedActionId, setExpandedActionId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [platformSearch, setPlatformSearch] = useState('');
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recentlyUsed, setRecentlyUsed] = useState<string[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [draggedActionId, setDraggedActionId] = useState<string | null>(null);
  const [dragOverActionId, setDragOverActionId] = useState<string | null>(null);
  
  // Local changes editing states
  const [slug, setSlug] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [vcard, setVcard] = useState<Record<string, string>>({});
  const [accent, setAccent] = useState('#2563eb');
  const [mode, setMode] = useState<ThemeMode>('light');
  const [cover, setCover] = useState<CoverStyle>('gradient');
  const [layout, setLayout] = useState<Layout>('classic');
  // The workspace's name and logo on the card.
  const [showBrand, setShowBrand] = useState(true);
  const [lang, setLang] = useState<'en' | 'ar'>('en');
  const [linkStyle, setLinkStyle] = useState<LinkStyle>('list');
  // Teammates with this card open right now.
  const others = useCardPresence(id);
  const [openInApp, setOpenInApp] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  // Guided quick-start. `null` until the first load decides, so the studio never
  // flashes before we know whether the card is empty.
  const [guided, setGuided] = useState<boolean | null>(null);

  // Deletion confirm states
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteSlugConfirm, setDeleteSlugConfirm] = useState('');

  // Undo / Redo of what was typed and chosen (identity and theme), one step
  // per saved change. Each step is the saved body, and stepping back saves
  // it again, so an undo reaches the live card. Removed links and sections
  // come back through the Undo toast instead (lib/undo.ts). The index also
  // lives in a ref so callbacks never need `historyIndex` in their deps.
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const historyIndexRef = useRef(-1);

  // QR Code generator states
  const [qrUrl, setQrUrl] = useState<string>('');

  // --- Persistence guards (refs → never trigger re-render / effect loops) ---
  const loadedRef = useRef(false); // true once the first load has settled
  const lastSavedRef = useRef(''); // serialized identity/theme last persisted to the DB
  const suppressSaveRef = useRef(false); // set when we apply server data, to skip the echo save

  const restoringRef = useRef<string | null>(null); // the step being put back, so its save is not a new step
  const pushHistory = useCallback((snapshot: string) => {
    setHistory((prev) => {
      const base = prev.slice(0, historyIndexRef.current + 1);
      if (base[base.length - 1] === snapshot) return prev;
      base.push(snapshot);
      historyIndexRef.current = base.length - 1;
      setHistoryIndex(historyIndexRef.current);
      return base;
    });
  }, []);

  /**
   * Apply a full card object into local editing state. This is the ONE place
   * server data becomes editor state, so the editor never drifts from the DB.
   * `suppressSaveRef` stops the auto-save effect from immediately writing the
   * data we just read back (which would otherwise loop).
   */
  const applyCard = useCallback((c: CardType) => {
    suppressSaveRef.current = true;
    const vc = (c.vcardData as Record<string, string>) ?? {};
    const th = (c.theme ?? {}) as Record<string, string>;
    const accentV = th.accent ?? '#2563eb';
    const modeV = modeOf(th.mode);
    const coverV: CoverStyle = COVER_STYLES.includes(th.cover as CoverStyle) ? (th.cover as CoverStyle) : modeV === 'dark' ? 'constellation' : 'gradient';
    const layoutV = layoutOf(th.layout);
    const brandV = (th as Record<string, unknown>).brand !== false;
    const langV = (th.lang as 'en' | 'ar') === 'ar' ? 'ar' : 'en';
    const linksV = linkStyleOf(th.links);
    const inAppV = (th as Record<string, unknown>).openInApp === true;
    setCard(c);
    setSlug(c.slug);
    setTemplateId(c.templateId);
    setVcard(vc);
    setAccent(accentV);
    setMode(modeV);
    setCover(coverV);
    setLayout(layoutV);
    setShowBrand(brandV);
    setLang(langV);
    setLinkStyle(linksV);
    setOpenInApp(inAppV);
    setSections([...(c.sections ?? [])].sort((a, b) => a.order - b.order));
    setActions([...(c.actions ?? [])].sort((a, b) => a.order - b.order));
    lastSavedRef.current = JSON.stringify(
      identityPayload(c.slug, c.templateId, vc, { accent: accentV, mode: modeV, cover: coverV, lang: langV, links: linksV, openInApp: inAppV, layout: layoutV, brand: brandV }),
    );
  }, []);

  // A card opened again shows what it showed last time at once (see `peek`);
  // the first fresh answer then replaces it only if it differs and nothing
  // has been edited meanwhile, so it never overwrites what someone typed.
  const shownRef = useRef<string | null>(null);
  const touchedRef = useRef(false);
  // The identity + theme body waiting for its debounced save, if any.
  const pendingRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [c, tg] = await Promise.all([
        authFetch<CardType>(`/cards/${id}`),
        authFetch<NfcTag[]>('/nfc/tags'),
      ]);
      setTags(tg);
      const shown = shownRef.current;
      shownRef.current = null;
      if (shown !== null && (touchedRef.current || shown === JSON.stringify(c))) {
        loadedRef.current = true;
        return;
      }
      applyCard(c);
      pushHistory(lastSavedRef.current);

      // Decide the guided path only on the very first load, so finishing it (or
      // skipping) is never undone by a later refetch.
      if (!loadedRef.current) {
        const vc = (c.vcardData as Record<string, string>) ?? {};
        const untouched =
          !vc.fullName && (c.actions?.length ?? 0) === 0 && (c.sections?.length ?? 0) === 0;
        setGuided(untouched);
      }
      loadedRef.current = true;
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id, applyCard, pushHistory]);

  // Leaving, the studio records the card as it now stands (its own saves
  // cleared the earlier copy), so opening it again is instant too.
  const latestRef = useRef<CardType | null>(null);
  latestRef.current = card ? { ...card, sections, actions } : null;
  useEffect(() => {
    // An edit still waiting for its save goes out now rather than being
    // dropped with the page: on leaving the studio, or closing the tab.
    const flush = () => {
      const pending = pendingRef.current;
      if (!pending || pending === lastSavedRef.current) return false;
      pendingRef.current = null;
      const latest = latestRef.current;
      void authFetch<CardType>(`/cards/${id}`, { method: 'PATCH', body: pending, keepalive: true })
        .then((updated) => latest && remember(`/cards/${id}`, { ...latest, ...updated, sections: latest.sections, actions: latest.actions }))
        .catch(() => {});
      return true;
    };
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      if (!flush() && latestRef.current) remember(`/cards/${id}`, latestRef.current);
    };
  }, [id]);

  // Initial load — runs once per card id (stable deps, so no loop).
  useEffect(() => {
    if (!getToken()) { router.replace('/login'); return; }
    const seen = peek<CardType>(`/cards/${id}`);
    const seenTags = peek<NfcTag[]>('/nfc/tags');
    if (seen && !loadedRef.current) {
      applyCard(seen);
      if (seenTags) setTags(seenTags);
      pushHistory(lastSavedRef.current);
      const vc = (seen.vcardData as Record<string, string>) ?? {};
      setGuided(!vc.fullName && (seen.actions?.length ?? 0) === 0 && (seen.sections?.length ?? 0) === 0);
      shownRef.current = JSON.stringify(seen);
      loadedRef.current = true;
    }
    load();
  }, [id, router, load, applyCard, pushHistory]);

  // --- Debounced auto-save: the single writer for identity + theme ----------
  useEffect(() => {
    if (!loadedRef.current) return; // don't save before the first load lands
    if (!latestRef.current) return; // nor before its values are on screen (a re-run of this effect can see the blank first render)
    if (suppressSaveRef.current) { suppressSaveRef.current = false; return; } // ignore server echoes
    const body = JSON.stringify(identityPayload(slug, templateId, vcard, { accent, mode, cover, lang, links: linkStyle, openInApp, layout, brand: showBrand }));
    if (body === lastSavedRef.current) {
      // Nothing to save: back to what the card already holds (e.g. the link put right again).
      setAutoSaveStatus((st) => (st === 'Offline' ? 'Saved' : st));
      return;
    }
    if (problemOf(slug, { required: true, min: 3 })) {
      // The link field says what to fix; saving now would only be refused.
      setAutoSaveStatus('Offline');
      return;
    }
    touchedRef.current = true;
    pendingRef.current = body;
    setAutoSaveStatus('Saving...');
    const handle = setTimeout(async () => {
      try {
        const updated = await authFetch<CardType>(`/cards/${id}`, { method: 'PATCH', body });
        lastSavedRef.current = body;
        if (pendingRef.current === body) pendingRef.current = null;
        if (restoringRef.current === body) restoringRef.current = null;
        else pushHistory(body);
        setCard((prev) => (prev ? { ...prev, ...updated } : updated));
        setAutoSaveStatus('Saved');
      } catch (e) {
        setError((e as Error).message);
        setAutoSaveStatus('Offline');
      }
    }, 700);
    return () => clearTimeout(handle);
  }, [slug, templateId, vcard, accent, mode, cover, lang, linkStyle, openInApp, layout, showBrand, id]);

  // Load favorites & recentlyUsed from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const favs = localStorage.getItem('vertex_fav_platforms');
    if (favs) setFavorites(JSON.parse(favs));
    
    const recs = localStorage.getItem('vertex_recent_platforms');
    if (recs) setRecentlyUsed(JSON.parse(recs));
  }, []);

  const toggleFavorite = (key: string) => {
    const next = favorites.includes(key)
      ? favorites.filter((k) => k !== key)
      : [...favorites, key];
    setFavorites(next);
    localStorage.setItem('vertex_fav_platforms', JSON.stringify(next));
  };

  const addRecent = (key: string) => {
    const next = [key, ...recentlyUsed.filter((k) => k !== key)].slice(0, 6);
    setRecentlyUsed(next);
    localStorage.setItem('vertex_recent_platforms', JSON.stringify(next));
  };

  // Opened from the getting-started guide to share the card: go straight to the ways to share it.
  const cardLoaded = !!card;
  useEffect(() => {
    if (!cardLoaded || new URLSearchParams(window.location.search).get('share') !== '1') return;
    const t = setTimeout(() => document.getElementById('share-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
    return () => clearTimeout(t);
  }, [cardLoaded]);

  // Generate QR Code dynamically
  useEffect(() => {
    if (!slug) return;
    const originUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    QRCode.toDataURL(`${originUrl}/c/${slug}`, { width: 300, margin: 2 }, (err, url) => {
      if (!err) setQrUrl(url);
    });
  }, [slug]);

  // Undo / Redo Actions — both restore a full snapshot through applyCard, the
  // single entry point for turning a card object into editor state.
  const restoreSnapshot = (index: number) => {
    const step = history[index];
    if (!step) return;
    setHistoryIndex(index);
    historyIndexRef.current = index;
    const { slug: sl, templateId: tpl, theme: th, vcardData } = JSON.parse(step) as ReturnType<typeof identityPayload>;
    // Set as edits, not as server data: the autosave then writes the step back.
    restoringRef.current = step;
    suppressSaveRef.current = false;
    setSlug(sl);
    setTemplateId(tpl);
    setVcard(vcardData);
    setAccent(th.accent);
    setMode(th.mode as typeof mode);
    setCover(th.cover as CoverStyle);
    setLang(th.lang === 'ar' ? 'ar' : 'en');
    setLinkStyle(th.links);
    setOpenInApp(th.openInApp);
    setLayout(th.layout);
    setShowBrand(th.brand);
  };
  const handleUndo = () => {
    if (historyIndex <= 0) return;
    restoreSnapshot(historyIndex - 1);
  };
  const handleRedo = () => {
    if (historyIndex >= history.length - 1) return;
    restoreSnapshot(historyIndex + 1);
  };

  /**
   * Persist any pending identity/theme edit immediately (used before a
   * structural mutation pulls fresh server state, so nothing is lost).
   */
  const flushIdentity = async () => {
    const body = JSON.stringify(identityPayload(slug, templateId, vcard, { accent, mode, cover, lang, links: linkStyle, openInApp, layout, brand: showBrand }));
    if (body === lastSavedRef.current) return;
    await authFetch(`/cards/${id}`, { method: 'PATCH', body });
    lastSavedRef.current = body;
    pushHistory(body);
  };

  // Structural mutation helper (sections / actions / publish). Flushes identity
  // first, then re-reads the authoritative card so the editor mirrors the DB.
  const run = async (fn: () => Promise<unknown>) => {
    setError('');
    setAutoSaveStatus('Saving...');
    try {
      await flushIdentity();
      await fn();
      const c = await authFetch<CardType>(`/cards/${id}`);
      applyCard(c);
      pushHistory(lastSavedRef.current);
      setAutoSaveStatus('Saved');
      return c;
    } catch (e) {
      setError((e as Error).message);
      setAutoSaveStatus('Offline');
      throw e;
    }
  };

  // Apply a marketplace template — reuses the existing theme + save pipeline so
  // the live preview updates instantly and the change auto-persists.
  const applyTemplate = async (t: Template) => {
    const cov = t.cover ?? (t.mode === 'dark' ? 'constellation' : 'gradient');
    setApplyingId(t.id);
    setTemplateId(t.id);
    setAccent(t.accent);
    setMode(t.mode);
    setCover(cov);
    try {
      await run(() =>
        authFetch(`/cards/${id}`, {
          method: 'PATCH',
          // The theme is replaced whole on the server, so carry the language along.
          body: JSON.stringify({ templateId: t.id, theme: { accent: t.accent, mode: t.mode, cover: cov, lang } }),
        }),
      );
    } finally {
      setTimeout(() => setApplyingId(null), 500);
    }
  };

  const reorder = (res: 'sections' | 'actions', ids: string[]) =>
    run(() => authFetch(`/cards/${id}/${res}/reorder`, { method: 'PATCH', body: JSON.stringify({ ids }) }));

  const move = (list: { id: string }[], i: number, dir: -1 | 1, res: 'sections' | 'actions') => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const ids = list.map((x) => x.id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    reorder(res, ids);
  };

  // Completion analyzer scoring computation
  // A number or address counts whether it is in the profile or on a button (the quick start adds buttons).
  // Checked as they are typed; a bad link waits here rather than being refused by the API.
  const phoneDigits = (vcard.phone ?? '').replace(/\D/g, '').length;
  const checks = useChecks({
    phone: vcard.phone?.trim() && (phoneDigits < 7 || !/^[+\d\s().-]+$/.test(vcard.phone.trim())) ? 'phone' : null,
    email: problemOf(vcard.email ?? '', { kind: 'email' }),
    slug: problemOf(slug, { required: true, min: 3 }),
  });
  const say = (k: 'phone' | 'email' | 'slug') => {
    // The link shows its problem at once: while it has one, nothing on the card saves.
    const p = k === 'slug' ? (loadedRef.current ? problemOf(slug, { required: true, min: 3 }) : null) : checks.shown(k);
    return p ? t(`common:validation.${p}`, { min: 3 }) : null;
  };

  const hasPhone = !!vcard.phone || actions.some((a) => (a.type === 'CALL' || a.type === 'WHATSAPP') && !!a.config?.phone);
  const hasEmail = !!vcard.email || actions.some((a) => a.type === 'EMAIL' && !!a.config?.email);
  const profileScore = useMemo(() => {
    let score = 20; // base profile creation
    if (vcard.fullName) score += 15;
    if (vcard.title) score += 10;
    if (vcard.avatar) score += 10;
    if (hasPhone) score += 15;
    if (hasEmail) score += 10;
    if (sections.length > 0) score += 10;
    if (actions.length > 0) score += 10;
    return Math.min(100, score);
  }, [vcard, sections, actions, hasPhone, hasEmail]);

  const missingRecommendations = useMemo(() => {
    const recs: string[] = [];
    // Most noticed first: the name and face, then ways to reach you, then more to read.
    if (!vcard.fullName) recs.push('fullName');
    if (!vcard.avatar) recs.push('avatar');
    if (!hasPhone) recs.push('phone');
    if (!hasEmail) recs.push('email');
    if (actions.length === 0) recs.push('actions');
    if (sections.length === 0) recs.push('sections');
    return recs;
  }, [vcard, sections, actions, hasPhone, hasEmail]);

  const handleDeleteCard = async () => {
    if (!card || deleteSlugConfirm !== card.slug) {
      setError(t('errors.slugMismatch'));
      return;
    }
    setError('');
    setAutoSaveStatus('Saving...');
    try {
      await authFetch(`/cards/${id}`, { method: 'DELETE' });
      router.replace('/cards');
    } catch (e) {
      setError((e as Error).message);
      setAutoSaveStatus('Offline');
    }
  };

  // Links and sections go at once, with Undo in the toast: the API keeps a
  // removed one long enough to put it back where it was.
  const removeWithUndo = (kind: 'actions' | 'sections', itemId: string, message: string) =>
    run(() => authFetch(`/cards/${id}/${kind}/${itemId}`, { method: 'DELETE' }))
      .then(() => offerUndo(message, () => run(() => authFetch(`/cards/${id}/${kind}/${itemId}/restore`, { method: 'POST' }))))
      .catch(() => {});

  const addAction = async (type: string, initialConfig: Record<string, unknown> = {}) => {
    const oldIds = new Set(actions.map((a) => a.id));
    try {
      const freshCard = await run(() =>
        authFetch(`/cards/${id}/actions`, {
          method: 'POST',
          body: JSON.stringify({ type, config: initialConfig }),
        }),
      ) as CardType;

      const freshActions = freshCard.actions ?? [];
      const newAction = freshActions.find((a) => !oldIds.has(a.id));
      if (newAction) {
        setExpandedActionId(newAction.id);
        setTimeout(() => {
          const el = document.getElementById(`action-card-${newAction.id}`);
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 120);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const duplicateAction = async (action: CardAction) => {
    await addAction(action.type, action.config);
  };

  const handleDragDrop = (draggedId: string, targetId: string) => {
    const list = [...actions];
    const draggedIdx = list.findIndex((x) => x.id === draggedId);
    const targetIdx = list.findIndex((x) => x.id === targetId);
    if (draggedIdx === -1 || targetIdx === -1) return;

    const ids = list.map((x) => x.id);
    const [removed] = ids.splice(draggedIdx, 1);
    ids.splice(targetIdx, 0, removed);
    reorder('actions', ids);
  };

  const addSection = (type: string) => {
    run(() => authFetch(`/cards/${id}/sections`, { method: 'POST', body: JSON.stringify({ type, content: {} }) }));
  };

  const visiblePlatforms = useMemo(() => {
    const query = platformSearch.trim().toLowerCase();
    let basicFiltered = ALL_PLATFORMS.filter(
      (p) => p.label.toLowerCase().includes(query) || p.arLabel.includes(query)
    );
    const flat: typeof ALL_PLATFORMS = [];
    if (!query) {
      const favItems = ALL_PLATFORMS.filter((p) => favorites.includes(p.key));
      flat.push(...favItems.map((p) => ({ ...p, category: 'favorites' })));
      const recentItems = ALL_PLATFORMS.filter((p) => recentlyUsed.includes(p.key) && !favorites.includes(p.key));
      flat.push(...recentItems.map((p) => ({ ...p, category: 'recentlyUsed' })));
    }
    flat.push(...basicFiltered);
    return flat;
  }, [platformSearch, favorites, recentlyUsed]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [platformSearch]);

  const handleSelectPlatform = (plat: typeof ALL_PLATFORMS[0]) => {
    addRecent(plat.key);
    if (plat.initialUrl) {
      addAction(plat.type, { url: plat.initialUrl });
    } else {
      addAction(plat.type);
    }
    setIsModalOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % Math.max(1, visiblePlatforms.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev - 1 + visiblePlatforms.length) % Math.max(1, visiblePlatforms.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const plat = visiblePlatforms[highlightedIndex];
      if (plat) {
        handleSelectPlatform(plat);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsModalOpen(false);
    }
  };

  const handleToggleFav = (e: React.MouseEvent, key: string) => {
    e.stopPropagation();
    toggleFavorite(key);
  };

  if (!card && !error) {
    // The studio's own outline while the card loads: tabs, the form, the phone.
    return (
      <AppShell title={t('shell.loadingTitle')} bleed>
        <div role="status" aria-label={t('shell.loading')} className="flex flex-col lg:h-[calc(100vh-72px)] lg:flex-row">
          <div className="min-w-0 flex-1 lg:overflow-hidden">
            <div className="flex h-11 items-center gap-6 border-b border-line px-5 md:px-8">
              {[16, 14, 14, 12, 16, 14].map((w, i) => (
                <span key={i} className="v-skeleton block h-3 rounded" style={{ width: `${w * 4}px` }} />
              ))}
            </div>
            <div className="space-y-6 px-5 py-6 md:px-8">
              <span className="v-skeleton block h-14 w-full rounded-xl" />
              <div className="space-y-2">
                <span className="v-skeleton block h-4 w-32 rounded" />
                <span className="v-skeleton block h-3 w-56 rounded" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <span className="v-skeleton block h-24 rounded-xl" />
                <span className="v-skeleton block h-24 rounded-xl" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="space-y-2">
                    <span className="v-skeleton block h-3 w-20 rounded" />
                    <span className="v-skeleton block h-10 w-full rounded-lg" />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="hidden bg-elevated lg:flex lg:w-[380px] lg:shrink-0 lg:justify-center lg:border-s lg:border-line lg:pt-[116px] xl:w-[430px]">
            <span className="v-skeleton block h-[600px] w-[300px] rounded-[44px]" />
          </div>
        </div>
      </AppShell>
    );
  }

  if (!card) {
    return (
      <AppShell title={t('shell.loadingTitle')}>
        <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
          <span className="text-faint">
            <Icon name="x" size={22} />
          </span>
          <p className="text-sm text-muted">{error}</p>
          <Link href="/cards" className="v-btn v-btn-ghost mt-1 text-sm">
            {t('common:actions.back')}
          </Link>
        </div>
      </AppShell>
    );
  }

  // A card with nothing on it opens in the guided path instead of the full
  // studio — the studio is one click away and the choice is remembered.
  if (guided) {
    return (
      <AppShell title={t('shell.title')} fluid={true}>
        <QuickStart
          cardId={id}
          card={card}
          onDone={() => {
            setGuided(false);
            void load();
          }}
          onSkip={() => setGuided(false)}
        />
      </AppShell>
    );
  }

  const cardName = (vcard.fullName || card.slug).trim();
  const saving = autoSaveStatus === 'Saving...';
  const statusLabel =
    autoSaveStatus === 'Saved' ? t('status.saved') : saving ? t('status.saving') : t('status.offline');
  const togglePublish = async () => {
    const publishing = !card.isPublished;
    const c = await run(() =>
      authFetch(`/cards/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isPublished: publishing }),
      }),
    );
    // Going live ends with the card's link in hand, ready to send.
    if (publishing && c?.isPublished) setJustPublished(true);
  };
  const pickerLabel = (p: { label: string; arLabel: string }) => (locale === 'ar' ? p.arLabel : p.label);
  const linkedTags = tags.filter((tag) => tag.cardId === id);

  const title = (
    <>
      <Link href="/cards" className="v-hit shrink-0 font-normal text-faint transition-colors hover:text-ink">
        {t('commandBar.backToCards')}
      </Link>
      <span className="shrink-0 font-normal text-faint" aria-hidden>
        /
      </span>
      <span className="min-w-0 truncate">{cardName}</span>
      <span className={`v-badge shrink-0 ${card.isPublished ? 'v-badge-success' : 'v-badge-neutral'}`}>
        {card.isPublished ? t('status.live') : t('status.draft')}
      </span>
      <PresenceBadge people={others} />
    </>
  );

  const headerActions = (
    <div className="flex items-center gap-1.5">
      <span role="status" title={statusLabel} className="me-1 flex items-center gap-1.5 text-xs text-faint">
        <Icon
          name={autoSaveStatus === 'Saved' ? 'check' : saving ? 'loader' : 'x'}
          size={13}
          className={saving ? 'animate-spin' : autoSaveStatus === 'Offline' ? 'text-red-500' : ''}
        />
        <span className="sr-only sm:not-sr-only">{statusLabel}</span>
      </span>
      <button
        onClick={handleUndo}
        disabled={historyIndex <= 0}
        className="hidden h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-elevated hover:text-ink disabled:opacity-30 sm:flex"
        title={t('commandBar.undo')}
        aria-label={t('commandBar.undo')}
      >
        <Icon name="undo" size={15} />
      </button>
      <button
        onClick={handleRedo}
        disabled={historyIndex >= history.length - 1}
        className="hidden h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-elevated hover:text-ink disabled:opacity-30 sm:flex"
        title={t('commandBar.redo')}
        aria-label={t('commandBar.redo')}
      >
        <Icon name="redo" size={15} />
      </button>
      <span className="mx-1 hidden h-5 w-px bg-line sm:block" aria-hidden />
      <a href={`/c/${card.slug}`} target="_blank" rel="noreferrer" className="v-btn v-btn-ghost">
        <Icon name="external-link" size={14} />
        <span className="hidden sm:inline">{t('commandBar.viewProfile')}</span>
      </a>
      <button onClick={togglePublish} className={card.isPublished ? 'v-btn v-btn-ghost' : 'v-btn'}>
        {card.isPublished ? t('commandBar.unpublish') : t('commandBar.publish')}
      </button>
    </div>
  );

  // A new tab starts at its top: the editor column scrolls on desktop, the page on a phone.
  const switchTab = (next: typeof activeTab) => {
    setActiveTab(next);
    const el = editorRef.current;
    if (!el) return;
    if (el.scrollTop > 0) el.scrollTop = 0;
    else if (el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: 'start' });
  };

  const TABS: { id: typeof activeTab; icon: string }[] = [
    { id: 'content', icon: 'grid' },
    { id: 'design', icon: 'palette' },
    { id: 'templates', icon: 'layers' },
    { id: 'profiles', icon: 'user' },
    { id: 'nfc', icon: 'tag' },
    { id: 'settings', icon: 'settings' },
  ];

  const patchSection = (s: Section, key: string, value: unknown) => {
    const content = { ...s.content, [key]: value };
    return run(() =>
      authFetch(`/cards/${id}/sections/${s.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ content }),
      }),
    );
  };

  const openPicker = () => {
    setPlatformSearch('');
    setIsModalOpen(true);
  };

  // Keyboard focus in the picker walks this flat list: favourites, recents, then categories.
  const pickerGroups: { key: string; items: typeof ALL_PLATFORMS }[] = [];
  if (!platformSearch.trim()) {
    const favs = ALL_PLATFORMS.filter((p) => favorites.includes(p.key));
    if (favs.length) pickerGroups.push({ key: 'favorites', items: favs.map((p) => ({ ...p, category: 'favorites' })) });
    const recents = ALL_PLATFORMS.filter((p) => recentlyUsed.includes(p.key) && !favorites.includes(p.key));
    if (recents.length) pickerGroups.push({ key: 'recentlyUsed', items: recents.map((p) => ({ ...p, category: 'recentlyUsed' })) });
  }
  for (const cat of CATEGORY_KEYS) {
    const q = platformSearch.trim().toLowerCase();
    const items = ALL_PLATFORMS.filter((p) => p.category === cat && (!q || p.label.toLowerCase().includes(q) || p.arLabel.includes(q)));
    if (items.length) pickerGroups.push({ key: cat, items });
  }

  return (
    <AppShell title={title} action={headerActions} bleed>
      {error && (
        <div role="alert" className="flex items-center gap-2 border-b border-red-500/20 bg-red-500/[0.06] px-5 py-2.5 text-sm text-red-700 dark:text-red-300 md:px-8">
          <Icon name="x" size={14} />
          <span className="min-w-0 flex-1">{error}</span>
          <button onClick={() => setError('')} className="text-xs font-medium hover:underline">
            {t('settings.cancel')}
          </button>
        </div>
      )}

      <div className="flex flex-col lg:h-[calc(100vh-72px)] lg:flex-row">
        {/* Editor */}
        <div ref={editorRef} className="min-w-0 flex-1 scroll-mt-14 lg:overflow-y-auto">
          <div
            role="tablist"
            aria-label={t('tabs.heading')}
            className="no-scrollbar flex gap-5 overflow-x-auto border-b border-line bg-surface/95 px-5 backdrop-blur md:px-8 lg:sticky lg:top-0 lg:z-10"
          >
            {TABS.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => switchTab(tab.id)}
                  className={`relative flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 text-sm font-medium transition-colors ${
                    active ? 'text-ink' : 'text-muted hover:text-ink'
                  }`}
                >
                  <span className={active ? 'text-accent' : 'text-faint'}>
                    <Icon name={tab.icon} size={14} />
                  </span>
                  {t(`tabs.${tab.id}`)}
                  {active && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-ink" />}
                </button>
              );
            })}
          </div>

          <div className="mx-auto max-w-[760px] px-5 py-6 md:px-8 md:py-7">
            {activeTab === 'content' && (
              <div className="space-y-10">
                {missingRecommendations.length > 0 ? (
                  <div className="flex items-center gap-3 rounded-[10px] bg-elevated px-3.5 py-3 ring-1 ring-inset ring-line">
                    <ScoreRing value={profileScore} />
                    <p className="min-w-0 flex-1 text-sm text-muted">
                      <span className="font-medium text-ink">
                        {t('quality.title')} · <span className="tabular">{profileScore}%</span>
                      </span>
                      <span className="mx-1.5 text-faint" aria-hidden>
                        ·
                      </span>
                      {t('quality.next', { step: t(`quality.recommendations.${missingRecommendations[0]}`) })}
                    </p>
                    {/* The next step is one tap away: it takes you to where it is done. */}
                    <button
                      onClick={() =>
                        document.getElementById(RECOMMENDATION_TARGET[missingRecommendations[0]] ?? 'studio-profile')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                      }
                      className="v-btn shrink-0 !h-11 px-3 text-xs sm:!h-8"
                    >
                      {t('quality.go')}
                    </button>
                  </div>
                ) : null}

                <StudioSection id="studio-profile" title={t('profile.title')} description={t('profile.subtitle')}>
                  {/* The face first: it is what people notice on the card. */}
                  <div className="mb-4 grid gap-4 sm:grid-cols-2">
                    <ImageUpload
                      label={t('profile.avatarLabel')}
                      shape="circle"
                      value={vcard.avatar ?? ''}
                      onChange={(url) => setVcard({ ...vcard, avatar: url })}
                    />
                    <ImageUpload
                      label={t('profile.coverLabel')}
                      shape="wide"
                      value={vcard.coverImage ?? ''}
                      onChange={(url) => setVcard({ ...vcard, coverImage: url })}
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={t('profile.fullName')}>
                      <input
                        className="v-field"
                        value={vcard.fullName ?? ''}
                        onChange={(e) => setVcard({ ...vcard, fullName: e.target.value })}
                        placeholder={t('profile.fullNamePlaceholder')}
                      />
                    </Field>
                    <Field label={t('profile.jobTitle')}>
                      <input
                        className="v-field"
                        value={vcard.title ?? ''}
                        onChange={(e) => setVcard({ ...vcard, title: e.target.value })}
                        placeholder={t('profile.jobTitlePlaceholder')}
                      />
                    </Field>
                    <Field label={t('profile.company')}>
                      <input
                        className="v-field"
                        value={vcard.company ?? ''}
                        onChange={(e) => setVcard({ ...vcard, company: e.target.value })}
                        placeholder={t('profile.companyPlaceholder')}
                        autoComplete="organization"
                      />
                    </Field>
                    <Field label={t('profile.phone')} error={say('phone')} errorId="studio-phone-err">
                      <input
                        dir="ltr"
                        {...checks.bind('phone', 'studio-phone-err')}
                        className="v-field tabular rtl:text-right"
                        value={vcard.phone ?? ''}
                        onChange={(e) => setVcard({ ...vcard, phone: e.target.value })}
                        placeholder={t('profile.phonePlaceholder')}
                      />
                    </Field>
                    <Field label={t('profile.email')} error={say('email')} errorId="studio-email-err">
                      <input
                        dir="ltr"
                        inputMode="email"
                        {...checks.bind('email', 'studio-email-err')}
                        className="v-field rtl:text-right"
                        value={vcard.email ?? ''}
                        onChange={(e) => setVcard({ ...vcard, email: e.target.value })}
                        placeholder={t('profile.emailPlaceholder')}
                      />
                    </Field>
                  </div>
                  <div className="mt-4 grid gap-4 sm:grid-cols-3">
                    <Field label={t('profile.location')}>
                      <input
                        className="v-field"
                        value={vcard.location ?? ''}
                        onChange={(e) => setVcard({ ...vcard, location: e.target.value })}
                        placeholder={t('profile.locationPlaceholder')}
                      />
                    </Field>
                    <Field label={t('profile.languages')}>
                      <input
                        className="v-field"
                        value={vcard.languages ?? ''}
                        onChange={(e) => setVcard({ ...vcard, languages: e.target.value })}
                        placeholder={t('profile.languagesPlaceholder')}
                      />
                    </Field>
                    <Field label={t('profile.responseTime')}>
                      <input
                        className="v-field"
                        value={vcard.responseTime ?? ''}
                        onChange={(e) => setVcard({ ...vcard, responseTime: e.target.value })}
                        placeholder={t('profile.responseTimePlaceholder')}
                      />
                    </Field>
                  </div>
                  <SecondLanguage
                    primary={lang}
                    value={(vcard as unknown as { alt?: AltIdentity }).alt}
                    onChange={(alt) => {
                      const next = { ...vcard } as Record<string, unknown>;
                      if (alt) next.alt = alt;
                      else delete next.alt;
                      setVcard(next as Record<string, string>);
                    }}
                  />
                </StudioSection>

                <StudioSection
                  id="studio-links"
                  title={t('links.title')}
                  description={t('links.subtitle')}
                  action={
                    actions.length > 0 && (
                      <button onClick={openPicker} className="v-btn v-btn-ghost">
                        <Icon name="plus" size={14} /> {t('links.addShort')}
                      </button>
                    )
                  }
                >
                  {actions.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-line-strong px-6 py-8 text-center">
                      <p className="text-base font-medium text-ink">{t('links.emptyTitle')}</p>
                      <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-muted">{t('links.emptyDesc')}</p>
                      <div className="mt-4 flex flex-wrap justify-center gap-2">
                        {(
                          [
                            { key: 'phone', type: 'CALL', icon: 'phone' },
                            { key: 'email', type: 'EMAIL', icon: 'mail' },
                            { key: 'whatsapp', type: 'WHATSAPP', icon: 'whatsapp' },
                            { key: 'website', type: 'WEBSITE', icon: 'globe' },
                            { key: 'linkedin', type: 'LINKEDIN', icon: 'linkedin' },
                          ] as const
                        ).map((item) => (
                          <button
                            key={item.type}
                            onClick={() => addAction(item.type)}
                            className="flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-ink ring-1 ring-inset ring-line transition-colors hover:bg-elevated sm:min-h-8"
                          >
                            <Icon name={item.icon} size={14} /> {t(`links.shortcuts.${item.key}`)}
                          </button>
                        ))}
                        <button onClick={openPicker} className="v-btn">
                          <Icon name="search" size={14} /> {t('links.add')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {/* Both placements render the same ActionCard; the group only
                          says where the action shows up on the public card. */}
                      {(
                        [
                          { key: 'quick', inGroup: (a: CardAction) => isQuickAction(a) },
                          { key: 'grid', inGroup: (a: CardAction) => !isQuickAction(a) },
                        ] as const
                      ).map(({ key, inGroup }) => {
                        const list = actions.filter(inGroup);
                        return (
                          <div key={key}>
                            <div className="mb-2 flex items-baseline justify-between gap-3">
                              <h3 className="text-sm font-medium text-ink">{t(`links.group.${key}`)}</h3>
                              <span className="text-xs text-faint">{t(`links.group.${key}Hint`)}</span>
                            </div>
                            {list.length > 0 ? (
                              <div className="divide-y divide-line overflow-hidden rounded-xl ring-1 ring-inset ring-line">
                                {list.map((a) => (
                                  <ActionCard
                                    key={a.id}
                                    action={a}
                                    details={{ ...getActionBrandDetails(a), label: pickerLabel(getActionBrandDetails(a)) }}
                                    expanded={expandedActionId === a.id}
                                    dragOver={dragOverActionId === a.id}
                                    onToggleExpand={() => setExpandedActionId(expandedActionId === a.id ? null : a.id)}
                                    onToggleActive={() =>
                                      run(() =>
                                        authFetch(`/cards/${id}/actions/${a.id}`, {
                                          method: 'PATCH',
                                          body: JSON.stringify({ isActive: !a.isActive }),
                                        }),
                                      )
                                    }
                                    onPatchConfig={(config) =>
                                      run(() =>
                                        authFetch(`/cards/${id}/actions/${a.id}`, {
                                          method: 'PATCH',
                                          body: JSON.stringify({ config }),
                                        }),
                                      )
                                    }
                                    onDuplicate={() => duplicateAction(a)}
                                    onDelete={() => removeWithUndo('actions', a.id, t('links.removed'))}
                                    onDragStart={(e) => {
                                      setDraggedActionId(a.id);
                                      e.dataTransfer.effectAllowed = 'move';
                                    }}
                                    onDragOver={(e) => {
                                      e.preventDefault();
                                      if (draggedActionId && draggedActionId !== a.id) setDragOverActionId(a.id);
                                    }}
                                    onDragLeave={() => setDragOverActionId(null)}
                                    onDragEnd={() => {
                                      setDraggedActionId(null);
                                      setDragOverActionId(null);
                                    }}
                                    onDrop={(e) => {
                                      e.preventDefault();
                                      if (draggedActionId && draggedActionId !== a.id) handleDragDrop(draggedActionId, a.id);
                                      setDraggedActionId(null);
                                      setDragOverActionId(null);
                                    }}
                                  />
                                ))}
                              </div>
                            ) : (
                              <p className="rounded-xl border border-dashed border-line px-4 py-3 text-center text-xs text-faint">
                                {t(`links.group.${key}Empty`)}
                              </p>
                            )}
                          </div>
                        );
                      })}

                      <div>
                        <div className="mb-2 flex items-baseline justify-between gap-3">
                          <h3 id="links-display" className="text-sm font-medium text-ink">
                            {t('links.display.title')}
                          </h3>
                          <span className="text-xs text-faint">{t('links.display.hint')}</span>
                        </div>
                        <div role="radiogroup" aria-labelledby="links-display" className="grid grid-cols-3 gap-2.5">
                          {LINK_STYLES.map((s) => (
                            <button
                              key={s}
                              type="button"
                              role="radio"
                              aria-checked={linkStyle === s}
                              onClick={() => setLinkStyle(s)}
                              className={`min-w-0 rounded-xl p-3 text-start transition-colors ${
                                linkStyle === s ? 'bg-accent/[0.05] ring-2 ring-inset ring-accent' : 'ring-1 ring-inset ring-line hover:bg-elevated'
                              }`}
                            >
                              <LinkStyleSketch style={s} />
                              <span className="mt-2.5 block truncate text-sm font-medium text-ink">{t(`links.display.${s}.label`)}</span>
                              <span className="block truncate text-xs text-faint">{t(`links.display.${s}.desc`)}</span>
                            </button>
                          ))}
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-4 rounded-xl px-3.5 py-3 ring-1 ring-inset ring-line">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-ink">{t('links.openInApp.title')}</p>
                            <p className="mt-0.5 text-xs leading-snug text-faint">{t('links.openInApp.hint')}</p>
                          </div>
                          <Toggle on={openInApp} onChange={() => setOpenInApp((v) => !v)} label={t('links.openInApp.title')} />
                        </div>
                      </div>
                    </div>
                  )}
                </StudioSection>

                {/* Payment links — external link-sharing only */}
                <div id="studio-payments" className="scroll-mt-16">
                  <PaymentLinksManager cardId={id} onChange={setPaymentLinks} />
                </div>

                <StudioSection id="studio-sections" title={t('sections.title')} description={t('sections.subtitle')}>
                  <div className="space-y-3">
                    {sections.map((s, i) => {
                      const details = SECTION_DETAILS[s.type];
                      return (
                        <div key={s.id} className="rounded-xl ring-1 ring-inset ring-line">
                          <div className="flex items-center gap-3 px-3.5 py-3">
                            <span className="v-icon-tile">
                              <Icon name={details?.icon ?? 'layers'} size={15} />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className={`truncate text-sm font-medium ${s.isVisible ? 'text-ink' : 'text-faint'}`}>
                                {details ? t(`sections.types.${s.type}.label`) : s.type}
                              </p>
                              <p className="truncate text-xs text-faint">{details ? t(`sections.types.${s.type}.desc`) : ''}</p>
                            </div>
                            <div className="flex shrink-0 items-center">
                              <RowButton
                                label={t('links.toggleVisibility')}
                                pressed={s.isVisible}
                                onClick={() =>
                                  run(() =>
                                    authFetch(`/cards/${id}/sections/${s.id}`, {
                                      method: 'PATCH',
                                      body: JSON.stringify({ isVisible: !s.isVisible }),
                                    }),
                                  )
                                }
                              >
                                <Icon name={s.isVisible ? 'eye' : 'eye-off'} size={15} />
                              </RowButton>
                              <RowButton label={t('links.moveUp')} disabled={i === 0} onClick={() => move(sections, i, -1, 'sections')}>
                                <Icon name="chevron-down" size={15} className="rotate-180" />
                              </RowButton>
                              <RowButton label={t('links.moveDown')} disabled={i === sections.length - 1} onClick={() => move(sections, i, 1, 'sections')}>
                                <Icon name="chevron-down" size={15} />
                              </RowButton>
                              <RowButton label={t('sections.deleteBlock')} danger onClick={() => removeWithUndo('sections', s.id, t('sections.removed'))}>
                                <Icon name="trash" size={14} />
                              </RowButton>
                            </div>
                          </div>

                          <div className="grid gap-4 border-t border-line px-3.5 py-4">
                            {s.type === 'BIO' ? (
                              <Field label={t('sections.bioTitle')}>
                                <textarea
                                  className="v-field min-h-24"
                                  aria-label={t('sections.bioTitle')}
                                  defaultValue={(s.content.body as string) ?? ''}
                                  onBlur={(e) => patchSection(s, 'body', e.target.value)}
                                  placeholder={t('sections.bioPlaceholder')}
                                />
                              </Field>
                            ) : s.type === 'VIDEO' ? (
                              <>
                                <p className="text-xs text-muted">{t('sections.videoHelp')}</p>
                                <Field label={t('sections.videoUrl')}>
                                  <input
                                    dir="ltr"
                                    className="v-field rtl:text-right"
                                    defaultValue={(s.content.videoUrl as string) ?? ''}
                                    onBlur={(e) => patchSection(s, 'videoUrl', e.target.value)}
                                    placeholder={t('sections.videoPlaceholder')}
                                  />
                                </Field>
                                <Field label={t('sections.sectionTitle')} hint={t('sections.optional')}>
                                  <input
                                    className="v-field"
                                    defaultValue={(s.content.title as string) ?? ''}
                                    onBlur={(e) => patchSection(s, 'title', e.target.value)}
                                    placeholder={t('sections.videoTitlePlaceholder')}
                                  />
                                </Field>
                                {(s.content.videoUrl as string) &&
                                  (() => {
                                    const raw = s.content.videoUrl as string;
                                    const ytMatch = raw.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
                                    const vimeoMatch = raw.match(/vimeo\.com\/(\d+)/);
                                    const embedUrl = ytMatch
                                      ? `https://www.youtube.com/embed/${ytMatch[1]}`
                                      : vimeoMatch
                                        ? `https://player.vimeo.com/video/${vimeoMatch[1]}`
                                        : null;
                                    return embedUrl ? (
                                      <div className="aspect-video overflow-hidden rounded-lg ring-1 ring-line">
                                        <iframe
                                          src={embedUrl}
                                          className="h-full w-full"
                                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                          allowFullScreen
                                        />
                                      </div>
                                    ) : (
                                      <p className="text-xs text-amber-700 dark:text-amber-400">{t('sections.videoInvalid')}</p>
                                    );
                                  })()}
                              </>
                            ) : s.type === 'PORTFOLIO' ? (
                              <>
                                <Field label={t('sections.galleryTitle')} hint={t('sections.optional')}>
                                  <input
                                    className="v-field"
                                    defaultValue={(s.content.title as string) ?? ''}
                                    onBlur={(e) => patchSection(s, 'title', e.target.value)}
                                    placeholder={t('sections.galleryTitlePlaceholder')}
                                  />
                                </Field>
                                <div>
                                  <p className="mb-2 text-xs text-muted">{t('sections.galleryImages')}</p>
                                  {Array.isArray(s.content.images) && (s.content.images as string[]).length > 0 && (
                                    <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                                      {(s.content.images as string[]).map((imgUrl, imgIdx) => (
                                        <div key={imgIdx} className="group relative aspect-square overflow-hidden rounded-lg ring-1 ring-line">
                                          {/* eslint-disable-next-line @next/next/no-img-element */}
                                          <img src={imgUrl} alt="" className="h-full w-full object-cover" />
                                          <button
                                            onClick={() => {
                                              const images = [...(s.content.images as string[])];
                                              images.splice(imgIdx, 1);
                                              patchSection(s, 'images', images);
                                            }}
                                            aria-label={t('upload.remove')}
                                            className="absolute end-1 top-1 flex h-7 w-7 items-center justify-center rounded-md bg-black/60 text-white opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100"
                                          >
                                            <Icon name="x" size={12} />
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  <ImageUpload
                                    value=""
                                    shape="wide"
                                    label={t('sections.addGalleryImage')}
                                    onChange={(url) => {
                                      if (!url) return;
                                      const images = Array.isArray(s.content.images) ? [...(s.content.images as string[])] : [];
                                      images.push(url);
                                      patchSection(s, 'images', images);
                                    }}
                                  />
                                </div>
                              </>
                            ) : s.type === 'CREDENTIALS' ? (
                              (() => {
                                const items = (Array.isArray(s.content.items) ? s.content.items : []) as Credential[];
                                const save = (next: Credential[]) => patchSection(s, 'items', next);
                                const edit = (item: Credential, key: keyof Credential, value: string) => {
                                  if ((item[key] ?? '') === value) return;
                                  save(items.map((x) => (x.id === item.id ? { ...x, [key]: value } : x)));
                                };
                                return (
                                  <>
                                    <Field label={t('sections.sectionTitle')} hint={t('sections.optional')}>
                                      <input className="v-field" defaultValue={(s.content.title as string) ?? ''} onBlur={(e) => patchSection(s, 'title', e.target.value)} placeholder={t('sections.credentials.titlePlaceholder')} />
                                    </Field>
                                    {items.map((item) => (
                                      <div key={item.id} className="grid gap-2 rounded-lg p-3 ring-1 ring-inset ring-line sm:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_88px_auto] sm:items-end">
                                        <Field label={t('sections.credentials.name')}>
                                          <input className="v-field" defaultValue={item.name} onBlur={(e) => edit(item, 'name', e.target.value.trim())} placeholder={t('sections.credentials.namePlaceholder')} />
                                        </Field>
                                        <Field label={t('sections.credentials.issuer')}>
                                          <input className="v-field" defaultValue={item.issuer} onBlur={(e) => edit(item, 'issuer', e.target.value.trim())} placeholder={t('sections.credentials.issuerPlaceholder')} />
                                        </Field>
                                        <Field label={t('sections.credentials.year')}>
                                          <input className="v-field tabular" inputMode="numeric" maxLength={4} defaultValue={item.year} onBlur={(e) => edit(item, 'year', e.target.value.trim())} placeholder="2024" />
                                        </Field>
                                        <RowButton label={t('sections.credentials.remove')} danger onClick={() => save(items.filter((x) => x.id !== item.id))}>
                                          <Icon name="trash" size={14} />
                                        </RowButton>
                                      </div>
                                    ))}
                                    <button
                                      type="button"
                                      onClick={() => save([...items, { id: newId(), name: '', issuer: '', year: '' }])}
                                      className="flex min-h-11 w-fit items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-ink ring-1 ring-inset ring-line transition-colors hover:bg-elevated sm:min-h-9"
                                    >
                                      <Icon name="plus" size={14} /> {t('sections.credentials.add')}
                                    </button>
                                  </>
                                );
                              })()
                            ) : s.type === 'CLIENTS' ? (
                              <>
                                <Field label={t('sections.sectionTitle')} hint={t('sections.optional')}>
                                  <input className="v-field" defaultValue={(s.content.title as string) ?? ''} onBlur={(e) => patchSection(s, 'title', e.target.value)} placeholder={t('sections.clients.titlePlaceholder')} />
                                </Field>
                                <div>
                                  <p className="mb-2 text-xs text-muted">{t('sections.clients.help')}</p>
                                  {Array.isArray(s.content.logos) && (s.content.logos as string[]).length > 0 && (
                                    <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                                      {(s.content.logos as string[]).map((logo, li) => (
                                        <div key={`${logo}-${li}`} className="group relative flex aspect-[3/2] items-center justify-center overflow-hidden rounded-lg bg-white p-3 ring-1 ring-line">
                                          {/* eslint-disable-next-line @next/next/no-img-element */}
                                          <img src={logo} alt="" className="max-h-full max-w-full object-contain" />
                                          <button
                                            onClick={() => patchSection(s, 'logos', (s.content.logos as string[]).filter((_, x) => x !== li))}
                                            aria-label={t('upload.remove')}
                                            className="absolute end-1 top-1 flex h-7 w-7 items-center justify-center rounded-md bg-black/60 text-white opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100"
                                          >
                                            <Icon name="x" size={12} />
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  <ImageUpload
                                    value=""
                                    shape="wide"
                                    label={t('sections.clients.add')}
                                    onChange={(url) => {
                                      if (!url) return;
                                      patchSection(s, 'logos', [...(Array.isArray(s.content.logos) ? (s.content.logos as string[]) : []), url]);
                                    }}
                                  />
                                </div>
                              </>
                            ) : s.type === 'BOOKING' ? (
                              <>
                                <p className="text-xs text-muted">{t('sections.bookingHelp')}</p>
                                <Field label={t('links.bookingUrl')}>
                                  <input
                                    dir="ltr"
                                    className="v-field rtl:text-right"
                                    defaultValue={(s.content.bookingUrl as string) ?? ''}
                                    onBlur={(e) => patchSection(s, 'bookingUrl', e.target.value)}
                                    placeholder={t('links.bookingPlaceholder')}
                                  />
                                </Field>
                                <Field label={t('links.buttonLabel')} hint={t('sections.optional')}>
                                  <input
                                    className="v-field"
                                    defaultValue={(s.content.buttonLabel as string) ?? ''}
                                    onBlur={(e) => patchSection(s, 'buttonLabel', e.target.value)}
                                    placeholder={t('sections.bookingPlaceholder')}
                                  />
                                </Field>
                              </>
                            ) : (
                              <>
                                <div className="grid gap-4 sm:grid-cols-2">
                                  <Field label={t('sections.sectionHeading')}>
                                    <input
                                      className="v-field"
                                      defaultValue={(s.content.title as string) ?? ''}
                                      onBlur={(e) => patchSection(s, 'title', e.target.value)}
                                      placeholder={t('sections.servicesPlaceholder')}
                                    />
                                  </Field>
                                  <Field label={t('sections.subtitleField')}>
                                    <input
                                      className="v-field"
                                      defaultValue={(s.content.subtitle as string) ?? ''}
                                      onBlur={(e) => patchSection(s, 'subtitle', e.target.value)}
                                      placeholder={t('sections.offerPlaceholder')}
                                    />
                                  </Field>
                                </div>
                                <Field label={t('sections.bodyContent')}>
                                  <textarea
                                    className="v-field min-h-20"
                                    defaultValue={(s.content.body as string) ?? ''}
                                    onBlur={(e) => patchSection(s, 'body', e.target.value)}
                                    placeholder={t('sections.bodyPlaceholder')}
                                  />
                                </Field>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {sections.length === 0 && (
                      <p className="rounded-xl border border-dashed border-line px-4 py-3 text-center text-xs text-faint">
                        {t('sections.empty')}
                      </p>
                    )}
                  </div>

                  <h3 className="mb-2 mt-6 text-sm font-medium text-ink">{t('sections.available')}</h3>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {Object.entries(SECTION_DETAILS).map(([type, details]) => (
                      <button
                        key={type}
                        onClick={() => addSection(type)}
                        className="flex min-h-11 items-center gap-2.5 rounded-lg px-3 py-2 text-start text-sm font-medium text-ink ring-1 ring-inset ring-line transition-colors hover:bg-elevated"
                      >
                        <span className="text-faint">
                          <Icon name={details.icon} size={15} />
                        </span>
                        <span className="truncate">{t(`sections.types.${type}.label`)}</span>
                      </button>
                    ))}
                  </div>
                </StudioSection>

                <StudioSection id="studio-meetings" title={t('meetings.title')} description={t('meetings.subtitle')}>
                  <MeetingHours cardId={id} slug={card.slug} lang={lang} stored={(card.theme as Record<string, unknown> | null)?.availability} />
                </StudioSection>
              </div>
            )}

            {activeTab === 'design' && (
              <StudioSection title={t('design.title')} description={t('design.subtitle')}>
                <div className="space-y-8">
                  <div>
                    <h3 id="design-layout" className="mb-3 text-sm font-medium text-ink">{t('design.layout')}</h3>
                    <div role="radiogroup" aria-labelledby="design-layout" className="grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4">
                      {LAYOUTS.map((l) => (
                        <button
                          key={l}
                          type="button"
                          role="radio"
                          aria-checked={layout === l}
                          onClick={() => setLayout(l)}
                          className={`min-w-0 rounded-xl p-2.5 text-start transition-colors ${
                            layout === l ? 'bg-accent/[0.05] ring-2 ring-inset ring-accent' : 'ring-1 ring-inset ring-line hover:bg-elevated'
                          }`}
                        >
                          <LayoutSketch layout={l} accent={accent} />
                          <span className="mt-2.5 block truncate text-sm font-medium text-ink">{t(`design.layouts.${l}.label`)}</span>
                          <span className="block text-xs leading-snug text-faint">{t(`design.layouts.${l}.desc`)}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="mb-3 text-sm font-medium text-ink">{t('design.accent')}</h3>
                    <div className="flex flex-wrap items-center gap-2.5">
                      {SWATCHES.map((c) => {
                        const selected = accent.toLowerCase() === c.toLowerCase();
                        return (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setAccent(c)}
                            aria-label={c}
                            aria-pressed={selected}
                            className={`h-8 w-8 rounded-full ring-1 ring-inset ring-black/10 transition-shadow ${
                              selected ? 'shadow-[0_0_0_2px_hsl(var(--v-surface)),0_0_0_4px_hsl(var(--v-fg))]' : ''
                            }`}
                            style={{ background: c }}
                          />
                        );
                      })}
                      <label
                        className="relative flex h-8 items-center gap-2 rounded-full px-3 text-xs text-muted ring-1 ring-inset ring-line hover:bg-elevated"
                        title={accent}
                      >
                        <span className="h-4 w-4 rounded-full ring-1 ring-inset ring-black/10" style={{ background: accent }} />
                        <span dir="ltr" className="font-mono">{accent}</span>
                        <input
                          type="color"
                          value={/^#[0-9a-f]{6}$/i.test(accent) ? accent : '#2563eb'}
                          onChange={(e) => setAccent(e.target.value)}
                          className="absolute inset-0 cursor-pointer opacity-0"
                        />
                      </label>
                    </div>
                  </div>

                  <div>
                    <h3 className="mb-3 text-sm font-medium text-ink">{t('design.themeMode')}</h3>
                    <div className="grid max-w-lg grid-cols-3 gap-3">
                      {(['light', 'dark', 'auto'] as const).map((m) => (
                        <OptionCard key={m} selected={mode === m} onClick={() => setMode(m)} label={t(`design.${m}Mode`)}>
                          <span className="relative flex h-16 overflow-hidden rounded-md ring-1 ring-inset ring-black/10">
                            {/* "Auto" shows both halves: it follows the visitor's phone. */}
                            {(m === 'auto' ? (['light', 'dark'] as const) : [m]).map((half) => (
                              <span key={half} className={`flex flex-1 flex-col gap-1.5 p-2.5 ${half === 'light' ? 'bg-white' : 'bg-[#141416]'}`}>
                                <span className="h-2 w-10 max-w-full rounded-full" style={{ background: accent }} />
                                <span className={`h-1.5 w-16 max-w-full rounded-full ${half === 'light' ? 'bg-black/15' : 'bg-white/20'}`} />
                                <span className={`h-1.5 w-12 max-w-full rounded-full ${half === 'light' ? 'bg-black/10' : 'bg-white/10'}`} />
                              </span>
                            ))}
                          </span>
                        </OptionCard>
                      ))}
                    </div>
                    {mode === 'auto' && <p className="mt-2 text-xs text-faint">{t('design.autoHint')}</p>}
                  </div>

                  <div>
                    <h3 className="mb-3 text-sm font-medium text-ink">{t('design.cover')}</h3>
                    <div className="grid max-w-2xl grid-cols-3 gap-3 sm:grid-cols-5">
                      {COVER_STYLES.map((type) => (
                        <OptionCard key={type} selected={cover === type} onClick={() => setCover(type)} label={t(`design.covers.${type}`)}>
                          <CoverSwatch type={type} accent={accent} />
                        </OptionCard>
                      ))}
                    </div>
                    {vcard.coverImage && <p className="mt-2 text-xs text-faint">{t('design.coverImageWins')}</p>}
                  </div>

                  <div className="flex max-w-2xl items-center justify-between gap-4 rounded-xl px-3.5 py-3 ring-1 ring-inset ring-line">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">{t('design.brand.title')}</p>
                      <p className="mt-0.5 text-xs leading-snug text-faint">{t('design.brand.hint')}</p>
                    </div>
                    <Toggle on={showBrand} onChange={() => setShowBrand((v) => !v)} label={t('design.brand.title')} />
                  </div>

                  <div>
                    <h3 className="mb-3 text-sm font-medium text-ink">{t('design.cardLanguage')}</h3>
                    <div className="inline-flex rounded-lg bg-elevated p-0.5 ring-1 ring-inset ring-line">
                      {(
                        [
                          ['en', 'English'],
                          ['ar', 'العربية'],
                        ] as const
                      ).map(([code, label]) => (
                        <button
                          key={code}
                          type="button"
                          onClick={() => setLang(code)}
                          aria-pressed={lang === code}
                          className={`h-11 rounded-md px-4 text-sm font-medium transition-colors sm:h-8 ${
                            lang === code ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-muted hover:text-ink'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </StudioSection>
            )}

            {activeTab === 'templates' && (
              <StudioSection title={t('templates.title')} description={t('templates.subtitle')}>
                <TemplateMarketplace currentTemplateId={templateId} onApply={applyTemplate} applyingId={applyingId} />
              </StudioSection>
            )}

            {activeTab === 'profiles' && card && <CardProfiles cardId={id} slug={card.slug} />}

            {activeTab === 'nfc' && (
              <StudioSection
                title={t('nfc.provisioning')}
                description={t('nfc.subtitle')}
                action={
                  <Link href="/tags" className="v-btn v-btn-ghost">
                    {t('nfc.manage')}
                  </Link>
                }
              >
                {/* Write a blank tag from this phone — Chromium on Android only,
                    and the component says so itself everywhere else. */}
                <NfcProgrammer cardId={id} onProgrammed={() => void load()} />

                <h3 className="mb-2 mt-8 text-sm font-medium text-ink">{t('nfc.title')}</h3>
                {linkedTags.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">{t('nfc.empty')}</p>
                ) : (
                  <ul className="divide-y divide-line overflow-hidden rounded-xl ring-1 ring-inset ring-line">
                    {linkedTags.map((tag) => (
                      <li key={tag.id} className="flex items-center gap-3 px-3.5 py-3">
                        <span className="v-icon-tile">
                          <Icon name="tag" size={15} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p dir="ltr" className="truncate text-start font-mono text-xs text-ink rtl:text-right">
                            {tag.uid}
                          </p>
                          <p className="text-xs text-faint">
                            {tag.hardwareType.toLowerCase()} · {t('nfc.scanCount')}{' '}
                            <span className="tabular">{tag.activationCount}</span>
                          </p>
                        </div>
                        <span className="v-badge v-badge-success">{t('nfc.bound')}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-3 text-xs text-faint">{t('nfc.explain')}</p>
              </StudioSection>
            )}

            {activeTab === 'settings' && (
              <div className="space-y-10">
                <StudioSection title={t('settings.general')} description={t('settings.subtitle')}>
                  <div className="space-y-6">
                    <Field label={t('settings.title')} hint={t('settings.slugHint')} error={say('slug')} errorId="studio-slug-err">
                      <div dir="ltr" className={`flex max-w-md items-center rounded-lg ring-1 ring-inset focus-within:ring-accent ${say('slug') ? 'ring-red-600/70' : 'ring-line-strong'}`}>
                        <span className="ps-3 font-mono text-sm text-faint">/c/</span>
                        <input
                          className="h-11 min-w-0 flex-1 bg-transparent pe-3 font-mono text-sm text-ink outline-none sm:h-9"
                          value={slug}
                          {...checks.bind('slug', 'studio-slug-err')}
                          aria-invalid={!!say('slug') || undefined}
                          aria-describedby={say('slug') ? 'studio-slug-err' : undefined}
                          onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                        />
                      </div>
                    </Field>

                    <div>
                      <p className="mb-2 text-xs text-muted">{t('settings.visibility')}</p>
                      <div className="grid max-w-md gap-2 sm:grid-cols-2">
                        {([true, false] as const).map((published) => {
                          const selected = card.isPublished === published;
                          return (
                            <button
                              key={String(published)}
                              onClick={() =>
                                !selected &&
                                run(() => authFetch(`/cards/${id}`, { method: 'PATCH', body: JSON.stringify({ isPublished: published }) }))
                              }
                              aria-pressed={selected}
                              className={`flex flex-col rounded-[10px] p-3 text-start transition-shadow ${
                                selected ? 'shadow-[inset_0_0_0_1.5px_var(--v-accent),0_0_0_3px_rgba(var(--v-accent-rgb),0.15)]' : 'ring-1 ring-inset ring-line hover:bg-elevated'
                              }`}
                            >
                              <span className="flex items-center gap-2 text-sm font-medium text-ink">
                                <span className={`h-2 w-2 rounded-full ${published ? 'bg-emerald-500' : 'bg-faint'}`} />
                                {published ? t('settings.published') : t('settings.draft')}
                              </span>
                              <span className="mt-1 block text-xs leading-relaxed text-faint">
                                {published ? t('settings.publishedHint') : t('settings.draftHint')}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </StudioSection>

                <MoveCard cardId={card.id} cardName={(card.vcardData as { fullName?: string } | null)?.fullName || card.slug} />

                <section className="rounded-xl ring-1 ring-inset ring-red-500/25">
                  <div className="px-4 py-4">
                    <h2 className="text-base font-semibold text-red-700 dark:text-red-400">{t('settings.danger')}</h2>
                    <p className="mt-1 text-sm leading-relaxed text-muted">{t('settings.dangerZone')}</p>
                  </div>
                  <div className="border-t border-red-500/20 px-4 py-3">
                    {!showDeleteConfirm ? (
                      <button onClick={() => setShowDeleteConfirm(true)} className="v-btn v-btn-danger">
                        {t('settings.deleteCard')}
                      </button>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-sm text-ink">
                          {t('settings.confirmPrompt')}
                          <code dir="ltr" className="ms-1 rounded bg-red-500/10 px-1.5 py-0.5 font-mono text-xs text-red-700 dark:text-red-300">
                            {card.slug}
                          </code>
                        </p>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <input
                            dir="ltr"
                            value={deleteSlugConfirm}
                            onChange={(e) => setDeleteSlugConfirm(e.target.value)}
                            placeholder={card.slug}
                            className="v-field font-mono sm:max-w-xs"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setShowDeleteConfirm(false);
                                setDeleteSlugConfirm('');
                              }}
                              className="v-btn v-btn-ghost"
                            >
                              {t('settings.cancel')}
                            </button>
                            <button onClick={handleDeleteCard} disabled={deleteSlugConfirm !== card.slug} className="v-btn v-btn-danger">
                              {t('settings.confirmDelete')}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              </div>
            )}
          </div>
        </div>

        {/* Preview */}
        <aside
          aria-label={t('phonePreview.title')}
          className={`${previewOpen ? 'fixed inset-0 z-[95] overflow-y-auto' : 'hidden'} bg-elevated lg:static lg:block lg:w-[380px] lg:shrink-0 lg:overflow-y-auto lg:border-s lg:border-line xl:w-[430px]`}
        >
          <div className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-line bg-surface/95 px-4 backdrop-blur-md lg:hidden">
            <span className="text-base font-semibold text-ink">{t('phonePreview.title')}</span>
            <button type="button" onClick={() => setPreviewOpen(false)} className="v-btn v-btn-ghost">
              {t('phonePreview.backToEditing')}
            </button>
          </div>
          <div className="space-y-5 px-5 py-5">
            <LivePreview
              card={
                {
                  ...card,
                  vcardData: vcard,
                  theme: { ...card.theme, accent, mode, cover, lang, links: linkStyle, openInApp, layout, brand: showBrand },
                } as any
              }
              sections={sections}
              actions={actions}
              paymentLinks={paymentLinks}
              slug={card.slug}
              qrUrl={qrUrl}
            />
            <div id="share-card" className="scroll-mt-24">
              <ShareCard slug={card.slug} />
            </div>
          </div>
        </aside>
      </div>

      <PublishedSheet open={justPublished} onClose={() => setJustPublished(false)} slug={card.slug} name={cardName} />

      {!previewOpen && (
        <button
          type="button"
          onClick={() => setPreviewOpen(true)}
          className="fixed bottom-[calc(1rem+var(--v-dock,0px))] end-4 z-40 flex h-12 items-center gap-2 rounded-full bg-ink px-5 text-base font-medium text-surface shadow-lg lg:hidden"
        >
          <Icon name="eye" size={17} />
          {t('phonePreview.open')}
        </button>
      )}

      {/* Platform picker */}
      <AnimatePresence>
        {isModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsModalOpen(false)}
            className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-canvas/70 px-4 pt-[10vh] backdrop-blur-[2px]"
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={t('links.add')}
              initial={{ y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 8, opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={(e) => e.stopPropagation()}
              className="mb-10 w-full max-w-[640px] overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
            >
              <div className="flex items-center gap-3 border-b border-line px-4">
                <span className="text-faint">
                  <Icon name="search" size={17} />
                </span>
                <input
                  type="text"
                  autoFocus
                  placeholder={t('platformPicker.searchPlaceholder')}
                  className="h-14 min-w-0 flex-1 bg-transparent text-md text-ink outline-none placeholder:text-faint"
                  value={platformSearch}
                  onChange={(e) => setPlatformSearch(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
                <button onClick={() => setIsModalOpen(false)} className="v-kbd shrink-0" aria-label={t('settings.cancel')}>
                  Esc
                </button>
              </div>

              <div className="max-h-[min(460px,62vh)] overflow-y-auto p-1.5">
                {pickerGroups.length === 0 && <p className="px-3 py-8 text-center text-sm text-muted">{t('platformPicker.empty')}</p>}
                {pickerGroups.map((group) => (
                  <div key={group.key} className="pb-1">
                    <p className="px-2.5 pb-1 pt-2 text-2xs font-medium text-faint">{t(`platformPicker.categories.${group.key}`)}</p>
                    <div className="grid gap-0.5 sm:grid-cols-2">
                      {group.items.map((plat) => {
                        const current = visiblePlatforms[highlightedIndex];
                        const isHighlighted = current?.key === plat.key && current?.category === plat.category;
                        const isDisabled = plat.key === 'SAVE_CONTACT' && actions.some((a) => a.type === 'SAVE_CONTACT');
                        const isFav = favorites.includes(plat.key);
                        return (
                          <div
                            key={`${group.key}-${plat.key}`}
                            role="button"
                            tabIndex={-1}
                            aria-disabled={isDisabled}
                            onClick={() => !isDisabled && handleSelectPlatform(plat)}
                            className={`group/item flex h-11 cursor-pointer items-center gap-3 rounded-lg px-2.5 ${
                              isHighlighted ? 'bg-elevated' : 'hover:bg-elevated'
                            } ${isDisabled ? 'cursor-not-allowed opacity-40' : ''}`}
                          >
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-elevated text-ink ring-1 ring-inset ring-line">
                              <Icon name={plat.icon} size={14} />
                            </span>
                            <span className="min-w-0 flex-1 truncate text-sm text-ink">{pickerLabel(plat)}</span>
                            <button
                              onClick={(e) => handleToggleFav(e, plat.key)}
                              aria-pressed={isFav}
                              title={isFav ? t('platformPicker.unfavorite') : t('platformPicker.favorite')}
                              aria-label={isFav ? t('platformPicker.unfavorite') : t('platformPicker.favorite')}
                              className={`flex h-7 w-7 items-center justify-center rounded-md ${
                                isFav ? 'text-amber-500' : 'text-faint opacity-0 hover:text-ink focus-visible:opacity-100 group-hover/item:opacity-100'
                              }`}
                            >
                              <Icon name="star" size={14} className={isFav ? 'fill-current' : undefined} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden border-t border-line bg-elevated px-4 py-2.5 text-xs text-faint sm:block">{t('platformPicker.hint')}</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </AppShell>
  );
}

function StudioSection({
  id,
  title,
  description,
  action,
  children,
}: {
  id?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-16">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-[-0.012em] text-ink rtl:tracking-normal">{title}</h2>
          {description && <p className="mt-1 text-sm leading-relaxed text-muted">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}

function Field({ label, hint, error, errorId, children }: { label: string; hint?: string; error?: string | null; errorId?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline gap-1.5 text-xs text-muted">
        {label}
        {hint && <span className="text-xs text-faint">· {hint}</span>}
      </span>
      {children}
      {errorId && <FieldError id={errorId}>{error}</FieldError>}
    </label>
  );
}

function RowButton({
  label,
  onClick,
  disabled,
  pressed,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className={`flex h-11 w-11 items-center justify-center rounded-lg transition-colors disabled:opacity-30 sm:h-8 sm:w-8 ${
        danger ? 'text-muted hover:bg-red-500/10 hover:text-red-600' : 'text-muted hover:bg-elevated hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}

/** A cover pattern in small, as the card draws it (see CoverArt). */
function CoverSwatch({ type, accent }: { type: CoverStyle; accent: string }) {
  const background =
    type === 'solid'
      ? accent
      : type === 'gradient'
        ? `linear-gradient(160deg, ${shade(accent, 18)}, ${accent} 45%, ${shade(accent, -40)})`
        : type === 'mesh'
          ? `radial-gradient(60% 90% at 12% 10%, ${shade(accent, 45)}, transparent 70%), radial-gradient(70% 100% at 95% 100%, ${shade(accent, -45)}, transparent 70%), ${accent}`
          : type === 'lines'
            ? `repeating-linear-gradient(135deg, rgba(255,255,255,0.12) 0 1px, transparent 1px 7px), linear-gradient(160deg, ${shade(accent, 10)}, ${shade(accent, -30)})`
            : 'radial-gradient(rgba(255,255,255,0.5) 1px, transparent 1px) 0 0 / 10px 10px, #0b0b10';
  return <span className="block h-12 rounded-md ring-1 ring-inset ring-black/10" style={{ background }} />;
}

/** Where the photo, name and buttons sit, in small. */
function LayoutSketch({ layout, accent }: { layout: Layout; accent: string }) {
  const bar = (w: string, strong = false) => <span className={`block h-1.5 rounded-full ${strong ? 'bg-ink/60' : 'bg-ink/15'}`} style={{ width: w }} />;
  const buttons = (
    <span className="mt-2 grid grid-cols-2 gap-1">
      <span className="h-2.5 rounded-[3px]" style={{ background: accent }} />
      <span className="h-2.5 rounded-[3px] ring-1 ring-inset ring-ink/15" />
    </span>
  );
  const photo = (size: number, extra = '') => (
    <span className={`block shrink-0 rounded-full ring-2 ring-surface ${extra}`} style={{ width: size, height: size, background: shade(accent, -30) }} />
  );
  return (
    <span className="block h-[104px] overflow-hidden rounded-lg bg-surface ring-1 ring-inset ring-line" aria-hidden>
      {layout === 'classic' && (
        <>
          <span className="block h-7" style={{ background: accent }} />
          <span className="block px-2">
            {photo(20, '-mt-2.5')}
            <span className="mt-1.5 block space-y-1">{bar('60%', true)}{bar('40%')}</span>
            {buttons}
          </span>
        </>
      )}
      {layout === 'centered' && (
        <>
          <span className="block h-7" style={{ background: accent }} />
          <span className="flex flex-col items-center px-2">
            {photo(22, '-mt-3')}
            <span className="mt-1.5 flex w-full flex-col items-center space-y-1">{bar('55%', true)}{bar('35%')}</span>
            <span className="w-full">{buttons}</span>
          </span>
        </>
      )}
      {layout === 'spotlight' && (
        <>
          <span className="relative block h-[62px]" style={{ background: `linear-gradient(180deg, ${shade(accent, 20)}, ${shade(accent, -60)})` }}>
            <span className="absolute bottom-1.5 start-2 block w-[70%] space-y-1">
              <span className="block h-1.5 w-[70%] rounded-full bg-white/90" />
              <span className="block h-1.5 w-[45%] rounded-full bg-white/50" />
            </span>
          </span>
          <span className="block px-2">{buttons}</span>
        </>
      )}
      {layout === 'minimal' && (
        <span className="block px-2 pt-2">
          <span className="flex items-center justify-between">
            <span className="block h-1.5 w-8 rounded-full bg-ink/15" />
            <span className="block h-2.5 w-2.5 rounded-full ring-1 ring-inset ring-ink/20" />
          </span>
          <span className="mt-2.5 flex items-center gap-1.5">
            <span className="block h-5 w-5 shrink-0 rounded-[6px]" style={{ background: shade(accent, -30) }} />
            <span className="block flex-1 space-y-1">{bar('70%', true)}{bar('45%')}</span>
          </span>
          <span className="mt-2 block h-[2px] w-4 rounded-full" style={{ background: accent }} />
          {buttons}
        </span>
      )}
    </span>
  );
}

function OptionCard({
  selected,
  onClick,
  label,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-[10px] p-2 text-start transition-shadow ${
        selected ? 'shadow-[inset_0_0_0_1.5px_var(--v-accent),0_0_0_3px_rgba(var(--v-accent-rgb),0.15)]' : 'ring-1 ring-inset ring-line hover:bg-elevated'
      }`}
    >
      {children}
      <span className="mt-2 block px-0.5 text-xs font-medium text-ink">{label}</span>
    </button>
  );
}

/** Card completeness as a small ring. */
function ScoreRing({ value }: { value: number }) {
  const r = 14;
  const c = 2 * Math.PI * r;
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" className="shrink-0 -rotate-90" aria-hidden>
      <circle cx="17" cy="17" r={r} fill="none" stroke="hsl(var(--v-border))" strokeWidth="3.5" />
      <circle
        cx="17"
        cy="17"
        r={r}
        fill="none"
        stroke="var(--v-accent)"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeDasharray={`${(value / 100) * c} ${c}`}
      />
    </svg>
  );
}

/** A small drawing of each link layout, so the choice reads before its name. */
function LinkStyleSketch({ style }: { style: LinkStyle }) {
  return (
    <span aria-hidden className="flex h-12 flex-col justify-center gap-1.5 rounded-lg bg-elevated px-2.5 ring-1 ring-inset ring-line">
      {style === 'icons' ? (
        <span className="flex gap-1.5">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="h-4 w-4 rounded-[4px] bg-ink/15" />
          ))}
        </span>
      ) : style === 'buttons' ? (
        [0, 1].map((i) => <span key={i} className="block h-3.5 w-full rounded-[4px] ring-1 ring-inset ring-ink/20" />)
      ) : (
        [0, 1].map((i) => (
          <span key={i} className="flex items-center gap-1.5">
            <span className="h-3 w-3 shrink-0 rounded-[3px] bg-ink/15" />
            <span className="h-1.5 w-2/3 rounded-full bg-ink/15" />
          </span>
        ))
      )}
    </span>
  );
}
