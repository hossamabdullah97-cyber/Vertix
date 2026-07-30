'use client';

import { useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { formatDate } from '@/lib/format';

interface Note {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  category: string;
}

const NOTE_TEMPLATES = {
  general: {
    title: 'General Meeting Minutes',
    content: `## General Discussion\n\n* Date: ${new Date().toLocaleDateString()}\n* Attendees:\n* Agenda:\n\n## Action Items\n\n- [ ] Follow up on pricing options\n- [ ] Schedule next demo call`,
  },
  discovery: {
    title: 'Lead Discovery Call notes',
    content: `## Discovery Interview\n\n* **Business Size:** \n* **Current NFC/QR setup:** None\n* **Primary Pain Points:** Cards are outdated, slow contact capture.\n* **Timeline to Buy:** Within 30 days.\n\n## Budget & Value\n\n* Estimated deal size: \n* Priority: HIGH`,
  },
  proposal: {
    title: 'Proposal & Negotiation notes',
    content: `## Proposal Review\n\n* **Offered plan:** Business Plan (Annual)\n* **Discounts discussed:** 10% volume discount\n* **Client Response:** Positive, reviewing details with legal.`,
  },
};

const STORAGE_KEY = 'vertex_crm_notes';

function loadNotes(): Note[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Note[]) : [];
  } catch {
    return [];
  }
}

