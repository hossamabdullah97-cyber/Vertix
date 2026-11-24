# Visual Design Fundamentals for Professional Smartwatch Watch Faces (1.43", 480x480 round AMOLED)

Scope note: platform-independent craft notes, drawing on Wear OS / Samsung Watch Face Studio (WFS) / Apple guidance, human-factors research and embedded-graphics sources. Research date: 2026-11-24. Items older than 2024 are marked **[older]**. Numbers I derived myself are marked **(calc)** and listed under Inferences.

Reference geometry for the target screen (all calc):
- 480 px across a 1.43" (36.3 mm) diameter is about 336 ppi. The brief's ~326 ppi corresponds to about a 1.47" diameter. Either way, 1 px is about 0.076 to 0.078 mm.
- Typical wrist viewing distance is about 28 cm (Microsoft research, below). At 28 cm, 1 arcminute is about 0.081 mm, which is about 1.05 px. **Rule of thumb: on this screen at wrist distance, 1 px is roughly 1 arcminute.** At 35 cm, 1 arcmin is about 1.3 px.
- The largest square inside the circle is 480/√2, about 339 px on a side, so 71% of the width is usable at the corners.
- The width of a horizontal chord at distance d from the centre is 2·√(240² − d²). Examples: at d = 120 px it is 416 px; at d = 180 px (60 px from the edge) it is 317 px; at d = 210 px (30 px from the edge) it is 232 px.

---

## 1. Legibility: minimum text sizes, contrast, stroke weight

### Takeaway
Text the user must read needs a cap height of about 16 arcmin or more at a 28 cm wrist distance, which is about 17 px cap height (about 24 px font size) on this screen. This matches Wear OS's 12 sp minimum for essential text. Font size is the strongest legibility factor, and the thinnest weights hurt legibility, especially for users over 40. Aim for at least WCAG 4.5:1 contrast for small text and 3:1 for large numerals and graphic marks. On a black AMOLED background, the practical goal is much higher than either.

