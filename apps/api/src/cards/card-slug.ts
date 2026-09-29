/**
 * Card links made from a person's name: `/c/salma-abdelrahman` rather than
 * `/c/card-9uvt`. Latin names are used as written; Arabic names take the
 * common Egyptian spelling of well-known names, then a letter-by-letter
 * transliteration for the rest.
 */

// Written the way people in Egypt usually spell them in Latin letters.
const NAMES: Record<string, string> = {
  محمد: 'mohamed', أحمد: 'ahmed', احمد: 'ahmed', محمود: 'mahmoud', مصطفى: 'mostafa', علي: 'ali', على: 'ali',
  عمر: 'omar', عمرو: 'amr', حسن: 'hassan', حسين: 'hussein', إبراهيم: 'ibrahim', ابراهيم: 'ibrahim',
  يوسف: 'youssef', خالد: 'khaled', كريم: 'karim', طارق: 'tarek', أمير: 'amir', امير: 'amir', هشام: 'hesham',
  وليد: 'walid', شريف: 'sherif', إسلام: 'islam', اسلام: 'islam', حسام: 'hossam', جمال: 'gamal', سامي: 'samy',
  سمير: 'samir', عادل: 'adel', مجدي: 'magdy', هاني: 'hany', رامي: 'ramy', تامر: 'tamer', ياسر: 'yasser',
  أيمن: 'ayman', ايمن: 'ayman', أشرف: 'ashraf', اشرف: 'ashraf', عماد: 'emad', إيهاب: 'ehab', ايهاب: 'ehab',
  مينا: 'mina', بيتر: 'peter', جورج: 'george', مارك: 'mark', كيرلس: 'kirollos', بولا: 'bola', شادي: 'shady',
  زياد: 'ziad', مازن: 'mazen', آدم: 'adam', ادم: 'adam', سيف: 'seif', نبيل: 'nabil', فتحي: 'fathy', صلاح: 'salah',
  سيد: 'sayed', السيد: 'elsayed', عبدالله: 'abdallah', عبدالرحمن: 'abdelrahman', عبدالعزيز: 'abdelaziz',
  سارة: 'sara', ساره: 'sara', مريم: 'mariam', فاطمة: 'fatma', فاطمه: 'fatma', نور: 'nour', سلمى: 'salma',
  هدى: 'hoda', منى: 'mona', ياسمين: 'yasmin', آية: 'aya', اية: 'aya', رنا: 'rana', دينا: 'dina', ريم: 'reem',
  ليلى: 'laila', نادية: 'nadia', هبة: 'heba', هبه: 'heba', إيمان: 'eman', ايمان: 'eman', أسماء: 'asmaa',
  اسماء: 'asmaa', نهى: 'noha', شيماء: 'shaimaa', دعاء: 'doaa', رحاب: 'rehab', مي: 'mai', ملك: 'malak',
  جنى: 'jana', حبيبة: 'habiba', لمياء: 'lamiaa', رانيا: 'rania', ندى: 'nada', أميرة: 'amira', اميرة: 'amira',
  مروة: 'marwa', نسمة: 'nesma', هالة: 'hala', سلوى: 'salwa', عبير: 'abeer', سمر: 'samar', كريمة: 'karima',
};

const LETTERS: Record<string, string> = {
  ا: 'a', أ: 'a', إ: 'e', آ: 'a', ء: '', ؤ: 'o', ئ: 'e', ب: 'b', ت: 't', ث: 'th', ج: 'g', ح: 'h', خ: 'kh',
  د: 'd', ذ: 'z', ر: 'r', ز: 'z', س: 's', ش: 'sh', ص: 's', ض: 'd', ط: 't', ظ: 'z', ع: 'a', غ: 'gh', ف: 'f',
  ق: 'k', ك: 'k', ل: 'l', م: 'm', ن: 'n', ه: 'h', ة: 'a', و: 'o', ي: 'y', ى: 'a',
};

function arabicWord(word: string): string {
  if (NAMES[word]) return NAMES[word];
  // "Abd al-…" is one name: عبد الرحمن → abdelrahman when known, else abdel + the rest.
  let prefix = '';
  let rest = word;
  if (rest.startsWith('ال') && rest.length > 3) {
    prefix = 'el';
    rest = rest.slice(2);
    if (NAMES[rest]) return prefix + NAMES[rest];
  }
  let out = '';
  [...rest].forEach((ch, i) => {
    // و and ي open a word as consonants and read as vowels inside it.
    if (ch === 'و') out += i === 0 ? 'w' : 'o';
    else if (ch === 'ي') out += i === 0 ? 'y' : 'i';
    else out += LETTERS[ch] ?? '';
  });
  return prefix + out;
}

function latin(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** A link-safe version of a name, or '' when nothing usable is left. */
export function slugFromName(name: string): string {
  const clean = name.replace(/[ً-ٰٟـ]/g, '').trim(); // harakat and tatweel
  if (!/[؀-ۿ]/.test(clean)) return latin(clean).slice(0, 40).replace(/-+$/, '');
  const words = clean.split(/\s+/).filter(Boolean);
  const parts: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const next = words[i + 1];
    // "عبد الرحمن" / "عبد الله" as two words: join them first.
    if (w === 'عبد' && next) {
      const joined = w + next;
      parts.push(NAMES[joined] ?? `abdel${arabicWord(next).replace(/^el/, '')}`);
      i++;
      continue;
    }
    parts.push(/[؀-ۿ]/.test(w) ? arabicWord(w) : latin(w));
  }
  return latin(parts.join(' ')).slice(0, 40).replace(/-+$/, '');
}

/** The links a card gets before it has a name ("card", "card-9uvt"): safe to replace until it goes out. */
export function isPlaceholderSlug(slug: string): boolean {
  return /^card(-[a-z0-9]{4})?$/.test(slug);
}
