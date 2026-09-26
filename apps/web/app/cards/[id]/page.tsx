'use client';

import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import QRCode from 'qrcode';
import { motion, AnimatePresence } from 'framer-motion';
import { authFetch, getToken, type Card as CardType, type Section, type CardAction, type NfcTag } from '@/lib/client';

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
import { Icon, actionIcon } from '@/components/Icon';
import { ImageUpload } from '@/components/ImageUpload';

// Design System Imports
import {
  Button,
  Card,
  Badge,
  ProgressBar,
  Alert,
} from '@/design-system';

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
  theme: { accent: string; mode: string; cover: string; lang: string },
) {
  return { slug, templateId, theme, vcardData: vcard };
}
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
};

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
  // ⭐ Quick Actions
  { key: 'CALL', label: 'Phone', arLabel: 'رقم الهاتف', color: '#10b981', icon: 'phone', type: 'CALL', category: '⭐ Quick Actions' },
  { key: 'EMAIL', label: 'Email', arLabel: 'البريد الإلكتروني', color: '#ef4444', icon: 'mail', type: 'EMAIL', category: '⭐ Quick Actions' },
  { key: 'WHATSAPP', label: 'WhatsApp', arLabel: 'واتساب', color: '#25d366', icon: 'whatsapp', type: 'WHATSAPP', category: '⭐ Quick Actions' },
  { key: 'SMS', label: 'SMS', arLabel: 'رسالة قصيرة', color: '#0ea5e9', icon: 'message', type: 'WEBSITE', initialUrl: 'sms:', category: '⭐ Quick Actions' },
  { key: 'MAPS', label: 'Maps', arLabel: 'خرائط جوجل', color: '#f43f5e', icon: 'map-pin', type: 'MAPS', category: '⭐ Quick Actions' },
  { key: 'ADDRESS', label: 'Address', arLabel: 'العنوان الجغرافي', color: '#2563eb', icon: 'map-pin', type: 'MAPS', category: '⭐ Quick Actions' },
  { key: 'LOCATION', label: 'Location', arLabel: 'الموقع الحالي', color: '#3b82f6', icon: 'map-pin', type: 'MAPS', category: '⭐ Quick Actions' },
  { key: 'SAVE_CONTACT', label: 'Save Contact', arLabel: 'حفظ جهة الاتصال', color: '#1d4ed8', icon: 'user-plus', type: 'SAVE_CONTACT', category: '⭐ Quick Actions' },
  { key: 'CONTACT_FORM', label: 'Contact Form', arLabel: 'نموذج التواصل', color: '#14b8a6', icon: 'mail', type: 'WEBSITE', category: '⭐ Quick Actions' },

  // 🌐 Social Media
  { key: 'LINKEDIN', label: 'LinkedIn', arLabel: 'لينكد إن', color: '#0a66c2', icon: 'linkedin', type: 'LINKEDIN', category: '🌐 Social Media' },
  { key: 'FACEBOOK', label: 'Facebook', arLabel: 'فيسبوك', color: '#1877f2', icon: 'facebook', type: 'WEBSITE', initialUrl: 'https://facebook.com/', category: '🌐 Social Media' },
  { key: 'INSTAGRAM', label: 'Instagram', arLabel: 'انستجرام', color: '#e1306c', icon: 'instagram', type: 'WEBSITE', initialUrl: 'https://instagram.com/', category: '🌐 Social Media' },
  { key: 'TWITTER', label: 'X / Twitter', arLabel: 'إكس / تويتر', color: '#000000', icon: 'twitter', type: 'WEBSITE', initialUrl: 'https://x.com/', category: '🌐 Social Media' },
  { key: 'THREADS', label: 'Threads', arLabel: 'ثريدز', color: '#000000', icon: 'link', type: 'WEBSITE', initialUrl: 'https://threads.net/@', category: '🌐 Social Media' },
  { key: 'TIKTOK', label: 'TikTok', arLabel: 'تيك توك', color: '#ff0050', icon: 'youtube', type: 'WEBSITE', initialUrl: 'https://tiktok.com/@', category: '🌐 Social Media' },
  { key: 'YOUTUBE', label: 'YouTube', arLabel: 'يوتيوب', color: '#ff0000', icon: 'youtube', type: 'WEBSITE', initialUrl: 'https://youtube.com/', category: '🌐 Social Media' },
  { key: 'PINTEREST', label: 'Pinterest', arLabel: 'بينتريست', color: '#bd081c', icon: 'tag', type: 'WEBSITE', initialUrl: 'https://pinterest.com/', category: '🌐 Social Media' },
  { key: 'BEHANCE', label: 'Behance', arLabel: 'بيهانس', color: '#1769ff', icon: 'layers', type: 'WEBSITE', initialUrl: 'https://behance.net/', category: '🌐 Social Media' },
  { key: 'DRIBBBLE', label: 'Dribbble', arLabel: 'دريبل', color: '#ea4c89', icon: 'globe', type: 'WEBSITE', initialUrl: 'https://dribbble.com/', category: '🌐 Social Media' },
  { key: 'GITHUB', label: 'GitHub', arLabel: 'جيتهاب', color: '#24292e', icon: 'github', type: 'WEBSITE', initialUrl: 'https://github.com/', category: '🌐 Social Media' },
  { key: 'REDDIT', label: 'Reddit', arLabel: 'ريديت', color: '#ff4500', icon: 'users', type: 'WEBSITE', initialUrl: 'https://reddit.com/u/', category: '🌐 Social Media' },
  { key: 'DISCORD', label: 'Discord', arLabel: 'ديسكورد', color: '#5865f2', icon: 'message', type: 'WEBSITE', initialUrl: 'https://discord.gg/', category: '🌐 Social Media' },
  { key: 'TELEGRAM', label: 'Telegram', arLabel: 'تليجرام', color: '#24a1de', icon: 'telegram', type: 'WEBSITE', initialUrl: 'https://t.me/', category: '🌐 Social Media' },
  { key: 'SNAPCHAT', label: 'Snapchat', arLabel: 'سناب شات', color: '#fffc00', icon: 'snapchat', type: 'WEBSITE', initialUrl: 'https://snapchat.com/add/', category: '🌐 Social Media' },

  // 💼 Business
  { key: 'WEBSITE', label: 'Website', arLabel: 'موقع إلكتروني', color: '#2563eb', icon: 'globe', type: 'WEBSITE', category: '💼 Business' },
  { key: 'PORTFOLIO', label: 'Portfolio', arLabel: 'معرض الأعمال', color: '#3b82f6', icon: 'briefcase', type: 'WEBSITE', category: '💼 Business' },
  { key: 'CALENDLY', label: 'Calendly', arLabel: 'حجز كاليندلي', color: '#006bff', icon: 'calendar', type: 'BOOK_MEETING', initialUrl: 'https://calendly.com/', category: '💼 Business' },
  { key: 'BOOKING', label: 'Booking', arLabel: 'صفحة الحجز', color: '#f59e0b', icon: 'clock', type: 'BOOK_MEETING', category: '💼 Business' },
  { key: 'STRIPE', label: 'Stripe', arLabel: 'بوابة سترايب', color: '#635bff', icon: 'link', type: 'WEBSITE', category: '💼 Business' },
  { key: 'PAYPAL', label: 'PayPal', arLabel: 'حساب بايبال', color: '#003087', icon: 'globe', type: 'WEBSITE', initialUrl: 'https://paypal.me/', category: '💼 Business' },
  { key: 'ZOOM', label: 'Zoom Meeting', arLabel: 'اجتماع زووم', color: '#2d8cff', icon: 'youtube', type: 'BOOK_MEETING', category: '💼 Business' },
  { key: 'GOOGLE_MEET', label: 'Google Meet', arLabel: 'جوجل ميت', color: '#00897b', icon: 'youtube', type: 'BOOK_MEETING', category: '💼 Business' },
  { key: 'TEAMS', label: 'Microsoft Teams', arLabel: 'مايكروسوفت تيمز', color: '#464eb8', icon: 'youtube', type: 'BOOK_MEETING', category: '💼 Business' },
  { key: 'CRM', label: 'CRM Link', arLabel: 'رابط CRM', color: '#ec4899', icon: 'users', type: 'WEBSITE', category: '💼 Business' },
  { key: 'STORE', label: 'Online Store', arLabel: 'المتجر الإلكتروني', color: '#10b981', icon: 'globe', type: 'WEBSITE', category: '💼 Business' },
  { key: 'PRODUCT', label: 'Product Link', arLabel: 'رابط المنتج', color: '#0ea5e9', icon: 'tag', type: 'WEBSITE', category: '💼 Business' },

  // 🎥 Media
  { key: 'GALLERY', label: 'Gallery', arLabel: 'معرض صور', color: '#ec4899', icon: 'image', type: 'WEBSITE', category: '🎥 Media' },
  { key: 'VIDEO', label: 'Video', arLabel: 'رابط فيديو', color: '#ff0000', icon: 'youtube', type: 'WEBSITE', category: '🎥 Media' },
  { key: 'PDF', label: 'PDF Document', arLabel: 'ملف PDF', color: '#ef4444', icon: 'file-text', type: 'FILE', category: '🎥 Media' },
  { key: 'PRESENTATION', label: 'Presentation', arLabel: 'عرض تقديمي', color: '#f59e0b', icon: 'file-text', type: 'FILE', category: '🎥 Media' },
  { key: 'RESUME', label: 'Resume', arLabel: 'السيرة الذاتية', color: '#10b981', icon: 'file-text', type: 'FILE', category: '🎥 Media' },
  { key: 'DOWNLOAD', label: 'Download File', arLabel: 'تحميل ملف', color: '#64748b', icon: 'download', type: 'FILE', category: '🎥 Media' },
  { key: 'CASE_STUDY', label: 'Case Study', arLabel: 'دراسة حالة', color: '#2563eb', icon: 'file-text', type: 'FILE', category: '🎥 Media' },

  // ⚙ Custom
  { key: 'CUSTOM', label: 'Custom Button', arLabel: 'زر مخصص', color: '#3b82f6', icon: 'link', type: 'WEBSITE', category: '⚙ Custom' },
  { key: 'URL', label: 'External URL', arLabel: 'رابط خارجي', color: '#2563eb', icon: 'external-link', type: 'WEBSITE', category: '⚙ Custom' },
  { key: 'INTERNAL_LINK', label: 'Internal Link', arLabel: 'رابط داخلي', color: '#1d4ed8', icon: 'link', type: 'WEBSITE', category: '⚙ Custom' },
  { key: 'EMBED', label: 'Embed Action', arLabel: 'رابط تضمين', color: '#ec4899', icon: 'layers', type: 'WEBSITE', category: '⚙ Custom' },
  { key: 'API_ACTION', label: 'API Action', arLabel: 'أمر API برمي', color: '#10b981', icon: 'settings', type: 'WEBSITE', category: '⚙ Custom' }
];

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
  const router = useRouter();
  const id = params.id;

  // Visual Builder States
  const [activeTab, setActiveTab] = useState<'content' | 'design' | 'templates' | 'profiles' | 'nfc' | 'settings'>('content');
  const [activeSection, setActiveSection] = useState<'profile' | string>('profile');
  const [searchQuery, setSearchQuery] = useState('');
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
  const [mode, setMode] = useState<'light' | 'dark'>('light');
  const [cover, setCover] = useState<'gradient' | 'constellation' | 'solid'>('gradient');
  const [lang, setLang] = useState<'en' | 'ar'>('en');
  const [applyingId, setApplyingId] = useState<string | null>(null);

  // Guided quick-start. `null` until the first load decides, so the studio never
  // flashes before we know whether the card is empty.
  const [guided, setGuided] = useState<boolean | null>(null);

  // Deletion confirm states
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteSlugConfirm, setDeleteSlugConfirm] = useState('');

  // Undo / Redo history. The index also lives in a ref so callbacks never need
  // `historyIndex` in their dependency array (that was causing a render loop).
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const historyIndexRef = useRef(-1);

  // QR Code generator states
  const [qrUrl, setQrUrl] = useState<string>('');

  // --- Persistence guards (refs → never trigger re-render / effect loops) ---
  const loadedRef = useRef(false); // true once the first load has settled
  const lastSavedRef = useRef(''); // serialized identity/theme last persisted to the DB
  const suppressSaveRef = useRef(false); // set when we apply server data, to skip the echo save

  const pushHistory = useCallback((snapshot: string) => {
    setHistory((prev) => {
      const base = prev.slice(0, historyIndexRef.current + 1);
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
    const modeV = th.mode === 'dark' ? 'dark' : 'light';
    const coverV = (th.cover as 'gradient' | 'constellation' | 'solid') ?? (modeV === 'dark' ? 'constellation' : 'gradient');
    const langV = (th.lang as 'en' | 'ar') === 'ar' ? 'ar' : 'en';
    setCard(c);
    setSlug(c.slug);
    setTemplateId(c.templateId);
    setVcard(vc);
    setAccent(accentV);
    setMode(modeV);
    setCover(coverV);
    setLang(langV);
    setSections([...(c.sections ?? [])].sort((a, b) => a.order - b.order));
    setActions([...(c.actions ?? [])].sort((a, b) => a.order - b.order));
    lastSavedRef.current = JSON.stringify(
      identityPayload(c.slug, c.templateId, vc, { accent: accentV, mode: modeV, cover: coverV, lang: langV }),
    );
  }, []);

  const load = useCallback(async () => {
    try {
      const [c, tg] = await Promise.all([
        authFetch<CardType>(`/cards/${id}`),
        authFetch<NfcTag[]>('/nfc/tags'),
      ]);
      applyCard(c);
      setTags(tg);
      pushHistory(JSON.stringify({ c, sections: c.sections, actions: c.actions }));

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

  // Initial load — runs once per card id (stable deps, so no loop).
  useEffect(() => {
    if (!getToken()) { router.replace('/login'); return; }
    load();
  }, [id, router, load]);

  // --- Debounced auto-save: the single writer for identity + theme ----------
  useEffect(() => {
    if (!loadedRef.current) return; // don't save before the first load lands
    if (suppressSaveRef.current) { suppressSaveRef.current = false; return; } // ignore server echoes
    const body = JSON.stringify(identityPayload(slug, templateId, vcard, { accent, mode, cover, lang }));
    if (body === lastSavedRef.current) return; // nothing actually changed
    setAutoSaveStatus('Saving...');
    const handle = setTimeout(async () => {
      try {
        const updated = await authFetch<CardType>(`/cards/${id}`, { method: 'PATCH', body });
        lastSavedRef.current = body;
        setCard((prev) => (prev ? { ...prev, ...updated } : updated));
        setAutoSaveStatus('Saved');
      } catch (e) {
        setError((e as Error).message);
        setAutoSaveStatus('Offline');
      }
    }, 700);
    return () => clearTimeout(handle);
  }, [slug, templateId, vcard, accent, mode, cover, lang, id]);

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
    setHistoryIndex(index);
    historyIndexRef.current = index;
    const { c, sections: s, actions: a } = JSON.parse(history[index]);
    applyCard({ ...c, sections: s ?? c.sections, actions: a ?? c.actions });
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
    const body = JSON.stringify(identityPayload(slug, templateId, vcard, { accent, mode, cover, lang }));
    if (body === lastSavedRef.current) return;
    await authFetch(`/cards/${id}`, { method: 'PATCH', body });
    lastSavedRef.current = body;
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
      pushHistory(JSON.stringify({ c, sections: c.sections, actions: c.actions }));
      setAutoSaveStatus('Saved');
      return c;
    } catch (e) {
      setError((e as Error).message);
      setAutoSaveStatus('Offline');
      throw e;
    }
  };

  // Manual "Save now" — flushes the current identity/theme immediately.
  const saveSettings = async () => {
    setError('');
    setAutoSaveStatus('Saving...');
    try {
      await flushIdentity();
      setCard((prev) => (prev ? { ...prev, slug, templateId, vcardData: vcard, theme: { accent, mode, cover, lang } } : prev));
      setAutoSaveStatus('Saved');
    } catch (e) {
      setError((e as Error).message);
      setAutoSaveStatus('Offline');
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
          body: JSON.stringify({ templateId: t.id, theme: { accent: t.accent, mode: t.mode, cover: cov } }),
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
  const profileScore = useMemo(() => {
    let score = 20; // base profile creation
    if (vcard.fullName) score += 15;
    if (vcard.org) score += 10;
    if (vcard.phone) score += 15;
    if (vcard.email) score += 15;
    if (sections.length > 0) score += 15;
    if (actions.length > 0) score += 10;
    return Math.min(100, score);
  }, [vcard, sections, actions]);

  const missingRecommendations = useMemo(() => {
    const recs: string[] = [];
    if (!vcard.fullName) recs.push('fullName');
    if (!vcard.phone) recs.push('phone');
    if (!vcard.email) recs.push('email');
    if (sections.length === 0) recs.push('sections');
    if (actions.length === 0) recs.push('actions');
    return recs;
  }, [vcard, sections, actions]);

  // Command search matching elements
  const searchMatch = (label: string) => {
    if (!searchQuery) return true;
    return label.toLowerCase().includes(searchQuery.toLowerCase());
  };

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
      flat.push(...favItems.map((p) => ({ ...p, category: '⭐ Favorites' })));
      const recentItems = ALL_PLATFORMS.filter((p) => recentlyUsed.includes(p.key) && !favorites.includes(p.key));
      flat.push(...recentItems.map((p) => ({ ...p, category: 'Recently Used' })));
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

  if (!card) {
    return (
      <AppShell title={t('shell.loadingTitle')}>
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
          <span className="v-loader text-accent">
            <Icon name="loader" size={24} className="animate-spin" />
          </span>
          <p className="text-sm font-semibold text-muted">{error || t('shell.loading')}</p>
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

  return (
    <AppShell title={t('shell.title')} fluid={true}>
      {/* 🚀 Top Command Bar */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-surface/80 border border-line rounded-2xl p-4 shadow-sm backdrop-blur-md sticky top-[68px] z-30">
        <div className="flex items-center gap-3">
          <Link
            href="/cards"
            className="v-btn v-btn-ghost !h-11 sm:!h-9 text-xs font-bold px-3 hover:bg-canvas/50 active:scale-95 transition-all rounded-lg"
          >
            <span aria-hidden>←</span> {t('commandBar.backToCards')}
          </Link>
          <div className="h-6 w-px bg-line" />
          <div className="min-w-0 space-y-0.5">
            {/* The slug broke over three lines on a phone; keep it on one and
                let it truncate, with the label hidden where space is tight. */}
            <h2 className="flex min-w-0 items-center gap-1.5 text-sm font-extrabold tracking-tight text-ink">
              <span className="hidden sm:inline">{t('commandBar.cardLabel')}</span>
              <span dir="ltr" className="truncate font-mono font-bold text-accent">/c/{card.slug}</span>
            </h2>
            <p className="text-[10px] text-muted font-bold uppercase tracking-wider flex items-center gap-2">
              {t('commandBar.statusLabel')}
              <Badge variant={card.isPublished ? 'success' : 'neutral'} className="!text-[9px] font-black uppercase">
                {card.isPublished ? t('status.live') : t('status.draft')}
              </Badge>
              · {t('commandBar.autoSave')}{' '}
              <span className={autoSaveStatus === 'Saved' ? 'text-emerald-500 font-bold' : 'text-amber-500 font-bold'}>
                {autoSaveStatus === 'Saved'
                  ? t('status.saved')
                  : autoSaveStatus === 'Saving...'
                    ? t('status.saving')
                    : t('status.offline')}
              </span>
            </p>
          </div>
        </div>

        {/* Builder Search bar & Undo / Redo */}
        <div className="flex items-center gap-3 justify-end">
          <div className="relative flex items-center hidden sm:flex">
            <span className="absolute left-3 text-faint">
              <Icon name="search" size={13} />
            </span>
            <input
              className="v-field !h-9 !pl-8 text-xs w-44 font-semibold bg-canvas/30"
              placeholder={t('commandBar.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="flex border border-line rounded-xl bg-canvas/40 p-0.5 shadow-inner">
            <button
              onClick={handleUndo}
              disabled={historyIndex <= 0}
              className="h-11 w-11 sm:h-8 sm:w-8 flex items-center justify-center text-muted hover:text-ink disabled:opacity-20 active:scale-90 transition-all font-bold"
              title={t('commandBar.undo')}
            >
              ↶
            </button>
            <div className="w-[1px] bg-line" />
            <button
              onClick={handleRedo}
              disabled={historyIndex >= history.length - 1}
              className="h-11 w-11 sm:h-8 sm:w-8 flex items-center justify-center text-muted hover:text-ink disabled:opacity-20 active:scale-90 transition-all font-bold"
              title={t('commandBar.redo')}
            >
              ↷
            </button>
          </div>

          <div className="flex gap-2">
            <a
              href={`/c/${card.slug}`}
              target="_blank"
              className="v-btn v-btn-ghost !h-11 sm:!h-9 text-xs font-bold px-3 rounded-lg hover:shadow-sm active:scale-95 transition-all"
            >
              {t('commandBar.viewProfile')}
            </a>
            <Button
              onClick={() =>
                run(() =>
                  authFetch(`/cards/${id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ isPublished: !card.isPublished }),
                  }),
                )
              }
              className="!h-11 sm:!h-9 text-xs font-bold px-3 rounded-lg hover:shadow-md active:scale-95 transition-all"
            >
              {card.isPublished ? t('commandBar.unpublish') : t('commandBar.publish')}
            </Button>
          </div>
        </div>
      </div>

      {error && (
        <Alert variant="error" title={t('shell.errorTitle')} className="mb-6 rounded-2xl">
          {error}
        </Alert>
      )}

      {/* Workspace Grid Structure */}
      <div className="grid gap-6 lg:grid-cols-[250px_1fr_360px]">
        {/* 1. LEFT PANEL — Structure & Navigation.
            Stacked on a phone this column came first and filled the whole
            screen, so the editor was a scroll away. Below lg it collapses to a
            horizontal tab strip and the panel chrome disappears. */}
        {/* min-w-0 all the way down, or the scrollable tab strip stretches its
            flex ancestors instead of scrolling and the page overflows. */}
        <div className="min-w-0 lg:h-[calc(100vh-180px)] lg:sticky lg:top-[156px] flex flex-col justify-between">
          <Card
            variant="standard"
            className="min-w-0 bg-surface flex flex-col gap-5 h-full overflow-y-auto no-scrollbar !border-0 !bg-transparent !p-0 !shadow-none lg:!border lg:!bg-surface lg:!p-4 lg:!shadow-sm"
          >
            <div className="min-w-0 space-y-4">
              <h3 className="hidden lg:flex text-[11px] font-bold text-ink uppercase tracking-wider border-b border-line pb-2 items-center gap-1.5">
                <Icon name="settings" size={13} /> {t('tabs.heading')}
              </h3>

              {/* Navigation Tabs */}
              <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 no-scrollbar lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:border-b lg:border-line lg:px-0 lg:pb-4">
                <TabButton
                  active={activeTab === 'content'}
                  onClick={() => setActiveTab('content')}
                  label={t('tabs.content')}
                  icon="grid"
                />
                <TabButton
                  active={activeTab === 'design'}
                  onClick={() => setActiveTab('design')}
                  label={t('tabs.design')}
                  icon="palette"
                />
                <TabButton
                  active={activeTab === 'templates'}
                  onClick={() => setActiveTab('templates')}
                  label={t('tabs.templates')}
                  icon="layers"
                />
                <TabButton
                  active={activeTab === 'profiles'}
                  onClick={() => setActiveTab('profiles')}
                  label={t('tabs.profiles')}
                  icon="user"
                />
                <TabButton
                  active={activeTab === 'nfc'}
                  onClick={() => setActiveTab('nfc')}
                  label={t('tabs.nfc')}
                  icon="tag"
                />
                <TabButton
                  active={activeTab === 'settings'}
                  onClick={() => setActiveTab('settings')}
                  label={t('tabs.settings')}
                  icon="settings"
                />
              </div>

              {/* Scroll-to shortcuts: sidebar chrome that would only push the
                  editor further down a phone screen. */}
              {activeTab === 'content' && (
                <div className="hidden lg:block space-y-2">
                  <p className="text-[10px] font-black uppercase text-faint tracking-wider px-2">{t('quickNav.title')}</p>
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={() => document.getElementById('studio-profile')?.scrollIntoView({ behavior: 'smooth' })}
                      className="w-full text-left px-3 py-1.5 rounded-xl text-[12px] font-bold text-muted hover:text-ink hover:bg-canvas/50 transition-all flex items-center gap-2"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                      {t('quickNav.profile')}
                    </button>
                    <button
                      onClick={() => document.getElementById('studio-links')?.scrollIntoView({ behavior: 'smooth' })}
                      className="w-full text-left px-3 py-1.5 rounded-xl text-[12px] font-bold text-muted hover:text-ink hover:bg-canvas/50 transition-all flex items-center gap-2"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      {t('quickNav.links')}
                    </button>
                    <button
                      onClick={() => document.getElementById('studio-sections')?.scrollIntoView({ behavior: 'smooth' })}
                      className="w-full text-left px-3 py-1.5 rounded-xl text-[12px] font-bold text-muted hover:text-ink hover:bg-canvas/50 transition-all flex items-center gap-2"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                      {t('quickNav.sections')}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="hidden lg:block pt-3 border-t border-line text-[9.5px] text-faint uppercase font-bold text-center">
              {t('shell.version')}
            </div>
          </Card>
        </div>

        {/* 2. CENTER PANEL — Smart Content Editor Workspace */}
        <div className="h-[calc(100vh-180px)] overflow-y-auto no-scrollbar pb-12 scroll-mt-24 scroll-smooth">
          {/* CONTENT TAB: Unified Scrolling Flow */}
          {activeTab === 'content' && (
            <div className="space-y-6 pb-12">
              {/* Profile Details Block */}
              <div id="studio-profile" className="bg-surface border border-line rounded-2xl p-6 shadow-sm space-y-6 scroll-mt-24">
                <div className="border-b border-line pb-3.5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="v-icon-tile"><Icon name="user" size={16} /></span>
                    <div>
                      <h3 className="text-[14px] font-extrabold text-ink tracking-tight">{t('profile.title')}</h3>
                      <p className="text-xs text-muted">{t('profile.subtitle')}</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {searchMatch('Full Name') && (
                      <div className="space-y-1.5">
                        <label className="text-[11.5px] font-bold text-muted uppercase tracking-wider">{t('profile.fullName')}</label>
                        <input
                          className="v-field font-semibold"
                          value={vcard.fullName ?? ''}
                          onChange={(e) => setVcard({ ...vcard, fullName: e.target.value })}
                          placeholder={t('profile.fullNamePlaceholder')}
                        />
                      </div>
                    )}
                    {searchMatch('Job Title') && (
                      <div className="space-y-1.5">
                        <label className="text-[11.5px] font-bold text-muted uppercase tracking-wider">{t('profile.jobTitle')}</label>
                        <input
                          className="v-field font-medium"
                          value={vcard.org ?? ''}
                          onChange={(e) => setVcard({ ...vcard, org: e.target.value })}
                          placeholder={t('profile.jobTitlePlaceholder')}
                        />
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {searchMatch('Phone') && (
                      <div className="space-y-1.5">
                        <label className="text-[11.5px] font-bold text-muted uppercase tracking-wider">{t('profile.phone')}</label>
                        <input
                          className="v-field font-medium font-mono"
                          value={vcard.phone ?? ''}
                          onChange={(e) => setVcard({ ...vcard, phone: e.target.value })}
                          placeholder={t('profile.phonePlaceholder')}
                        />
                      </div>
                    )}
                    {searchMatch('Email') && (
                      <div className="space-y-1.5">
                        <label className="text-[11.5px] font-bold text-muted uppercase tracking-wider">{t('profile.email')}</label>
                        <input
                          className="v-field font-medium"
                          value={vcard.email ?? ''}
                          onChange={(e) => setVcard({ ...vcard, email: e.target.value })}
                          placeholder={t('profile.emailPlaceholder')}
                        />
                      </div>
                    )}
                  </div>

                  {/* Profile Images upload box */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2 border-t border-line/60">
                    {searchMatch('Profile Photo') && (
                      <div className="p-4 rounded-xl border border-line bg-canvas/30">
                        <ImageUpload
                          label={t('profile.avatarLabel')}
                          shape="circle"
                          value={vcard.avatar ?? ''}
                          onChange={(url) => setVcard({ ...vcard, avatar: url })}
                        />
                      </div>
                    )}
                    {searchMatch('Cover Image') && (
                      <div className="p-4 rounded-xl border border-line bg-canvas/30">
                        <ImageUpload
                          label={t('profile.coverLabel')}
                          shape="wide"
                          value={vcard.coverImage ?? ''}
                          onChange={(url) => setVcard({ ...vcard, coverImage: url })}
                        />
                      </div>
                    )}
                  </div>

                  <div className="pt-2 flex justify-end">
                    <Button onClick={saveSettings} variant="primary" className="font-bold text-xs hover:shadow-md px-6">
                      {t('profile.save')}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Direct Tap Actions Block */}
              <div id="studio-links" className="bg-surface border border-line rounded-2xl p-6 shadow-sm space-y-6 scroll-mt-24">
                <div className="border-b border-line pb-3.5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-emerald-500/10 text-emerald-500"><Icon name="link" size={16} /></span>
                    <div>
                      <h3 className="text-[14px] font-extrabold text-ink tracking-tight">{t('links.title')}</h3>
                      <p className="text-xs text-muted">{t('links.subtitle')}</p>
                    </div>
                  </div>

                  {/* Modern Notion-style Add Link trigger */}
                  <button
                    onClick={() => {
                      setPlatformSearch('');
                      setIsModalOpen(true);
                    }}
                    className="v-btn v-btn-primary !h-11 sm:!h-9 text-xs font-bold px-4 rounded-xl flex items-center gap-1.5 shadow-sm hover:shadow-md active:scale-95 transition-all"
                  >
                    <Icon name="plus" size={14} /> {t('links.addShort')}
                  </button>
                </div>

                {actions.length === 0 ? (
                  /* Onboarding Empty State Experience */
                  <div className="flex flex-col items-center justify-center py-10 px-6 text-center bg-canvas/10 border-2 border-dashed border-line/60 rounded-3xl space-y-5">
                    <div className="flex items-center justify-center h-14 w-14 rounded-2xl bg-accent/5 border border-accent/15 text-accent shadow-inner animate-pulse">
                      <Icon name="link" size={24} />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-black text-ink uppercase tracking-wider">{t('links.emptyTitle')}</h4>
                      <p className="text-xs text-muted max-w-sm">{t('links.emptyDesc')}</p>
                    </div>
                    
                    {/* Suggested Shortcuts */}
                    <div className="space-y-2.5 w-full max-w-md pt-3.5 border-t border-line/40">
                      <p className="text-[10px] font-black uppercase text-faint tracking-wider">{t('platformPicker.suggested')}</p>
                      <div className="flex flex-wrap justify-center gap-2">
                        {[
                          { emoji: '📞', key: 'phone', type: 'CALL' },
                          { emoji: '✉', key: 'email', type: 'EMAIL' },
                          { emoji: '💬', key: 'whatsapp', type: 'WHATSAPP' },
                          { emoji: '🌍', key: 'website', type: 'WEBSITE' },
                          { emoji: '💼', key: 'linkedin', type: 'LINKEDIN' }
                        ].map((item) => (
                          <button
                            key={item.type}
                            onClick={() => addAction(item.type)}
                            className="px-3.5 py-3 sm:py-1.5 rounded-xl border border-line bg-surface hover:border-line-strong hover:bg-elevated active:scale-95 transition-all text-xs font-bold text-ink shadow-sm"
                          >
                            {item.emoji} {t(`links.shortcuts.${item.key}`)}
                          </button>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        setPlatformSearch('');
                        setIsModalOpen(true);
                      }}
                      className="v-btn v-btn-primary !h-11 sm:!h-10 text-xs font-bold px-6 rounded-xl flex items-center gap-2 shadow-md hover:shadow-lg active:scale-95 transition-all"
                    >
                      <Icon name="plus" size={14} /> {t('links.addFirst')}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Both placements render the same ActionCard; the group only
                        says where the action shows up on the public card. */}
                    {([
                      { key: 'quick', inGroup: (a: CardAction) => isQuickAction(a) },
                      { key: 'grid',  inGroup: (a: CardAction) => !isQuickAction(a) },
                    ] as const).map(({ key, inGroup }) => {
                      const list = actions.filter(inGroup);
                      return (
                        <div key={key} className="space-y-3">
                          <div className="flex items-baseline justify-between gap-3 border-b border-line/40 pb-2">
                            <h4 className="text-[12px] font-bold text-ink">{t(`links.group.${key}`)}</h4>
                            <span className="text-[10px] text-muted font-medium">{t(`links.group.${key}Hint`)}</span>
                          </div>

                          {list.length > 0 ? (
                            <div className="space-y-3">
                              {list.map((a) => (
                                <ActionCard
                                  key={a.id}
                                  action={a}
                                  details={getActionBrandDetails(a)}
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
                                  onDelete={() =>
                                    run(() => authFetch(`/cards/${id}/actions/${a.id}`, { method: 'DELETE' }))
                                  }
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
                            <p className="text-[11px] text-muted text-center py-3 bg-canvas/10 rounded-xl border border-dashed border-line/60">
                              {t(`links.group.${key}Empty`)}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Payment Links Block — external link-sharing only */}
              <PaymentLinksManager cardId={id} onChange={setPaymentLinks} />

              {/* Content Sections Block */}
              <div id="studio-sections" className="bg-surface border border-line rounded-2xl p-6 shadow-sm space-y-6 scroll-mt-24">
                <div className="border-b border-line pb-3.5 flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-rose-500/10 text-rose-500"><Icon name="layers" size={16} /></span>
                  <div>
                    <h3 className="text-[14px] font-extrabold text-ink tracking-tight">{t('sections.title')}</h3>
                    <p className="text-xs text-muted">{t('sections.subtitle')}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  {sections.map((s, i) => {
                    const details = SECTION_DETAILS[s.type];
                    return (
                      <div
                        key={s.id}
                        className="p-5 rounded-2xl border border-line bg-canvas/20 space-y-4 hover:border-line-strong transition-all relative group"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <span
                              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-sm"
                              style={{ background: details?.color ?? '#2563eb' }}
                            >
                              <Icon name={details?.icon ?? 'layers'} size={18} />
                            </span>
                            <div>
                              <h4 className="font-extrabold text-sm text-ink">
                                {details ? t(`sections.types.${s.type}.label`) : s.type}
                              </h4>
                              <p className="text-[11px] text-muted">
                                {details ? t(`sections.types.${s.type}.desc`) : ''}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {/* Toggle visibility */}
                            <button
                              onClick={() =>
                                run(() =>
                                  authFetch(`/cards/${id}/sections/${s.id}`, {
                                    method: 'PATCH',
                                    body: JSON.stringify({ isVisible: !s.isVisible }),
                                  }),
                                )
                              }
                              className={`h-8 w-8 rounded-lg flex items-center justify-center border border-line transition-all active:scale-95 ${
                                s.isVisible
                                  ? 'bg-accent/10 border-accent/25 text-accent shadow-sm'
                                  : 'bg-surface hover:bg-elevated text-muted'
                              }`}
                              title={t('links.toggleVisibility')}
                            >
                              <Icon name={s.isVisible ? 'eye' : 'eye-off'} size={14} />
                            </button>

                            {/* Reorder sections controls */}
                            <button
                              onClick={() => move(sections, i, -1, 'sections')}
                              className="h-8 w-8 rounded-lg flex items-center justify-center border border-line bg-surface hover:bg-elevated text-muted hover:text-ink active:scale-95 transition-all text-xs font-bold"
                              title={t('links.moveUp')}
                            >
                              ↑
                            </button>
                            <button
                              onClick={() => move(sections, i, 1, 'sections')}
                              className="h-8 w-8 rounded-lg flex items-center justify-center border border-line bg-surface hover:bg-elevated text-muted hover:text-ink active:scale-95 transition-all text-xs font-bold"
                              title={t('links.moveDown')}
                            >
                              ↓
                            </button>

                            {/* Delete custom section block */}
                            <button
                              onClick={() =>
                                run(() => authFetch(`/cards/${id}/sections/${s.id}`, { method: 'DELETE' }))
                              }
                              className="h-8 w-8 rounded-lg flex items-center justify-center bg-red-500/5 hover:bg-red-500/10 active:scale-95 transition-all text-red-600 border border-red-500/10"
                              title={t('sections.deleteBlock')}
                            >
                              <Icon name="trash" size={14} />
                            </button>
                          </div>
                        </div>

                        {/* Custom fields form editor */}
                        <div className="grid gap-3.5 pt-3.5 border-t border-line/60">
                          {s.type === 'BIO' ? (
                            <>
                              <p className="rounded-xl border border-line/60 bg-canvas/30 p-3 text-[11.5px] leading-relaxed text-muted font-medium">
                                {t('sections.bioHelpBefore')}
                                <strong>{t('sections.bioLabel')}</strong>
                                {t('sections.bioHelpAfter')}
                              </p>
                              <div className="space-y-1.5">
                                <label className="text-[11px] font-bold text-muted uppercase">{t('sections.bioTitle')}</label>
                                <textarea
                                  className="v-field h-24 py-2 font-medium text-xs leading-relaxed"
                                  defaultValue={s.content.body as string ?? ''}
                                  onBlur={(e) => {
                                    s.content.body = e.target.value;
                                    run(() =>
                                      authFetch(`/cards/${id}/sections/${s.id}`, {
                                        method: 'PATCH',
                                        body: JSON.stringify({ content: s.content }),
                                      }),
                                    );
                                  }}
                                  placeholder={t('sections.bioPlaceholder')}
                                />
                              </div>
                            </>
                          ) : s.type === 'VIDEO' ? (
                            <>
                              <p className="rounded-xl border border-line/60 bg-canvas/30 p-3 text-[11.5px] leading-relaxed text-muted font-medium">
                                Paste a <strong>YouTube</strong> or <strong>Vimeo</strong> video URL. The video will be embedded directly on your public card profile.
                              </p>
                              <div className="space-y-1.5">
                                <label className="text-[11px] font-bold text-muted uppercase">{t('sections.videoUrl')}</label>
                                <input
                                  className="v-field font-mono text-xs"
                                  defaultValue={s.content.videoUrl as string ?? ''}
                                  onBlur={(e) => {
                                    s.content.videoUrl = e.target.value;
                                    run(() =>
                                      authFetch(`/cards/${id}/sections/${s.id}`, {
                                        method: 'PATCH',
                                        body: JSON.stringify({ content: s.content }),
                                      }),
                                    );
                                  }}
                                  placeholder={t('sections.videoPlaceholder')}
                                />
                              </div>
                              <div className="space-y-1.5">
                                <label className="text-[11px] font-bold text-muted uppercase">{t('sections.sectionTitle')} <span className="font-normal text-faint">(optional)</span></label>
                                <input
                                  className="v-field text-xs"
                                  defaultValue={s.content.title as string ?? ''}
                                  onBlur={(e) => {
                                    s.content.title = e.target.value;
                                    run(() =>
                                      authFetch(`/cards/${id}/sections/${s.id}`, {
                                        method: 'PATCH',
                                        body: JSON.stringify({ content: s.content }),
                                      }),
                                    );
                                  }}
                                  placeholder={t('sections.videoTitlePlaceholder')}
                                />
                              </div>
                              {/* Video preview */}
                              {(s.content.videoUrl as string) && (() => {
                                const raw = s.content.videoUrl as string;
                                const ytMatch = raw.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
                                const vimeoMatch = raw.match(/vimeo\.com\/(\d+)/);
                                const embedUrl = ytMatch ? `https://www.youtube.com/embed/${ytMatch[1]}` : vimeoMatch ? `https://player.vimeo.com/video/${vimeoMatch[1]}` : null;
                                return embedUrl ? (
                                  <div className="rounded-xl overflow-hidden border border-line aspect-video">
                                    <iframe src={embedUrl} className="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                                  </div>
                                ) : (
                                  <p className="text-[11px] text-amber-600 font-medium">⚠ Could not detect a valid YouTube or Vimeo URL. Please check the link.</p>
                                );
                              })()}
                            </>
                          ) : s.type === 'PORTFOLIO' ? (
                            <>
                              <p className="rounded-xl border border-line/60 bg-canvas/30 p-3 text-[11.5px] leading-relaxed text-muted font-medium">
                                {t('sections.galleryHelpBefore')}
                                <strong>{t('sections.photoGallery')}</strong>
                                {t('sections.galleryHelpAfter')}
                              </p>
                              <div className="space-y-1.5">
                                <label className="text-[11px] font-bold text-muted uppercase">{t('sections.galleryTitle')} <span className="font-normal text-faint">(optional)</span></label>
                                <input
                                  className="v-field text-xs"
                                  defaultValue={s.content.title as string ?? ''}
                                  onBlur={(e) => {
                                    s.content.title = e.target.value;
                                    run(() =>
                                      authFetch(`/cards/${id}/sections/${s.id}`, {
                                        method: 'PATCH',
                                        body: JSON.stringify({ content: s.content }),
                                      }),
                                    );
                                  }}
                                  placeholder={t('sections.galleryTitlePlaceholder')}
                                />
                              </div>
                              {/* Image gallery manager */}
                              <div className="space-y-3">
                                <label className="text-[11px] font-bold text-muted uppercase">{t('sections.galleryImages')}</label>
                                <div className="grid grid-cols-3 gap-2">
                                  {(Array.isArray(s.content.images) ? (s.content.images as string[]) : []).map((imgUrl, imgIdx) => (
                                    <div key={imgIdx} className="relative group rounded-lg overflow-hidden border border-line aspect-square">
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={imgUrl} alt="" className="w-full h-full object-cover" />
                                      <button
                                        onClick={() => {
                                          const images = [...(s.content.images as string[])];
                                          images.splice(imgIdx, 1);
                                          s.content.images = images;
                                          run(() =>
                                            authFetch(`/cards/${id}/sections/${s.id}`, {
                                              method: 'PATCH',
                                              body: JSON.stringify({ content: s.content }),
                                            }),
                                          );
                                        }}
                                        className="absolute top-1 end-1 h-6 w-6 rounded-full bg-red-500/90 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
                                      >
                                        <Icon name="x" size={12} />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                                <ImageUpload
                                  value=""
                                  shape="wide"
                                  label={t('sections.addGalleryImage')}
                                  onChange={(url) => {
                                    if (!url) return;
                                    const images = Array.isArray(s.content.images) ? [...(s.content.images as string[])] : [];
                                    images.push(url);
                                    s.content.images = images;
                                    run(() =>
                                      authFetch(`/cards/${id}/sections/${s.id}`, {
                                        method: 'PATCH',
                                        body: JSON.stringify({ content: s.content }),
                                      }),
                                    );
                                  }}
                                />
                              </div>
                            </>
                          ) : s.type === 'BOOKING' ? (
                            <>
                              <p className="rounded-xl border border-line/60 bg-canvas/30 p-3 text-[11.5px] leading-relaxed text-muted font-medium">
                                Connect your <strong>Calendly</strong>, <strong>Cal.com</strong>, or any booking page. An embedded widget or link button will appear on your profile.
                              </p>
                              <div className="space-y-1.5">
                                <label className="text-[11px] font-bold text-muted uppercase">{t('links.bookingUrl')}</label>
                                <input
                                  className="v-field font-mono text-xs"
                                  defaultValue={s.content.bookingUrl as string ?? ''}
                                  onBlur={(e) => {
                                    s.content.bookingUrl = e.target.value;
                                    run(() =>
                                      authFetch(`/cards/${id}/sections/${s.id}`, {
                                        method: 'PATCH',
                                        body: JSON.stringify({ content: s.content }),
                                      }),
                                    );
                                  }}
                                  placeholder={t('links.bookingPlaceholder')}
                                />
                              </div>
                              <div className="space-y-1.5">
                                <label className="text-[11px] font-bold text-muted uppercase">{t('links.buttonLabel')} <span className="font-normal text-faint">(optional)</span></label>
                                <input
                                  className="v-field text-xs"
                                  defaultValue={s.content.buttonLabel as string ?? ''}
                                  onBlur={(e) => {
                                    s.content.buttonLabel = e.target.value;
                                    run(() =>
                                      authFetch(`/cards/${id}/sections/${s.id}`, {
                                        method: 'PATCH',
                                        body: JSON.stringify({ content: s.content }),
                                      }),
                                    );
                                  }}
                                  placeholder={t('sections.bookingPlaceholder')}
                                />
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                  <label className="text-[11px] font-bold text-muted uppercase">{t('sections.sectionHeading')}</label>
                                  <input
                                    className="v-field font-semibold text-xs"
                                    defaultValue={s.content.title as string ?? ''}
                                    onBlur={(e) => {
                                      s.content.title = e.target.value;
                                      run(() =>
                                        authFetch(`/cards/${id}/sections/${s.id}`, {
                                          method: 'PATCH',
                                          body: JSON.stringify({ content: s.content }),
                                        }),
                                      );
                                    }}
                                    placeholder={t('sections.servicesPlaceholder')}
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <label className="text-[11px] font-bold text-muted uppercase">{t('sections.subtitleField')}</label>
                                  <input
                                    className="v-field font-medium text-xs"
                                    defaultValue={s.content.subtitle as string ?? ''}
                                    onBlur={(e) => {
                                      s.content.subtitle = e.target.value;
                                      run(() =>
                                        authFetch(`/cards/${id}/sections/${s.id}`, {
                                          method: 'PATCH',
                                          body: JSON.stringify({ content: s.content }),
                                        }),
                                      );
                                    }}
                                    placeholder={t('sections.offerPlaceholder')}
                                  />
                                </div>
                              </div>
                              <div className="space-y-1.5">
                                <label className="text-[11px] font-bold text-muted uppercase">{t('sections.bodyContent')}</label>
                                <textarea
                                  className="v-field h-20 py-2 font-medium text-xs leading-relaxed"
                                  defaultValue={s.content.body as string ?? ''}
                                  onBlur={(e) => {
                                    s.content.body = e.target.value;
                                    run(() =>
                                      authFetch(`/cards/${id}/sections/${s.id}`, {
                                        method: 'PATCH',
                                        body: JSON.stringify({ content: s.content }),
                                      }),
                                    );
                                  }}
                                  placeholder={t('sections.bodyPlaceholder')}
                                />
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {sections.length === 0 && (
                    <p className="text-xs text-muted text-center py-4 bg-canvas/30 rounded-xl border border-dashed border-line">
                      No custom page block segments added yet. Click one below to add.
                    </p>
                  )}

                  {/* Add content section block visual grid selection */}
                  <div className="space-y-3 pt-5 border-t border-line">
                    <h4 className="text-[11px] font-bold text-muted uppercase tracking-wider">{t('sections.available')}</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                      {Object.entries(SECTION_DETAILS).map(([type, details]) => {
                        return (
                          <button
                            key={type}
                            onClick={() => addSection(type)}
                            className="flex flex-col items-center justify-center p-3 rounded-xl border border-line bg-canvas/30 hover:border-line-strong hover:bg-canvas/50 active:scale-95 transition-all text-center gap-2 group"
                          >
                            <span
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-white shadow-sm transition-transform group-hover:scale-105"
                              style={{ background: details.color }}
                            >
                              <Icon name={details.icon} size={15} />
                            </span>
                            <span className="text-[11.5px] font-bold text-ink truncate w-full">{t(`sections.types.${type}.label`)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* DESIGN TAB: Visual Customizers */}
          {activeTab === 'design' && (
            <div className="bg-surface border border-line rounded-2xl p-6 shadow-sm space-y-6">
              <div className="border-b border-line pb-3.5">
                <h3 className="text-sm font-bold text-ink uppercase tracking-wider flex items-center gap-2">
                  <Icon name="palette" size={15} className="text-accent" /> Card Appearance & Styling
                </h3>
                <p className="text-xs text-muted">{t('design.subtitle')}</p>
              </div>

              <div className="space-y-6">
                {/* Accent swatch color palette */}
                <div className="space-y-2">
                  <p className="text-[11px] font-bold text-muted uppercase tracking-wider">{t('design.accent')}</p>
                  <div className="flex flex-wrap gap-3.5 p-4 rounded-xl border border-line bg-canvas/30 justify-start">
                    {SWATCHES.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => {
                          setAccent(c);
                          run(() =>
                            authFetch(`/cards/${id}`, {
                              method: 'PATCH',
                              body: JSON.stringify({ theme: { accent: c, mode, cover } }),
                            }),
                          );
                        }}
                        className="h-8 w-8 rounded-full border-2 transition-all hover:scale-110 active:scale-95 shadow-sm"
                        style={{
                          background: c,
                          borderColor: accent.toLowerCase() === c.toLowerCase() ? 'hsl(var(--v-fg))' : 'transparent',
                          boxShadow: accent.toLowerCase() === c.toLowerCase() ? '0 0 0 2px var(--v-accent)' : 'none',
                        }}
                      />
                    ))}
                  </div>
                </div>

                {/* Display Theme mode: Visual choice cards */}
                <div className="space-y-2.5">
                  <p className="text-[11px] font-bold text-muted uppercase tracking-wider">{t('design.themeMode')}</p>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => {
                        setMode('light');
                        run(() =>
                          authFetch(`/cards/${id}`, {
                            method: 'PATCH',
                            body: JSON.stringify({ theme: { accent, mode: 'light', cover } }),
                          }),
                        );
                      }}
                      className={`p-4 rounded-xl border text-center transition-all flex flex-col items-center gap-3 bg-white text-slate-900 ${
                        mode === 'light' ? 'ring-2 ring-accent border-accent' : 'border-line hover:border-line-strong'
                      }`}
                    >
                      <div className="w-full h-14 rounded bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-400 border border-slate-200/80">
                        {t('design.lightPreview')}
                      </div>
                      <span className="text-[11.5px] font-extrabold text-slate-800">{t('design.lightMode')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMode('dark');
                        run(() =>
                          authFetch(`/cards/${id}`, {
                            method: 'PATCH',
                            body: JSON.stringify({ theme: { accent, mode: 'dark', cover } }),
                          }),
                        );
                      }}
                      className={`p-4 rounded-xl border text-center transition-all flex flex-col items-center gap-3 bg-slate-950 text-slate-100 ${
                        mode === 'dark' ? 'ring-2 ring-accent border-accent' : 'border-line hover:border-line-strong'
                      }`}
                    >
                      <div className="w-full h-14 rounded bg-slate-900 flex items-center justify-center text-[10px] font-bold text-slate-600 border border-slate-800">
                        {t('design.darkPreview')}
                      </div>
                      <span className="text-[11.5px] font-extrabold text-slate-200">{t('design.darkMode')}</span>
                    </button>
                  </div>
                </div>

                {/* Background cover style visual cards selection */}
                <div className="space-y-2.5">
                  <p className="text-[11px] font-bold text-muted uppercase tracking-wider">{t('design.cover')}</p>
                  <div className="grid grid-cols-3 gap-3">
                    {([
                      ['solid', 'Solid Color', 'bg-slate-300 dark:bg-slate-700'],
                      ['gradient', 'Gradients', 'bg-gradient-to-br from-blue-500 to-blue-700'],
                      [
                        'constellation',
                        'Space Theme',
                        'bg-[#09090b] border border-blue-600/10 shadow-[inset_0_0_12px_rgba(37, 99, 235,0.25)]',
                      ],
                    ] as const).map(([type, label, bgClass]) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => {
                          setCover(type);
                          run(() =>
                            authFetch(`/cards/${id}`, {
                              method: 'PATCH',
                              body: JSON.stringify({ theme: { accent, mode, cover: type, lang } }),
                            }),
                          );
                        }}
                        className={`p-3 rounded-xl border text-center transition-all flex flex-col gap-2 items-center justify-center ${
                          cover === type
                            ? 'ring-2 ring-accent border-accent bg-accent/5'
                            : 'border-line bg-canvas/30 hover:border-line-strong'
                        }`}
                      >
                        <div className={`w-full h-10 rounded-lg ${bgClass} shrink-0`} />
                        <span className="text-[11px] font-extrabold text-ink">{label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Segmented language controller */}
                <div className="space-y-2 border-t border-line/60 pt-4">
                  <p className="text-[11px] font-bold text-muted uppercase tracking-wider">{t('design.cardLanguage')}</p>
                  <div className="flex rounded-xl border border-line bg-canvas/40 p-0.5 max-w-xs shadow-inner">
                    {([
                      ['en', 'English'],
                      ['ar', 'العربية'],
                    ] as const).map(([code, label]) => (
                      <button
                        key={code}
                        type="button"
                        onClick={() => {
                          setLang(code);
                          run(() =>
                            authFetch(`/cards/${id}`, {
                              method: 'PATCH',
                              body: JSON.stringify({ theme: { accent, mode, cover, lang: code } }),
                            }),
                          );
                        }}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all text-center ${
                          lang === code ? 'bg-accent text-accent-fg shadow-sm' : 'text-muted hover:text-ink'
                        }`}
                        style={lang === code ? { backgroundColor: 'var(--v-accent)' } : {}}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TEMPLATES TAB: Select Marketplace layouts */}
          {activeTab === 'templates' && (
            <div className="bg-surface border border-line rounded-2xl p-6 shadow-sm">
              <div className="border-b border-line pb-3.5 mb-5">
                <h3 className="text-sm font-bold text-ink uppercase tracking-wider flex items-center gap-2">
                  <Icon name="layers" size={15} className="text-accent" /> Templates Marketplace
                </h3>
                <p className="text-xs text-muted">Discover, preview, and apply world-class themes — the phone preview updates live.</p>
              </div>
              <TemplateMarketplace currentTemplateId={templateId} onApply={applyTemplate} applyingId={applyingId} />
            </div>
          )}

          {/* PROFILES TAB: one link, multiple targeted profiles */}
          {activeTab === 'profiles' && card && (
            <CardProfiles cardId={id} slug={card.slug} />
          )}

          {/* NFC TAB: Physical tags setup */}
          {activeTab === 'nfc' && (
            <div className="bg-surface border border-line rounded-2xl p-6 shadow-sm space-y-5">
              <div className="border-b border-line pb-3.5">
                <h3 className="text-sm font-bold text-ink uppercase tracking-wider flex items-center gap-2">
                  <Icon name="tag" size={15} className="text-accent" /> {t('nfc.provisioning')}
                </h3>
                <p className="text-xs text-muted">{t('nfc.subtitle')}</p>
              </div>

              {/* Write a blank tag from this phone — Chromium on Android only,
                  and the component says so itself everywhere else. */}
              <NfcProgrammer cardId={id} onProgrammed={() => void load()} />

              <div className="space-y-4">
                <div className="bg-canvas border border-line p-4 rounded-2xl space-y-1.5">
                  <h4 className="text-[12.5px] font-extrabold text-ink">{t('nfc.title')}</h4>
                  <p className="text-xs text-muted leading-relaxed font-medium">
                    When you link a physical product to this digital profile card, tapping it on a mobile device will instantly load this URL.
                  </p>
                </div>

                <div className="divide-y divide-line border border-line rounded-2xl overflow-hidden bg-canvas/30 shadow-inner">
                  {tags.filter((tag) => tag.cardId === id).map((tag) => (
                    <div
                      key={tag.id}
                      className="p-4 flex items-center justify-between gap-3 text-xs font-semibold text-muted bg-surface/50 hover:bg-surface transition-colors"
                    >
                      <div className="space-y-1">
                        <p className="text-ink font-bold font-mono text-[12.5px]" dir="ltr">{t('nfc.uid')}: {tag.uid.slice(0, 16)}...</p>
                        <p className="text-[10px] text-muted uppercase font-bold tracking-wider">
                          {t('nfc.hardware')}: {tag.hardwareType} · {t('nfc.scanCount')}: {tag.activationCount}
                        </p>
                      </div>
                      <Badge variant="success" className="uppercase !text-[9px] font-black tracking-wide">{t('nfc.bound')}</Badge>
                    </div>
                  ))}
                  {tags.filter((tag) => tag.cardId === id).length === 0 && (
                    <p className="p-6 text-xs text-muted font-bold text-center">
                      {t('nfc.empty')}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* CARD SETTINGS TAB: General + Danger Zone Deletion */}
          {activeTab === 'settings' && (
            <div className="space-y-6">
              {/* General URL slug + visibility */}
              <div className="bg-surface border border-line rounded-2xl p-6 shadow-sm space-y-6">
                <div className="border-b border-line pb-3.5">
                  <h3 className="text-sm font-bold text-ink uppercase tracking-wider flex items-center gap-2">
                    <Icon name="settings" size={15} className="text-accent" /> General Settings
                  </h3>
                  <p className="text-xs text-muted">{t('settings.subtitle')}</p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[11.5px] font-bold text-muted uppercase tracking-wider">{t('settings.title')}</label>
                    <div className="relative flex items-center max-w-md">
                      <span className="absolute left-3 text-[13px] text-faint font-semibold font-mono">/c/</span>
                      <input
                        className="v-field !pl-8 font-mono text-[13px] font-semibold"
                        value={slug}
                        onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                      />
                    </div>
                    <p className="text-[10.5px] text-faint font-medium">{t('settings.slugHint')}</p>
                  </div>

                  <div className="space-y-2 border-t border-line/60 pt-4">
                    <label className="text-[11.5px] font-bold text-muted uppercase tracking-wider">{t('settings.visibility')}</label>
                    <div className="flex gap-3 max-w-sm">
                      <Button
                        variant={card.isPublished ? 'success' : 'outline'}
                        onClick={() => run(() => authFetch(`/cards/${id}`, { method: 'PATCH', body: JSON.stringify({ isPublished: true }) }))}
                        className="flex-1 font-bold text-xs !h-9 rounded-lg"
                      >
                        Published (Live)
                      </Button>
                      <Button
                        variant={!card.isPublished ? 'ghost' : 'outline'}
                        onClick={() => run(() => authFetch(`/cards/${id}`, { method: 'PATCH', body: JSON.stringify({ isPublished: false }) }))}
                        className="flex-1 font-bold text-xs !h-9 rounded-lg"
                      >
                        Draft (Private)
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* DANGER ZONE: Double confirmation card deletion */}
              <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-6 shadow-sm space-y-6">
                <div className="border-b border-red-500/10 pb-3.5">
                  <h3 className="text-sm font-bold text-red-600 uppercase tracking-wider flex items-center gap-2">
                    ⚠️ Danger Zone
                  </h3>
                  <p className="text-xs text-red-500/75 font-medium">{t('settings.dangerZone')}</p>
                </div>

                <div className="space-y-4">
                  <p className="text-xs text-muted font-bold leading-relaxed">
                    Deleting this card will permanently destroy all content, direct links, and layout configurations. 
                    Any bound physical NFC products will be unassigned.
                  </p>

                  {!showDeleteConfirm ? (
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs rounded-xl active:scale-95 transition-all shadow-sm"
                    >
                      {t('settings.deleteCard')}
                    </button>
                  ) : (
                    <div className="p-4 rounded-xl border border-red-500/25 bg-red-500/10 space-y-4">
                      <p className="text-xs font-bold text-red-700 leading-relaxed">
                        Confirm deletion: Please type <span className="font-mono text-[13px] bg-red-500/20 px-1.5 py-0.5 rounded font-black">/c/{card.slug}</span> link name to proceed.
                      </p>
                      <div className="flex flex-col sm:flex-row gap-3">
                        <input
                          type="text"
                          value={deleteSlugConfirm}
                          onChange={(e) => setDeleteSlugConfirm(e.target.value)}
                          placeholder={card.slug}
                          className="v-field flex-1 !h-9 text-xs font-mono font-bold"
                        />
                        <div className="flex gap-2 shrink-0">
                          <button
                            onClick={() => {
                              setShowDeleteConfirm(false);
                              setDeleteSlugConfirm('');
                            }}
                            className="px-4 py-1.5 border border-line bg-surface hover:bg-elevated text-xs font-bold rounded-lg text-ink transition-colors"
                          >
                            {t('settings.cancel')}
                          </button>
                          <button
                            onClick={handleDeleteCard}
                            disabled={deleteSlugConfirm !== card.slug}
                            className="px-4 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors"
                          >
                            {t('settings.confirmDelete')}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 3. RIGHT PANEL — Interactive Live Preview Device Simulator */}
        <div className="space-y-6 lg:sticky lg:top-[156px] h-[calc(100vh-180px)] overflow-y-auto no-scrollbar pb-12">
          {/* Multi-Device Interactive Live Preview Simulator */}
          <div className="relative group">
            <LivePreview
              card={
                {
                  ...card,
                  vcardData: vcard,
                  theme: { ...card.theme, accent, mode, cover, lang },
                } as any
              }
              sections={sections}
              actions={actions}
              paymentLinks={paymentLinks}
              slug={card.slug}
              qrUrl={qrUrl}
            />
          </div>

          {/* Share & QR Card */}
          <ShareCard slug={card.slug} />

          {/* Profile Completion Quality Analyzer */}
          <Card variant="standard" className="p-5 bg-surface space-y-4 shadow-sm text-center md:text-start">
            <h3 className="text-xs font-bold text-ink tracking-tight uppercase flex items-center justify-center md:justify-start gap-1.5">
              🎯 {t('quality.assistant')}
            </h3>
            <div className="flex items-center gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent text-sm font-extrabold border-2 border-accent">
                {profileScore}%
              </span>
              <div className="flex-1 space-y-1">
                <div className="flex justify-between text-[10.5px] font-bold text-muted uppercase">
                  <span>{t('quality.title')}</span>
                </div>
                <ProgressBar value={profileScore} />
              </div>
            </div>
            {missingRecommendations.length > 0 && (
              <div className="p-3 bg-amber-500/5 border border-amber-500/10 rounded-xl space-y-1 text-xs text-amber-600 font-semibold text-start">
                <p className="font-bold border-b border-amber-500/15 pb-1">💡 {t('quality.recommendationsTitle')}</p>
                <ul className="list-disc list-inside space-y-0.5 text-[10.5px] font-medium leading-relaxed">
                  {missingRecommendations.map((r) => (
                    <li key={r}>{t(`quality.recommendations.${r}`)}</li>
                  ))}
                </ul>
              </div>
            )}
            {missingRecommendations.length === 0 && (
              <div className="p-3 bg-emerald-500/5 border border-emerald-500/10 rounded-xl text-center text-xs text-emerald-600 font-bold">
                ✓ {t('quality.complete')}
              </div>
            )}
          </Card>
      {/* 🚀 Platform Selector Modal Dialog */}
      <AnimatePresence>
        {isModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsModalOpen(false)}
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center bg-black/60 backdrop-blur-sm"
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              initial={{ scale: 0.95, y: 16, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 16, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 350, damping: 28 }}
              onClick={(e) => e.stopPropagation()}
              className="my-8 w-full max-w-2xl rounded-3xl border border-line bg-surface p-6 shadow-2xl space-y-4"
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-2 border-b border-line">
                <div>
                  <h3 className="text-base font-extrabold text-ink">{t('links.add')}</h3>
                  <p className="text-[11px] text-muted font-medium">{t('platformPicker.hint')}</p>
                </div>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-xl text-muted hover:bg-canvas/50 hover:text-ink active:scale-95 transition-all"
                >
                  <Icon name="x" size={18} />
                </button>
              </div>

              {/* Search Box */}
              <div className="relative flex items-center">
                <span className="absolute left-3 text-faint">
                  <Icon name="search" size={14} />
                </span>
                <input
                  type="text"
                  autoFocus
                  placeholder={t('platformPicker.searchPlaceholder')}
                  className="v-field !pl-9 text-xs"
                  value={platformSearch}
                  onChange={(e) => setPlatformSearch(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
              </div>

              {/* Grid Body */}
              <div className="max-h-[380px] overflow-y-auto pr-1 space-y-5 scrollbar-thin scroll-smooth">
                {/* 1. Favorites (Only when search query is empty) */}
                {!platformSearch.trim() && favorites.length > 0 && (
                  <div className="space-y-2.5">
                    <h4 className="text-[10px] font-black text-amber-500 uppercase tracking-wider flex items-center gap-1">
                      <Icon name="sparkle" size={10} /> Favorites
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {ALL_PLATFORMS.filter(p => favorites.includes(p.key)).map((plat) => {
                        const isHighlighted = visiblePlatforms[highlightedIndex]?.key === plat.key && visiblePlatforms[highlightedIndex]?.category === '⭐ Favorites';
                        const isAdded = actions.some((a) => a.type === plat.key);
                        const isDisabled = isAdded && plat.key === 'SAVE_CONTACT';

                        return (
                          <div
                            key={`fav-${plat.key}`}
                            onClick={() => !isDisabled && handleSelectPlatform(plat)}
                            className={`flex items-center justify-between p-3 rounded-2xl border transition-all text-left cursor-pointer group/item relative ${
                              isHighlighted
                                ? 'border-accent bg-accent/5 ring-1 ring-accent-soft'
                                : 'border-line bg-canvas/30 hover:border-line-strong hover:bg-canvas/60'
                            } ${isDisabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <span
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white shadow-sm"
                                style={{ background: plat.color }}
                              >
                                <Icon name={plat.icon} size={16} />
                              </span>
                              <div className="min-w-0">
                                <span className="block text-xs font-bold text-ink truncate leading-tight">
                                  {plat.label}
                                </span>
                                <span className="block text-[9.5px] text-muted truncate">
                                  {plat.arLabel}
                                </span>
                              </div>
                            </div>

                            {/* Unpin Action */}
                            <button
                              onClick={(e) => handleToggleFav(e, plat.key)}
                              className="text-amber-500 hover:scale-110 active:scale-90 transition-all p-1"
                              title={t('platformPicker.unfavorite')}
                            >
                              <Icon name="sparkle" size={13} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 2. Recently Used (Only when search query is empty) */}
                {!platformSearch.trim() && recentlyUsed.length > 0 && (
                  <div className="space-y-2.5">
                    <h4 className="text-[10px] font-black text-muted uppercase tracking-wider flex items-center gap-1">
                      <Icon name="clock" size={10} /> Recently Used
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {ALL_PLATFORMS.filter(p => recentlyUsed.includes(p.key)).map((plat) => {
                        const isHighlighted = visiblePlatforms[highlightedIndex]?.key === plat.key && visiblePlatforms[highlightedIndex]?.category === 'Recently Used';
                        const isAdded = actions.some((a) => a.type === plat.key);
                        const isDisabled = isAdded && plat.key === 'SAVE_CONTACT';
                        const isFav = favorites.includes(plat.key);

                        return (
                          <div
                            key={`recent-${plat.key}`}
                            onClick={() => !isDisabled && handleSelectPlatform(plat)}
                            className={`flex items-center justify-between p-3 rounded-2xl border transition-all text-left cursor-pointer group/item relative ${
                              isHighlighted
                                ? 'border-accent bg-accent/5 ring-1 ring-accent-soft'
                                : 'border-line bg-canvas/30 hover:border-line-strong hover:bg-canvas/60'
                            } ${isDisabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <span
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white shadow-sm"
                                style={{ background: plat.color }}
                              >
                                <Icon name={plat.icon} size={16} />
                              </span>
                              <div className="min-w-0">
                                <span className="block text-xs font-bold text-ink truncate leading-tight">
                                  {plat.label}
                                </span>
                                <span className="block text-[9.5px] text-muted truncate">
                                  {plat.arLabel}
                                </span>
                              </div>
                            </div>

                            {/* Favorite Button */}
                            <button
                              onClick={(e) => handleToggleFav(e, plat.key)}
                              className={`transition-all p-1 hover:scale-110 ${
                                isFav ? 'text-amber-500' : 'text-faint hover:text-amber-500 opacity-0 group-hover/item:opacity-100'
                              }`}
                              title={isFav ? t('platformPicker.unfavorite') : t('platformPicker.favorite')}
                            >
                              <Icon name="sparkle" size={13} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 3. Regular Categories */}
                {['⭐ Quick Actions', '🌐 Social Media', '💼 Business', '🎥 Media', '⚙ Custom'].map((cat) => {
                  const filtered = ALL_PLATFORMS.filter(
                    (p) =>
                      p.category === cat &&
                      (p.label.toLowerCase().includes(platformSearch.toLowerCase()) ||
                        p.arLabel.includes(platformSearch))
                  );
                  if (filtered.length === 0) return null;

                  return (
                    <div key={cat} className="space-y-2.5 border-t border-line/30 pt-3 first:border-0 first:pt-0">
                      <h4 className="text-[10px] font-black text-muted uppercase tracking-wider">{cat}</h4>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {filtered.map((plat) => {
                          const isHighlighted = visiblePlatforms[highlightedIndex]?.key === plat.key && visiblePlatforms[highlightedIndex]?.category === plat.category;
                          const isAdded = actions.some((a) => a.type === plat.key);
                          const isDisabled = isAdded && plat.key === 'SAVE_CONTACT';
                          const isFav = favorites.includes(plat.key);

                          return (
                            <div
                              key={`${cat}-${plat.key}`}
                              onClick={() => !isDisabled && handleSelectPlatform(plat)}
                              className={`flex items-center justify-between p-3 rounded-2xl border transition-all text-left cursor-pointer group/item relative ${
                                isHighlighted
                                  ? 'border-accent bg-accent/5 ring-1 ring-accent-soft'
                                  : 'border-line bg-canvas/30 hover:border-line-strong hover:bg-canvas/60'
                              } ${isDisabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <span
                                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white shadow-sm"
                                  style={{ background: plat.color }}
                                >
                                  <Icon name={plat.icon} size={16} />
                                </span>
                                <div className="min-w-0">
                                  <span className="block text-xs font-bold text-ink truncate leading-tight">
                                    {plat.label}
                                  </span>
                                  <span className="block text-[9.5px] text-muted truncate">
                                    {plat.arLabel}
                                  </span>
                                </div>
                              </div>

                              {/* Favorite Button */}
                              <button
                                onClick={(e) => handleToggleFav(e, plat.key)}
                                className={`transition-all p-1 hover:scale-110 ${
                                  isFav ? 'text-amber-500' : 'text-faint hover:text-amber-500 opacity-0 group-hover/item:opacity-100'
                                }`}
                                title={isFav ? t('platformPicker.unfavorite') : t('platformPicker.favorite')}
                              >
                                <Icon name="sparkle" size={13} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {/* No Results Fallback */}
                {visiblePlatforms.length === 0 && (
                  <p className="text-xs text-muted text-center py-6">{t('platformPicker.empty')}</p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
        </div>
      </div>
    </AppShell>
  );
}

function TabButton({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: string;
}) {
  return (
    <button
      onClick={onClick}
      // A chip in the phone strip, a full-width row in the desktop sidebar.
      className={`shrink-0 whitespace-nowrap rounded-[10px] border px-3.5 py-3 text-[12.5px] font-bold flex items-center gap-2.5 transition-all lg:w-full lg:py-2.5 lg:text-start ${
        active
          ? 'text-white border-transparent'
          : 'text-muted hover:bg-ink/5 hover:text-ink border-line lg:border-transparent'
      }`}
      style={active ? { background: 'var(--v-gradient-brand)', boxShadow: 'var(--v-shadow-accent)' } : {}}
    >
      <Icon name={icon} size={15} />
      <span>{label}</span>
    </button>
  );
}