### Cited Findings
- Viewing distance: in a Microsoft Research study, people held a smartwatch about **28 cm** from the eye at a pitch of about **50°** when reading. — [Microsoft Research, MobileVis 2018 paper](https://microsoft.com:443/en-us/research/uploads/prod/2018/07/mobilevis2018_paper_11.pdf) **[older]**
- For comparison, the mean phone viewing distance for text messages was **36.2 cm** (range 17.5 to 58.0 cm). — [PubMed: Font size and viewing distance of handheld smart phones](https://pubmed.ncbi.nlm.nih.gov/21499163/) **[older]**
- A human-factors style guide (for workstations) sets the minimum for adequate legibility at a 9-pt font or **16 minutes of arc** of character height, adjusted for viewing distance. — [arXiv 2312.12579, HSI Style Guide](https://arxiv.org/pdf/2312.12579)
- Wear OS quality guidelines recommend at least **12 sp for essential text** and **10 sp for non-essential text** so text is "large enough to be read at a glance". — [Wear OS app quality](https://developer.android.com/docs/quality-guidelines/wear-app-quality)
- Wear OS user font scaling changes each type style in **±6% increments**. Designers should check layouts at the largest and smallest settings. — [Wear OS: Accessibility in typography](https://developer.android.com/design/ui/wear/guides/styles/typography/accessibility)
- Android XR / AI-glasses typography (a related glanceable display) requires text of at least **18 px** and a minimum angular size of **0.6°** (36 arcmin). This is useful as an upper-bound comfort target for glance reading. — [Android: Typography for glasses](https://developer.android.com/design/ui/ai-glasses/guides/styles/type)
- Wang et al. (HCII 2022) ran two experiments on wearable text legibility: 45 users, split into ages 18 to 40 and over 40. **Font size had the largest effect.** "Very small" and "small" sizes were hard for users over 40 to recognise. Low contrast should be avoided. **Very thin weights performed worse than medium and very thick weights.** The exact px thresholds were not accessible. — [Springer DOI 10.1007/978-3-031-06086-1_10 via Unpaywall](https://unpaywall.org/10.1007%2F978-3-031-06086-1_10) **[2022]**
- WCAG 2.x contrast: **4.5:1** minimum for normal text and **3:1** for large text (≥18 pt, or ≥14 pt bold), under SC 1.4.3. **7:1** is the enhanced level (AAA, SC 1.4.6). — [W3C Understanding SC 1.4.3](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html)
- WCAG SC 1.4.11 Non-text Contrast requires **3:1** for graphical objects needed to understand content, such as progress arcs and icons, against adjacent colours. — [W3C Understanding SC 1.4.11](https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast.html)
- Google's watch-face principles: "The purpose of a watch face is foremost to tell the time. On average, people check the time **150 times a day**." Make faces glanceable with "clear fonts, legible icons, and a simple layout." — [Wear OS design: Watch faces](https://developer.android.com/design/ui/wear/guides/surfaces/watch-faces)
- Custom display fonts may be less legible at small sizes, so use them mainly for large elements. — [Adobe XD Ideas: UX design for smartwatches](https://xd.adobe.com/ideas/principles/app-design/ux-design-for-smartwatches) **[older]**

### Inferences
- **(calc)** 16 arcmin at 28 cm is about 1.30 mm, which is about **17 px cap height**. With a typical cap height of about 0.7 em, that is a **font size of about 24 px**. On a watch with density factor 2.0 (xhdpi, common for 320 to 340 ppi watches), Wear's 12 sp is about **24 px**, so the platform rule and the arcminute rule agree. 10 sp is about 20 px, with a cap height of about 14 px (about 13 arcmin). That is acceptable only for non-essential labels.
- **Suggested size ladder for 480 px round** (calc, a starting point rather than a standard):
  - Hero time: 110 to 200 px font size (cap height 80 to 140 px, about 5 to 9° visual angle).
  - Primary data values: 36 to 56 px.
  - Secondary values: 28 to 34 px.
  - Labels and units: 22 to 26 px, never below about 20 px.
  - For users over 40, push every tier up by one step.
- Stroke weight: at 1 px ≈ 1 arcmin, strokes under about 2 px vanish at a glance, and AMOLED sub-pixel layouts (PenTile) make them look fringed. Keep text stems at **≥3 px** for small text and **≥4 to 6 px** for icons and arc tracks. Avoid Thin and Light weights below about 40 px; Medium to Bold is the safe range. This follows Wang et al. on weight.
- On a pure-black AMOLED background, white text gives the maximum ratio of 21:1. Grey labels should stay at **≥4.5:1**. For example, #767676 is about 4.5:1 on black (WCAG maths); #8A8A8A or lighter is a safer floor in sunlight. Coloured accents such as pure blue #0000FF fall to about 2.4:1 on black, so they need lightening (e.g. #4D8DFF) for text use.
- Outdoor sunlight raises the effective black level through reflection, which compresses contrast. So the in-lab WCAG ratio overstates real contrast. Design to AAA (7:1) for anything essential, and avoid relying on subtle dark-grey distinctions.

### Gaps
- I found no smartwatch-specific study that gives text thresholds in arcminutes. The Wang et al. full text with px/pt thresholds was not accessible.
- The commonly cited HFES/ANSI 100 preferred 20 to 22 arcmin character height could not be verified with a source in this session.
- I found no measured data on outdoor AMOLED watch readability, such as nits needed or ambient contrast ratios.
- The density bucket that a specific 1.43" 480x480 device reports for sp→px is device-dependent and was not verified.

---

## 2. Typography: families, display vs. data pairing, digits, custom numerals

### Takeaway
Current platform practice (2025-2026) uses **variable fonts** with weight and width axes, plus a dedicated **"Numerals" type role** that uses big, styled, tabular or mono-spaced digits, especially when they animate. Pair one expressive display numeral face for the time with a highly legible neutral sans for complications. Rounder, condensed and variable families such as Roboto Flex are the platform reference.

### Cited Findings
- Wear OS Material 3 type styles are **display, title, label, body, arc and numerals**. Tokens define font, line height, size, tracking, width and weight. — [Wear OS design: Typography](https://developer.android.com/design/ui/wear/guides/styles/typography)
- The Wear "Numerals" role exists "so we can lean into bigger and more styled text sizes for strings that don't need to be localized or benefit from **mono or tabular spacing when animated**, such as pickers." — [Wear OS design: Typography](https://developer.android.com/design/ui/wear/guides/styles/typography)
- Variable font axes are used for expressive motion feedback, such as dynamic font weight, dynamic width, or both. — [Wear OS design: Typography](https://developer.android.com/design/ui/wear/guides/styles/typography)
- Material 3 Expressive for Wear OS (Aug 2025) moves "past fixed font weights" to variable fonts with adjustable weight and width axes. — [Android Developers Blog, Aug 25 2025](https://android-developers.googleblog.com/2025/08/introducing-material-3-expressive-for-wear-os.html)
- Pixel Watch 4 (2025) ships M3 Expressive with a "rounder **Roboto Flex** font" tuned for its domed display. Android Authority's hands-on names Roboto Flex; other coverage mentions Google Sans Flex, which is unconfirmed. — [Android Authority hands-on](https://www.androidauthority.com/google-pixel-watch-4-hands-on-preview-3587950)
- Earlier, Colophon Foundry designed a **custom numeral variable font limited to the 0-9 character set** for a Pixel Watch face, set alongside Google Sans for complications. This is the canonical "display numerals + neutral data font" pairing. — [Colophon Foundry: Google Pixel Watch](https://colophon-foundry.org/custom-projects/google-pixel-watch) (page returned 404 at fetch time; the detail is from the search snippet) **[older]**
- Roboto Condensed was historically the primary Wear OS font. — [Adobe XD Ideas](https://xd.adobe.com/ideas/principles/app-design/ux-design-for-smartwatches) **[older]**
- Pixel Watch 4's "Bold" face family includes **Digital Bold**, with large segmented digital numbers, and **Analog Bold**, with thick hands and minimal markings, plus typography-style options. — [the5krunner: every Pixel Watch 4 watch face](https://the5krunner.com/2025/12/03/every-google-pixel-watch-4-watchface-options)

### Inferences
- **Digits must be tabular** (OpenType `tnum`, or a mono numeral cut) wherever values tick, such as seconds, heart rate, steps and countdowns. Otherwise the string jitters as glyph widths change ("1" is narrower than "8"). Proportional digits are fine for a static hero time only if it is kerned per pair, for example tightening "1" pairs.
- Tracking: large numerals usually need **negative tracking** (about −2% to −5% of em) to read as a unit. Small labels at 20 to 26 px need **positive tracking** (+2% to +6%), especially in all-caps, to stay legible.
- Font choices fall into three useful classes:
  - Condensed sans, which fits more digits horizontally inside a narrowing circle.
  - Rounded sans, which suits the friendly "bubble"/Expressive look and survives low resolution.
  - Variable fonts, which allow AOD/interactive weight morphing; for example, a thinner AOD weight cuts the share of lit pixels.
- Custom numerals: design only 0-9 plus colon, using one consistent stroke weight. Use open apertures for 3/5/6/9 to avoid confusing them with 8 at a glance, a distinctive 1 and 7, and a large counter in 0/6/8/9. Test at actual size on the device.
- Pair at most **two families**: one display (time) and one text/data. Distinguish within the data font using weight and size instead of adding a third face.

### Gaps
- I did not find a foundry article dedicated to digit kerning on watches. The tracking percentages above are standard typographic practice, not watch-specific sourced numbers.
- The Pixel Watch 4 font (Roboto Flex vs. Google Sans Flex) is not confirmed by official Google documentation.

---

## 3. Color: AMOLED palettes, gradients and banding (RGB565), accents, health color coding, dark mode

### Takeaway
Black is the base and the battery saver. Use one or two saturated accents on black for hierarchy. Gradients on 16-bit RGB565 pipelines band visibly, especially in long, shallow, dark ramps, so pre-dither static assets (Floyd-Steinberg) or add ordered or noise dither when rendering in real time.

### Cited Findings
- Google: "Use **black as the primary color** as this helps to conserve battery life… Black is also versatile and neutral, so it allows other design elements to stand out." — [Wear OS design: Watch faces](https://developer.android.com/design/ui/wear/guides/surfaces/watch-faces)
- M3 Expressive on Wear OS **extracts the two most common hues from the user's chosen watch face** and adds complementary colours for the system theme. Apps can follow dynamic colour or keep brand colours. The watch face palette therefore now drives the whole OS look. — [Android Developers Blog, Aug 2025](https://android-developers.googleblog.com/2025/08/introducing-material-3-expressive-for-wear-os.html)
- RGB565 uses 5 bits for R and B and 6 for G. Not every 24-bit colour has an equivalent, and banding is visible in smooth gradients. — [Applied EE: Color formats & pixel packing](https://applied-ee.github.io/embedded/docs/screens-displays/tft-color-displays/color-formats/)
- Dithering does not recover lost bits; it changes the pattern of the steps. In MicroEJ's gradient test, the banded rendering used **23 distinct colours** and the dithered rendering used **45**. — [MicroEJ: From Design Tool to 16-Bit Display](https://docs.microej.com/en/latest/Trainings/trainingColorDisplayConsiderations.html)
- An LVGL forum user built real-time 24→16-bit **Floyd-Steinberg** dithering. Another reported that banding was "about 98% gone" with dithering. — [LVGL forum: real-time dithering 24 to 16 bit](https://forum.lvgl.io/t/real-time-dithering-from-24-to-16-bit-for-beautiful-displays/18642)
- The LVGL blog covers pre-dithering images for RGB565 with GIMP and ImageMagick. — [LVGL blog: dithering for 16-bit colour depth](https://blog.lvgl.io/2017-07-03/dithering) **[older]**
- Tool pipelines such as SquareLine/LVGL may convert images to RGB565 **without dithering**. The workarounds are to pre-dither assets or switch to RGB888. — [SquareLine forum](https://forum.squareline.io/t/how-to-avoid-banding-on-smooth-gradients-using-squareline/6259)
- Hardware display-pipeline dithering exists on some SoCs (TI) to smooth gradients on low-bit-depth panels. — [TI SPRUJB3](https://www.ti.com/document-viewer/lit/html/SPRUJB3/GUID-183524C2-4FF7-4746-A82D-921D2B20DD0E)
- ST's GPU2D / NemaGFX exposes a `NEMA_DITHER` flag, though whether it applies to gradients was unresolved in the thread. — [ST community](https://community.st.com/stm32-mcus-touchgfx-and-gui-33/gpu2d-and-rgb565-can-the-gpu2d-use-dithering-in-gradients-163521)
- True black vs. dark grey saves only a small amount, a reported difference of **0.3%** in an XDA test. Most savings come from avoiding bright and white areas, not from #000 vs. #111. — [Android Authority: true black dark mode](https://www.androidauthority.com/true-black-dark-mode-1003537) **[older]**

### Inferences
- **(calc) Banding maths:** in RGB565, one R/B step equals 8 levels in 8-bit and one G step equals 4. Consider a dark blue ramp from #000040 to #000080 across 480 px. That is 64 levels in 8-bit but only **8 levels** in RGB565, giving bands **about 60 px wide**, which is very visible. Mitigations:
  - Increase the luminance or hue span of the gradient.
  - Include a green-channel change, since it has twice the resolution.
  - Keep gradients short, such as on arcs or hands rather than full-face backgrounds.
  - Add 1 to 2 LSB noise or grain texture.
  - Use ordered (Bayer 4x4) dither for real-time rendering, because it is cheap and stable frame to frame. Error-diffusion dither shimmers on animated content.
  - Use Floyd-Steinberg for static bitmaps.
- Radial gradients centred on a round face produce concentric "contour rings" in RGB565, which are very noticeable. Prefer angular (conic) gradients on arcs, or pre-dithered bitmaps.
- Avoid dark-on-dark gradients near black. Low-level AMOLED drive is the least uniform region, and banding steps are perceptually largest there.
- **Accent strategy:** one primary accent for the hero, such as the time or a key arc, and at most one secondary accent. Everything else should be white or greys on black. The accent should pass 3:1 against black as a graphic and 4.5:1 if used for text.
- **Health colour coding:** de-facto conventions observed across products, not sourced in this session, are red/pink for heart rate, move or calories; green for exercise or steps; blue/cyan for stand, water or SpO₂; purple/indigo for sleep; amber/orange for warnings and stress. Keep the mapping consistent within a face. Always pair colour with an icon or label so colour-blind users (about 8% of men, a commonly cited figure) are not excluded.
- Dark mode is the native mode on AMOLED. "Light" watch faces with white backgrounds are high-power, raise burn-in risk, and should not be the default.

### Gaps
- I found no authoritative source specifying health-metric colour standards. The conventions above are unsourced observations.
- Whether the specific target device's display path is RGB565 end to end, or the panel and driver is 24-bit, was not determined. Banding only applies where the framebuffer is 16-bit.

---

## 4. Layout on circular displays: safe areas, radial symmetry, complications, curved text, hierarchy, density

### Takeaway
Time first. Keep essential content inside the bezel-safe circle, use the 12/3/6/9 radial positions and the outer ring for arcs and curved text, and cap visible complications. Google's performance guidance says fewer than 8; professional faces typically show 3 to 6 data points. Apple's most expressive 2025 faces show zero.

### Cited Findings
- "Stay within the bezel… minimize essential elements being cropped or covered by the bezel." — [Wear OS design: Watch faces](https://developer.android.com/design/ui/wear/guides/surfaces/watch-faces)
- WFS optimisation tips: keep **fewer than 8 complications visible** in both ambient and normal modes, and remove components that are not visible. — [Watch Face Studio optimization tips](https://d.android.com/training/wearables/wfs/performance-tips)
- Wear OS added the **Arc Text** type role for fixed-height titles and descriptors along the curved edge. — [Wear OS design: Typography](https://developer.android.com/design/ui/wear/guides/styles/typography)
- M3 Expressive favours round-native components, such as an **edge-hugging bottom button** whose curve matches the display, and list items that **shrink near the top and bottom edges** (TransformingLazyColumn). — [Android Developers Blog, Aug 2025](https://android-developers.googleblog.com/2025/08/introducing-material-3-expressive-for-wear-os.html)
- WFS complication types are short text, monochromatic image, ranged value, long text, small image and large image. Short-text layouts are Icon+Text+Title, Text+Title, Icon+Text, and Text. If a provider supplies no icon, that slot stays blank. Use a 0%-opacity bounding shape so components do not shift between layouts. — [Samsung Developers: complication layouts (2022)](https://developer.samsung.com/sdp/blog/en/2022/09/20/things-to-consider-when-designing-complication-layouts) **[older]**
- watchOS 26 artistic faces such as **Flow, Artist and Flux have zero complications**, according to a fan guide rather than Apple. — [the5krunner: watchOS 26 faces guide](https://the5krunner.com/2025/11/03/watchos-26-apple-watch-faces-guide/)
- Some Pixel Watch 4 faces are described as "quite information-dense". — [Android Authority: Pixel Watch 4 faces APK teardown](https://www.androidauthority.com/google-pixel-watch-4-watch-faces-apk-teardown-3603416)

### Inferences (geometry is calc)
- **Safe zones on 480 px:**
  - Treat r ≤ 225 px (a 15 px inset) as the absolute content limit for arcs and ticks.
  - Keep r ≤ 210 px for curved text baselines, with glyph tops at r ≤ about 222.
  - Keep horizontal text blocks within the chord: a line centred 60 px from the edge is only about 317 px wide, and one 30 px from the edge is only about 232 px wide.
  - On devices with a physical rotating or raised bezel, or a domed glass edge, add another 8 to 16 px.
- **Radial structure:**
  - The outer ring (r 200 to 230) holds progress arcs, ticks and curved labels.
  - The middle band (r 90 to 200) holds 2 to 4 complications at 12, 3, 6 and 9 o'clock, or at 10 and 2 plus 4 and 8.
  - The centre holds the time.
  - Place digital time slightly above centre, with its optical centre about 10 to 30 px up, leaving the lower half for a data row. Keep left-right symmetry. Asymmetry should be intentional and balanced by weight.
- **Hierarchy recipe:** have 3 tiers only. The time should be about 3 to 5 times the cap height of primary data, and primary data about 1.5 times the labels. The time should be the brightest and highest-contrast element. Data should sit at 70 to 90% white or accent, and labels and units at 50 to 60% grey, while still at ≥4.5:1.
- **Density limits:** a "clean" face has the time plus 1 to 3 data points. A "pro/info-dense" face has the time plus 4 to 7. More than 8 hits Google's performance ceiling and clutters at a 1 to 2 second glance. Each complication needs a minimum tap target of about 48 dp, the Android general guideline (not sourced here), which is about 96 px at density 2.0.
- **Curved text:** run text clockwise on the top arc and counter-clockwise on the bottom arc, so both read upright. Track it wider (+5 to 10%), because curvature visually tightens letter spacing on the inner side. Keep it short, about 12 to 16 characters for a 90° arc at r = 210 (arc length about 330 px).

### Gaps
- I found no official Wear OS or Samsung spec giving round-screen safe-area insets in px for 480x480. The values above are geometric derivations.
- Apple HIG watchOS pages could not be fetched (JS-rendered), so Apple's complication size specs are missing.

---

## 5. Data visualization: arcs, rings, segmented gauges, sparklines

### Takeaway
Arcs and rings are the native round-screen chart. Use a dim track with a bright fill, round end-caps, a visible gap between arc ends, and a distinct overflow treatment when values exceed 100%. Segmented arcs suit discrete goals. Stroke must be thick enough to read at a glance, at roughly 4 dp or more (about 8 px or more on this screen).

### Cited Findings
- Wear Compose Material 3 `CircularProgressIndicator` exposes `colors` (track and indicator brushes), `strokeWidth` and `gapSize`. `gapSize` defaults to a value derived from stroke width and is the space between the arc ends and the track, excluding end-caps. — [Android reference: Wear M3 CircularProgressIndicator](https://developer.android.com/reference/kotlin/androidx/wear/compose/material3/CircularProgressIndicator.composable)
- Progress above 1.0 **wraps around** and is drawn with a separate `overflowTrackBrush`. This gives a platform pattern for "goal exceeded". — [Android reference](https://developer.android.com/reference/kotlin/androidx/wear/compose/material3/CircularProgressIndicator.composable)
- `startAngle` is measured clockwise from 3 o'clock, so 90° is 6 o'clock. A `SegmentedCircularProgressIndicator` splits the ring into equal segments with the same stroke and gap controls. — [Android reference: SegmentedCircularProgressIndicator](https://developer.android.com/reference/kotlin/androidx/wear/compose/material3/SegmentedCircularProgressIndicator.composable)
- A Wear guide example uses `strokeWidth = 4.dp`, `startAngle = 290f`, `endAngle = 250f`. That is an open ring with a gap at the bottom, leaving room for a label. — [Wear Compose progress indicator guide](https://d.android.com/training/wearables/compose/progress-indicator) **[older]**
- Graphical progress indicators should have ≥3:1 contrast against adjacent colours (WCAG 1.4.11). — [W3C SC 1.4.11](https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast.html)

### Inferences
- **Stroke widths on 480 px (calc):**
  - The outer bezel arc should be 8 to 14 px (about 4 to 7 dp).
  - Concentric nested rings should be 10 to 16 px each, with a 4 to 8 px gap between rings.
  - Small inner complication rings (diameter 80 to 110 px) should be 5 to 8 px.
  - Anything under about 4 px reads as a hairline and can disappear in sunlight.
- **Track vs. fill:** make the track the same hue at about 20 to 35% opacity, or a dark grey of about #2A2A2A to #3A3A3A. Make the fill the full accent colour. The fill must contrast clearly with the track, not just with black.
- **End caps:** use round caps for progress, which feels friendly and hides aliasing. Use butt or flat caps for segmented gauges and tick-like scales. Round caps extend the arc by half the stroke width at each end, so subtract that from the angular length to keep values honest.
- **Arc geometry:**
  - Use open arcs (about 240° to 300°) with the gap at 6 o'clock to host a value or icon.
  - Use bilateral symmetric arcs (left and right, each about 120°) for two metrics.
  - Show at most 3 nested rings before they become unreadable.
- **Segmented gauges:** use 5 to 12 segments for discrete scales (battery, hydration, zones). Gaps of 2 to 4° work for small counts; use 1 to 2° for more segments.
- **Sparklines:** use them only for short trends, such as heart rate or steps over the last 6 to 12 hours. Make them 120 to 200 px wide, place them in the lower chord where width allows, use a line of ≥3 px, and drop axes. Highlight the latest point with a dot.
- **Sliders and markers:** use a pointer or dot on an arc for "current within range", for example a UV index or battery dot. Give the marker a 2 px black stroke for separation from the fill.

### Gaps
- The default stroke width of the Wear M3 `CircularProgressIndicator` was not stated in the reference.
- No watch-face-specific (Watch Face Format) stroke recommendation was found.
- No empirical study on arc legibility on watches was found.

---

## 6. AMOLED power and burn-in; AOD design patterns

### Takeaway
AMOLED power scales with lit pixels and their brightness. White costs the most, and black pixels are essentially free. Always-on (AOD) faces must keep the share of lit pixels (on-pixel ratio, OPR) at **≤15%**; Samsung may reject faces that go "significantly" over. For burn-in, keep about 95% of pixels black in AOD and use outlines rather than fills, hollow hands, no large static white areas, and rely on the system's pixel shifting.

### Cited Findings
- "AoD watch faces must illuminate **15% or less of the pixels**." — [Wear OS design: Watch faces](https://developer.android.com/design/ui/wear/guides/surfaces/watch-faces)
- Samsung WFS: use no more than 15% of available pixels in AOD. "If your watch face uses **significantly more than 15%**… it can be rejected." WFS auto-generates an AOD version. Samsung advises finalising AOD first and then designing normal mode. — [Samsung WFS user guide: Always-on](https://developer.samsung.com/watch-face-studio/user-guide/always-on.html)
- Android guidance says the system **shifts screen contents periodically by a few pixels** to avoid burn-in. It recommends keeping about **95% of pixels black** in ambient mode, using outlined shapes instead of solid fills, and a **hollow centre on analog hands**. It also says to avoid solid white areas when burn-in protection is required. — [Android: Always-on apps and system ambient mode](https://developer.android.com/training/wearables/always-on); [Android watch faces design (archived)](https://iut-fbleau.fr/docs/android/design/wear/watchfaces.html) **[older for the 95% figure]**
- Google said visible image retention on Pixel Watch is a **non-permanent** OLED effect, "not a precursor to burn-in". This is a secondhand report. — [9to5Google](https://9to5google.com/?p=533204)
- AnandTech (Galaxy S6 AMOLED): **white is the most power-hungry colour** because all sub-pixels emit at high level. Black and white patterns at a given average picture level (APL) consume more than an equal grey or mixed image at the same APL. — [AnandTech: Analysing AMOLED power efficiency](https://www.anandtech.com/show/9394) **[older, 2015]**
- An academic QVGA OLED measurement found **3 W for black text on white vs. 0.7 W for white text on black**. Power is nonlinear in colour intensity. — cited in [Apple v. Samsung court exhibit](https://docs.justia.com/cases/federal/district-courts/california/candce/5:2011cv01846/239768/174/2.html) **[older]**
- Phone measurements show OLED power often violates simple monotonic or additive models. White can draw less than the sum of R+G+B. — [USPTO patent: profiling display power](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/11532271)
- Dell XPS 15 OLED at max brightness: white used up to **~9 W more than green, blue or red**, and **~14 W more than all-black**. — [Notebookcheck](https://www.notebookcheck.net/Dell-XPS-15-7590-OLED-Power-Consumption-Measurements-White-Can-Be-Almost-Two-Times-More-Demanding-Than-Other-Colors.430835.0.html) **[older]**
- WFS performance tips: make the face "as dark as possible", avoid extensive masking, use WebP rather than GIF for animation, and use low frame rates sized to the screen. Lottie is unsupported since WFS 1.4.13. — [WFS optimization tips](https://d.android.com/training/wearables/wfs/performance-tips)

### Inferences
- **(calc)** The 480x480 round active area is about 180,956 px (π·240²). 15% is about **27,100 lit px** and 5% is about **9,050 px**.
  - A 150 px tall bold time like "10:08" can by itself light 12,000 to 20,000 px.
  - So AOD time should use an outline or a thin variable-font weight, a smaller size (about 90 to 120 px), or a dimmed colour.
  - Count partially-bright pixels by their luminance, since some OPR checkers weight by brightness.
- **AOD pattern checklist:**
  - Use the same layout as interactive mode, so the change does not jar.
  - Keep the time, and keep at most 1 or 2 complications.
  - Remove the seconds hand, backgrounds, images and gradients.
  - Use outlined numerals or a thin weight.
  - Keep colours at about 40 to 60% brightness, with no large white areas.
  - Make hands hollow or thin.
  - Keep no element static in exactly one spot for hours; vary micro-position if the platform does not shift pixels.
- **Burn-in risk ranking in interactive mode:**
  - High: static bright logos, unchanging white rings and tick marks, and solid-filled hero shapes.
  - Low: values that change and dim accents.
- Mid-tone accents (e.g. amber, cyan) at moderate brightness cost far less than white. When choosing the colour of a large element, prefer a saturated, mid-lightness hue over white.

### Gaps
- I found no recent (2024-2026) smartwatch-specific measurements of mW per lit pixel by colour.
- Blue OLED sub-pixels age fastest, a commonly cited claim that was not sourced here.

---

## 7. Trends 2025-2026 and what separates professional from amateur faces

### Takeaway
2025-2026 brought **Material 3 Expressive** on Wear OS (Aug 2025), with variable and rounded type, shape-morphing and watch-face-driven system colour, and **Liquid Glass** on watchOS 26 (Sept 2025), with translucent refractive numerals. Liquid Glass showed legibility problems on busy backgrounds. The market splits into bold, minimal, expressive faces (Flow, Bold, big numerals) and information-dense "pro" faces. Professional work shows clear hierarchy, restraint and rigorous AOD and performance discipline.

### Cited Findings
- **Material 3 Expressive for Wear OS** (Aug 25 2025): it uses variable fonts, buttons that change shape and size for springy motion and state contrast, edge-hugging components, and dynamic colour extracted from the watch face. — [Android Developers Blog](https://android-developers.googleblog.com/2025/08/introducing-material-3-expressive-for-wear-os.html)
- **Pixel Watch 4** (2025) shipped 8 new faces, including "Rushhour", "Bold" and "Arts & Culture", some quite information-dense. It uses a rounder Roboto Flex and playful animations suited to the domed display. — [Android Headlines](https://www.androidheadlines.com/2025/10/the-pixel-watch-4-is-bringing-8-new-watch-faces-to-wear-os.html); [Android Authority hands-on](https://www.androidauthority.com/google-pixel-watch-4-hands-on-preview-3587950)
- An October 2026 Pixel Watch 4 update reportedly added an **AI watch face generator**. Search results were inconsistent on dates, so verify before using. — [9to5Google, Oct 2026](https://9to5google.com/2026/10/09/pixel-watch-4-update-adds-ai-face-generator/)
- **watchOS 26** (Sept 2025) added four new faces. Liquid Glass was applied sparingly: the Photos face time style, and the new **Flow** face, whose "Liquid Glass numerals… refract a fluid orb of color that responds to wrist movements". — [MacRumors](https://www.macrumors.com/2025/09/10/watchos-26-adds-four-new-apple-watch-faces/)
- Legibility critique: Six Colors found the Liquid Glass numerals "harder to read when against a bright or varied background". The effect can be turned off to return to watchOS 11 legibility. — [Six Colors watchOS 26 public beta first look](https://sixcolors.com/post/2025/07/first-look-watchos-26-public-beta/)
- Apple's support notes list the Liquid Glass redesign as covering the Smart Stack, Control Center, the Photos face and in-app controls. — [Apple Support: About watchOS 26 updates](https://support.apple.com/en-gu/123002)
- Broader (mechanical) watch design trend: alongside a resurgence of "sleek, minimalist designs", bold and colourful dials became "long term design pillars". — [T3](https://t3.com/features/5-watch-trends-that-will-stand-the-test-of-time-according-to-watch-experts); [Outlook India Luxe](https://luxe.outlookindia.com/watches-jewellery/watches/luxury-watches-in-2025-trends-every-collector-should-know)
- Apple Watch face trends lean toward themes inspired by movies, games, retro and futuristic designs. — [Benzinga](https://benzinga.com/z/43571030)
- General design failures are "unclear hierarchy (people don't know what matters)" and "cramped layouts (everything fights for attention)". — [Adobe Express: common graphic design mistakes](https://www.adobe.com/de/express/learn/blog/common-graphic-design-mistakes)
- A forum anecdote reports lag after adding more than 3 image-swap options, such as hand styles, in WFS. This is anecdotal, not an official limit. — [Samsung developer forum](https://forum.developer.samsung.com/t/watch-faces-and-lagging-watch/30541)

### Inferences: amateur vs. professional checklist
Amateur tells:
1. Time is not dominant, or it competes with complications of similar size or brightness.
2. There are too many colours: 4 or more accents, or rainbow rings with no meaning.
3. Text is below about 20 px or uses Thin weights, and is unreadable at a glance or in sun.
4. Labels or arcs are clipped by the circle or bezel, or rectangular layouts are crammed into a round screen.
5. Proportional digits jitter as seconds or steps change.
6. Photo or texture backgrounds kill contrast. This is the same failure Six Colors noted with Liquid Glass.
7. Gradient banding or contour rings appear, from un-dithered RGB565 assets.
8. AOD is lazy: the interactive face is just dimmed, which breaks the 15% OPR limit, or AOD is unrelated to the interactive layout.
9. Icons have inconsistent styles, stroke weights or sizes, for example mixing filled and outline sets.
10. Empty complication slots leave holes, from not designing the no-data and empty-icon states.
11. There are too many options, animations and assets, causing lag and battery drain.

Professional tells:
1. Three-tier hierarchy, with the time first.
2. One type system: display numerals plus one data sans, with tabular figures.
3. A one- or two-accent palette on true black, with a consistent health colour mapping.
4. A round-native composition: radial symmetry, outer arcs, curved text.
5. Carefully designed AOD, with outlines and ≤15% OPR.
6. Every state tested: empty data, max values such as 5-digit steps and 3-digit heart rate, 12h/24h, localisation, and font scaling of ±6% steps.
7. Real-device review in sunlight and at arm's length.

The "bubble numeral" / bold rounded trend is consistent with M3 Expressive's rounder, variable type and with Pixel's "Bold" faces. Execution should still respect AOD pixel budgets, for example by showing an outline version in AOD.

### Gaps
- I found no authoritative 2025-2026 article that explicitly names a "bubble numerals" trend. The connection is inferred from M3 Expressive and Pixel Watch 4 faces.
- Liquid Glass applies to Apple platforms only. Imitating it on RGB565 AMOLED needs blur and refraction, which is costly and banding-prone; no source was found on this.

---

## 8. Insights from experienced watch face designers and communities (Facer, WatchMaker, WFS, Dribbble/Behance)

### Takeaway
The accessible designer-community material available in this session is thin. What exists centres on performance discipline, darkness, consistent layouts across complication states, and testing on real devices. Specific Facer, WatchMaker and Dribbble case studies could not be retrieved.

### Cited Findings
- Samsung's "Devs Doing It Right" series features Infinity Watchfaces owner Chris Shomo's tips for watch face designers. — [Samsung Developers blog (2018)](https://developer.samsung.com/sdp/blog/en/2018/03/15/devs-doing-it-right-2-infinity-watchfaces-owner-chris-shomo-offers-helpful-tips-on-what-every-designer-needs-to-watch-out-for) **[older; content not fetched]**
- Samsung: "How to develop watch face designs that stand the test of time". — [Samsung Developers blog (2018)](https://developer.samsung.com/sdp/blog/en/2018/04/10/how-to-develop-watch-face-designs-that-stand-the-test-of-time) **[older; content not fetched]**
- WFS FAQ: use darker colours, fit images to the screen, and remove all unused layers before building. — [Samsung WFS FAQ](https://developer.samsung.com/watch-face-studio/faq.html)
- Keep component positions stable across complication layouts with an invisible bounding shape (see section 4). — [Samsung Developers (2022)](https://developer.samsung.com/sdp/blog/en/2022/09/20/things-to-consider-when-designing-complication-layouts) **[older]**
- Google watch face principles: "Time-telling, Expressive, Useful". Offer customisation of colourways, hands and complications. — [Wear OS design: Watch faces](https://developer.android.com/design/ui/wear/guides/surfaces/watch-faces)

### Inferences
- A good professional workflow:
  1. Design at 1:1 on a 480 px canvas with a circular mask and a safe-ring overlay.
  2. Preview at actual physical size, about 36 mm, on a phone or the device.
  3. Design AOD first, following Samsung's recommendation.
  4. Build colourway presets rather than free colour pickers. Curated palettes protect contrast.
  5. Ship 3 to 6 curated colourways and limit hand and style swaps to keep performance up.

### Gaps
- The Medium "Ultimate Guide to designing a watch face for Wear OS" (ooglywatch) returned 403.
- Facer and WatchMaker community guides, and Dribbble/Behance case studies with concrete numbers, were not retrieved within the tool budget. A follow-up search is recommended if designer-voice quotes are required.
- Apple HIG watchOS pages (typography sizes, complication families) were not retrievable via fetch because they are JS-rendered.