export function NotesView() {
  const { t } = useTranslation('crm');
  const { locale } = useLocale();
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');

  // Hydrate from localStorage on mount (client only) — notes are stored in this
  // browser. There is no notes backend yet, so we persist locally rather than
  // seed fabricated content.
  useEffect(() => {
    const stored = loadNotes();
    setNotes(stored);
    setSelectedId(stored[0]?.id || '');
  }, []);

  // Persist every change back to localStorage.
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
    }
  }, [notes]);
  const [search, setSearch] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | 'ALL'>('ALL');
  const [isPreview, setIsPreview] = useState(false);

  const selectedNote = notes.find((n) => n.id === selectedId) || null;

  // Load selected note into editor
  useEffect(() => {
    if (selectedNote) {
      setEditTitle(selectedNote.title);
      setEditContent(selectedNote.content);
    }
  }, [selectedId]);

  function saveNote(updatedFields: Partial<Note>) {
    if (!selectedId) return;
    setNotes((prev) =>
      prev.map((n) =>
        n.id === selectedId
          ? { ...n, ...updatedFields, updatedAt: new Date().toISOString() }
          : n
      )
    );
  }

  function handleCreateNew(templateKey?: keyof typeof NOTE_TEMPLATES) {
    const template = templateKey
      ? { title: t(`notes.templateTitles.${templateKey}`), content: NOTE_TEMPLATES[templateKey].content }
      : { title: t('notes.untitled'), content: '' };
    const newNote: Note = {
      id: `note-${Date.now()}`,
      title: template.title,
      content: template.content,
      pinned: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      category: templateKey ? 'Template' : 'Draft',
    };

    setNotes((prev) => [newNote, ...prev]);
    setSelectedId(newNote.id);
    setIsPreview(false);
  }

  function handleDelete(id: string) {
    const remaining = notes.filter((n) => n.id !== id);
    setNotes(remaining);
    if (selectedId === id && remaining.length > 0) {
      setSelectedId(remaining[0].id);
    }
  }

  const filteredNotes = useMemo(() => {
    return notes.filter((n) => {
      if (activeCategory !== 'ALL' && n.category !== activeCategory) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q);
      }
      return true;
    }).sort((a, b) => {
      // Pinned notes first
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return +new Date(b.updatedAt) - +new Date(a.updatedAt);
    });
  }, [notes, activeCategory, search]);

  const categories = useMemo(() => {
    return ['ALL', ...Array.from(new Set(notes.map((n) => n.category)))];
  }, [notes]);

  return (
    <div className="grid gap-5 lg:grid-cols-[280px_1fr] h-[calc(100vh-220px)]">
      {/* Left Pane: Notes List */}
      <div className="flex flex-col border border-line rounded-2xl bg-surface overflow-hidden">
        {/* Search & Actions */}
        <div className="p-3 border-b border-line space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-bold text-ink flex items-center gap-1.5">
              <Icon name="file-text" size={14} className="text-accent" /> {t('notes.heading')}
            </span>
            <button
              onClick={() => handleCreateNew()}
              className="v-btn !h-7 !px-2.5 text-[11px] font-bold"
              title={t('notes.newTitle')}
            >
              <Icon name="plus" size={12} /> {t('notes.new')}
            </button>
          </div>
          
          <div className="relative flex items-center">
            <span className="absolute start-2.5 text-faint"><Icon name="search" size={13} /></span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('notes.searchPlaceholder')}
              className="v-field !h-8 !ps-8 text-[11.5px]"
            />
          </div>
        </div>

        {/* Categories Bar */}
        <div className="no-scrollbar flex gap-1 overflow-x-auto px-3 py-2 border-b border-line bg-canvas/30">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider transition-colors shrink-0"
              style={{
                backgroundColor: activeCategory === cat ? 'var(--v-accent)' : 'transparent',
                color: activeCategory === cat ? 'var(--v-accent-contrast)' : 'hsl(var(--v-muted))',
              }}
            >
              {cat === 'ALL' ? t('notes.categoryAll') : cat === 'Template' ? t('notes.categoryTemplate') : cat === 'Draft' ? t('notes.categoryDraft') : cat}
            </button>
          ))}
        </div>

        {/* Notes Items */}
        <div className="flex-1 overflow-y-auto divide-y divide-line no-scrollbar">
          {filteredNotes.map((n) => {
            const isSelected = n.id === selectedId;
            return (
              <button
                key={n.id}
                onClick={() => setSelectedId(n.id)}
                className="w-full text-left p-3.5 transition-colors focus:outline-none flex gap-2"
                style={{ backgroundColor: isSelected ? 'var(--v-accent-soft)' : 'transparent' }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-1.5">
                    {n.pinned && (
                      <span className="text-amber-500 shrink-0 mt-0.5" title={t('notes.pinned')}>
                        <Icon name="sparkle" size={10} />
                      </span>
                    )}
                    <h4 className={`truncate text-[12.5px] font-bold leading-snug ${isSelected ? 'text-accent' : 'text-ink'}`}>
                      {n.title || t('notes.untitled')}
                    </h4>
                  </div>
                  <p className="truncate text-[11px] text-muted mt-1">
                    {n.content.replace(/[#*`_-]/g, '') || t('notes.emptyBody')}
                  </p>
                  <span className="text-[10px] text-faint font-semibold block mt-1.5">
                    {formatDate(n.updatedAt, locale, { year: 'numeric', month: 'short', day: 'numeric' })}
                  </span>
                </div>
              </button>
            );
          })}
          {filteredNotes.length === 0 && (
            <div className="p-8 text-center text-faint">
              <Icon name="inbox" size={20} className="mx-auto mb-1.5" />
              <span className="text-[11px] font-semibold">{t('notes.noNotes')}</span>
            </div>
          )}
        </div>
      </div>

      {/* Right Pane: Editor / Previewer */}
      <div className="flex flex-col border border-line rounded-2xl bg-surface overflow-hidden">
        {selectedNote ? (
          <>
            {/* Editor Toolbar */}
            <div className="px-4 py-2.5 border-b border-line bg-canvas/30 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => saveNote({ pinned: !selectedNote.pinned })}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors border ${selectedNote.pinned ? 'text-amber-500 bg-amber-500/10 border-amber-500/20' : 'text-muted border-line hover:text-ink'}`}
                  title={selectedNote.pinned ? t('notes.unpin') : t('notes.pin')}
                >
                  <Icon name="sparkle" size={13} />
                </button>
                <button
                  onClick={() => setIsPreview(!isPreview)}
                  className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-[11px] font-bold text-muted hover:text-ink"
                >
                  <Icon name={isPreview ? 'file-text' : 'eye'} size={12} />
                  {isPreview ? t('notes.editEditor') : t('notes.previewMd')}
                </button>
              </div>

              {/* Template dropdown list */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-faint">{t('notes.templates')}</span>
                <div className="flex gap-1">
                  {(Object.keys(NOTE_TEMPLATES) as Array<keyof typeof NOTE_TEMPLATES>).map((key) => (
                    <button
                      key={key}
                      onClick={() => {
                        saveNote({ title: t(`notes.templateTitles.${key}`), content: NOTE_TEMPLATES[key].content, category: 'Template' });
                      }}
                      className="px-2 py-1 rounded border border-line bg-surface hover:bg-canvas text-[10px] font-semibold text-muted"
                    >
                      {t(`notes.templateNames.${key}`)}
                    </button>
                  ))}
                </div>

                <span className="h-5 w-px bg-line mx-1" />

                <button
                  onClick={() => handleDelete(selectedNote.id)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-500/20 bg-red-500/5 text-red-500 hover:bg-red-500/10"
                  title={t('notes.delete')}
                >
                  <Icon name="trash" size={13} />
                </button>
              </div>
            </div>

            {/* Note Editor Area */}
            <div className="flex-1 overflow-y-auto p-5 no-scrollbar">
              {isPreview ? (
                <div className="prose max-w-none text-[13px] text-muted space-y-4">
                  <h1 className="text-[18px] font-black text-ink border-b border-line pb-2">{editTitle || t('notes.untitled')}</h1>
                  <div className="whitespace-pre-wrap leading-relaxed">
                    {editContent || <span className="text-faint italic">{t('notes.noContent')}</span>}
                  </div>
                </div>
              ) : (
                <div className="space-y-4 h-full flex flex-col">
                  <input
                    value={editTitle}
                    onChange={(e) => {
                      setEditTitle(e.target.value);
                      saveNote({ title: e.target.value });
                    }}
                    placeholder={t('notes.titlePlaceholder')}
                    className="w-full bg-transparent text-[18px] font-black text-ink outline-none placeholder:text-faint border-b border-line pb-2"
                  />
                  <textarea
                    value={editContent}
                    onChange={(e) => {
                      setEditContent(e.target.value);
                      saveNote({ content: e.target.value });
                    }}
                    placeholder={t('notes.contentPlaceholder')}
                    className="w-full flex-1 resize-none bg-transparent text-[13px] text-ink outline-none placeholder:text-faint leading-relaxed"
                  />
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <Icon name="file-text" size={32} className="text-faint mb-3" />
            <h3 className="text-[14px] font-bold text-ink">{t('notes.noneSelected')}</h3>
            <p className="text-[12px] text-muted mt-1 max-w-xs">{t('notes.noneSelectedDesc')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
