# Huawei watch face design standards, compared with Amazfit/Zepp OS, Xiaomi and Garmin (target: 480x480 1.43" round AMOLED)

Research date: 2026-11-24. Most Huawei pages are undated "living" docs on developer.huawei.com. The Theme Studio Pro page names HarmonyOS 7.0 as upcoming, so it is current for 2025-2026. Items known to be older are marked **[OLDER]**. Huawei's authoritative "HUAWEI/HONOR Watch Face Design Specification" page (developer.huawei.com/consumer/en/doc/distribution/content/5050304) returned HTTP 503 and could not be read, so its contents are listed as a gap.

## 1. Huawei Theme Studio / watch face specifications (resolutions, safe zones, elements, formats, limits, AOD, review)

### Takeaway
Huawei faces are built in Theme Studio / Theme Studio Pro (Windows), exported as `.hwt` packages and sold through HUAWEI Themes and HUAWEI Health. The main premium round canvas is 466x466. There is no native 480x480 round capability set: the round sets are 466, 454 and 390, and 408x480 / 336x480 are rectangular.

AOD rules are numeric:
- Non-black pixels must be 20% or less of the screen in Theme Studio Pro, and 60% or less within any 200x200 area.
- Active-mode backgrounds are rejected as "power-intensive" if more than 50% of pixels are "overly bright".
- Animated backgrounds are capped at 10 MB.

### Cited Findings

**Platform, distribution and elements**
- A watch face is "the screen shown on Huawei smart watches or bands when the display is on or off". Faces are designed in Theme Studio and distributed through the watch face store in the HUAWEI Themes and HUAWEI Health apps. — [Huawei Watch Face Overview](https://developer.huawei.com/consumer/en/doc/content/watch-face-introduction-0000001566918497)
- Element taxonomy:
  - Background: mandatory, static or dynamic.
  - Time: mandatory (hour, minute, second).
  - Date: optional (month, week, day of week).
  - Data: optional (battery, steps, calories, heart rate, stress, weather).
  - One resource package contains both the active face and the AOD face. — [Huawei Watch Face Overview](https://developer.huawei.com/consumer/en/doc/content/watch-face-introduction-0000001566918497)
- The active face appears on wrist raise, crown press or tap, then turns off after a short period. The AOD face shows limited info continuously, and only on models that support AOD, after the user enables it. — [Huawei Watch Face Overview](https://developer.huawei.com/consumer/en/doc/content/watch-face-introduction-0000001566918497)

**Resolutions**
- Capability-set resolutions: 466x466; 390x390 or 454x454; 280x456 or 336x480; 194x368; 408x480; 286x482. — [Huawei Watch Face Overview](https://developer.huawei.com/consumer/en/doc/content/watch-face-introduction-0000001566918497); [Theme Studio Pro creation instances](https://developer.huawei.com/consumer/en/doc/content/production-example-pro-0000001633927109)
- Spec versions:
  - The 466x466 example supports spec versions 2.y and 1.y.
  - 466x466 (v2.4) "Selected Layer" data is currently limited to week and emotion, with "more data promised in HarmonyOS 7.0".
  - 408x480 (v2.1) supports AM/PM, twelve shichen, lunar month, week, month, moon phase, heart-rate zone, emotion and stress level.
  — [Theme Studio Pro creation instances](https://developer.huawei.com/consumer/en/doc/content/production-example-pro-0000001633927109)
- The background must match the face's dimensions and shape. Example: for the 454x454 HUAWEI WATCH GT 2 the background must be 454x454 and circular. — [Huawei Watch Face FAQ](https://developer.huawei.com/consumer/en/doc/content/watchface-faq-0000001174035539)

**Theme Studio codelab (466x466 analog example)**
- Watch type is Smart Watch, resolution 466x466, and an English title is required.
- Hands are PNGs, all positioned at the center (233/233), angle 0-360:
  - Hour hand ("Hour 12 Ratio"): rotate point 17/104.
  - Minute hand: rotate point 17/196.
  - Second hand: rotate point 4/165.
- Clock center cap is a separate single-res PNG at 215/215.
- Weather uses a batch of 28 icon images inside a container. Temperature text example: Roboto-Medium, size 20, #FFFFFF, right-aligned, width 50.
- Background video is imported as MP4.
- AOD is built by entering "AoD Mode", adding a background image and using "Copy Layer" to copy the hour, minute and center layers.
- Output is a `.hwt` file, tested by sideloading through HUAWEI Health signed in with a HUAWEI Developers ID.
- Requires Windows 10.
— [Huawei Theme Studio codelab](https://developer.huawei.com/consumer/en/codelab/theme-Watchface/index.html)

**Theme Studio Pro element types and limits**
- Backgrounds:
  - Single image. Overly bright images cannot be exported, and "white-heavy or highly saturated images increase battery drain".
  - "Selected image": up to 5 static backgrounds that the user switches by tapping.
- Animated GIF: 466x466, ≤10 MB, 5-10 s, 15-30 fps, one per face.
- Video (MP4 H.264, no audio track):
  - WATCH series: 466x466, ≤10 MB, 5-10 s (minimum 1 s), 25-30 fps, up to 3 videos.
  - GT/FIT series: ≤10 MB, 1-5 s (3 s recommended), 24 fps, bitrate ≤6000 kbps recommended, 1 video, no B-frames.
- PNG sequence frames:
  - Cross-series (WATCH/GT/FIT) faces: ≤30 frames, and ≤200x200 px under spec v2.1 (larger allowed from v2.4).
  - WATCH-only faces may exceed both limits.
  - Each frame is recommended under 40 KB, and all frames must have identical dimensions.
  - Playback can be once or loop, with a set frame interval and delay.
- Time:
  - Analog: Hour 12 Ratio, Minute Ratio and Second Ratio hands, plus an optional decorative dot. Hands must be drawn pointing to 12 o'clock. Default position at 466 is (233, 233).
  - Digital: digit image sets for Hour High (0-2), Hour Low (0-9), Minute High (0-5) and Minute Low (0-9).
  - Multi-group sequence frames (digital only): 2-10 frames per digit, for animated digit transitions.
- Date: text-based or image-based. A "-" fallback image must match the digit image size. Lunar calendar controls are available.
- Data widgets:
  - Battery: value with %, an enum image set, or a ratio arc.
  - Heart rate: icon, value and ratio arc.
  - Weather: 28 types (an 11-type set is also supported). The "unknown" icon is a cloud with a question mark. Temperature is in °C or °F and needs both unit icons.
  - Steps: arc text and an arc image ("Steps Ratio").
- Arc parameters are start/end angle (clockwise or counterclockwise), center, arc width and radius (= inner radius + half the arc width). The arc must fully cover the graphic.
— [Theme Studio Pro creation instances](https://developer.huawei.com/consumer/en/doc/content/production-example-pro-0000001633927109)

**AOD in Theme Studio Pro**
- Modes are "Full-bright" (default) and "Screen-off".
- Maximum 30 layers.
- No sequence frames, video or GIF.
- The AOD package cannot be exported alone; it must ship with the active face.
- Non-black pixels must be ≤20% of the full screen and ≤60% within any 200x200 px area. Spread bright areas out rather than clustering them.
- Pro shows the live non-black percentage at the bottom of the page after a refresh.
— [Theme Studio Pro creation instances](https://developer.huawei.com/consumer/en/doc/content/production-example-pro-0000001633927109)
- The FAQ gives the AOD non-black limit as "10% or 20%" of total pixels without saying which case gets which. — [Huawei Watch Face FAQ](https://developer.huawei.com/consumer/en/doc/content/watchface-faq-0000001174035539). Conflict: Pro says 20%; designers should plan for 10% to be safe.

**Brightness and review rejections**
- A pixel is "overly bright" if R > 168, G > 168, B > 128 and A > 168.
- A face is "excessively bright" if more than 50% of its pixels are overly bright. It then gets a "power-intensive" re-edit message, and the fix is to add more black.
- AOD faces with too many non-black pixels are flagged.
- WATCH-series faces are rejected if weather, steps, heart rate, calories, stand-up times, sleep, distance, moderate-to-high-intensity activity, altitude, pressure, VO2max or stress data is not placed in **containers**. Containers make the data tappable. A full-screen heart-rate container caused misdirected taps, fixed by setting its size to 0.
— [Huawei Watch Face FAQ](https://developer.huawei.com/consumer/en/doc/content/watchface-faq-0000001174035539)

**Assets, naming and data support**
- WATCH FIT backgrounds and thumbnails must be 32-bit PNG.
- Each animated background needs one preview PNG at full resolution (e.g. 466x466). The number of preview pictures must match the number of videos or GIFs.
- Face and designer names cannot contain Chinese characters.
- WATCH GT and WATCH series do not support AQI data.
— [Huawei Watch Face FAQ](https://developer.huawei.com/consumer/en/doc/content/watchface-faq-0000001174035539)

**Phone AOD themes (separate product, phone-oriented)**
- Package < 50 MB.
- Non-black pixels < 15%.
- Preview time 08:08.
- Pure-colour and QR-code images are rejected. Previews must match the real display and text must be legible.
- Paid themes must number 3x the free themes.
- Non-mainland packages end with "EN" and contain no Chinese characters or lunar dates.
— [Huawei AOD Test Specifications](https://developer.huawei.com/consumer/en/doc/content/aod-test-0000001056821215)

**[OLDER, c. 2020] Band spec**
- 120x240, Honor Band 5 only.
- Previews: cover.jpg 480x960 ≤200 KB and icon_small.jpg 390x390 ≤200 KB, showing 10:08:36.
- PNG slices named sequentially (A100_001.png…).
- Widget types: SINGLEIMAGE, DIGITALIMAGE, MUTILLANGUAGE, MUTILWIDGET.
- Package `.hwt` with an alphanumeric name. Selling requires designer permission on the HUAWEI account.
— [Huawei Band Watch Face Design Guidance](https://developer.huawei.com/consumer/en/doc/band-specification)

**Built-in face behaviour and AOD logic**
- If a face ships its own AOD, it overrides the user's AOD style setting. In HUAWEI Health a two-page preview indicates a bundled AOD. — [Huawei support: AOD style settings do not take effect](https://consumer.huawei.com/en/support/content/en-us15818743/)

### Inferences
- For a 480x480 target, design at 466x466 if targeting Huawei. Otherwise scale the 466 coordinates by about 1.03 (480/466); centre becomes (240, 240) instead of (233, 233). Rebuild hands at native size rather than resampling, so their edges stay crisp.
- To pass review and feel "premium" on Huawei:
  - Put every health and weather datum in a tappable container.
  - Keep the background mostly dark (more than 50% of pixels below the "overly bright" threshold).
  - Build a dedicated AOD at ≤10-20% non-black pixels, spread out so no 200x200 block exceeds 60%.
- Motion budget: video loops of 3 s at 24 fps (GT) or 5-10 s at 25-30 fps (WATCH), ≤10 MB. Sequence frames are ≤30 frames of ≤40 KB each when targeting GT/FIT.

### Gaps
- The full HUAWEI/HONOR Watch Face Design Specification (5050304) returned 503. Still missing: safe-zone margins, minimum font sizes, `.hwt` total package size limit, preview/thumbnail sizes for 466 faces, and the Color/Style/Control Customization and "DoF Effect" pages, which are listed in the Pro sidebar but were not retrieved.
- No source found giving a maximum `.hwt` package size for watch faces. The 50 MB limit applies to phone AOD themes only.

## 2. HarmonyOS design language for wearables (typography, sizes, colors, round layout)

### Takeaway
Huawei's official wearable typography and size tables were not retrievable. Confirmed facts:
- HarmonyOS Sans has an optical-size axis aimed at small wearable text.
- Huawei's own codelab uses Roboto-Medium 20px at 466 for small data text.
- A secondhand source cites 466px as the round design baseline.
Zepp's published minimum (22px font, 1px lines) is the best concrete numeric proxy.

### Cited Findings
- HarmonyOS Sans was designed with an "Optical Size" axis for better reading of small text on devices including wearables. — [Wikipedia: HarmonyOS Sans](https://www.wikipedia.org/wiki/HarmonyOS_Sans)
- A third-party HarmonyOS NEXT UX article cites 466px logical pixels as the design baseline for round dials. This is secondhand. — [DEV Community: UX design principles for HarmonyOS NEXT circle/rectangle watches](https://dev.to/harmonyos/ux-design-principles-for-harmonyos-next-circle-rectangle-watches-4bh9)
- Huawei's codelab temperature text is Roboto-Medium, size 20, #FFFFFF on a 466 face. — [Huawei Theme Studio codelab](https://developer.huawei.com/consumer/en/codelab/theme-Watchface/index.html)
- Theme Studio Pro warns that white-heavy or highly saturated backgrounds increase battery drain. — [Theme Studio Pro](https://developer.huawei.com/consumer/en/doc/content/production-example-pro-0000001633927109)
- Wear OS guidance, for comparison: round screens need larger text margins, and designs should be tested at 192dp with larger font sizes. — [Android Developers: Wear screen sizes](https://developer.android.com/design/ui/wear/guides/foundations/screen-sizes?hl=zh-cn)

### Inferences
- Use HarmonyOS Sans, or a similar humanist grotesque with tabular numerals, for data text. Use about 20-22px minimum at 466-480 for secondary data, and much larger weights for time.

### Gaps
- The official HarmonyOS wearable design pages (type scale, spacing, colour tokens for round screens) were not retrieved. Search results pointed to developer.huawei.com wearable design overview pages, but their content was not seen.

## 3. What makes Huawei premium faces look high-end; trends 2024-2026

### Takeaway
Concrete design-analysis sources for Huawei premium faces were sparse. The evidence available is indirect:
- Reviews stress Swiss-watch-like hardware and colourful, legible faces.
- Built-in faces drop to black backgrounds to save battery.
- The tooling now supports video and GIF backgrounds, sequence-frame digit animation, "DoF Effect" (depth of field), tap-switchable backgrounds, and colour/style customization. These are the levers of "premium" faces.

### Cited Findings
- GT 5 Pro (2024) styling "wouldn't look out of place on a high-end Swiss watch". Titanium body for the 46 mm, nanocrystal ceramic for the 42 mm. — [Expert Reviews](https://www.expertreviews.co.uk/beauty-wellness/wearables/huawei-watch-gt-5-pro-and-gt-5-review); [Huawei GT 5 Pro page](https://consumer.huawei.com/uk/wearables/watch-gt5-pro/)
- GT 5 Pro marketing: 13 new watch face themes, including panda-themed faces that reflect your mood. — [Huawei UK GT 5 Pro](https://consumer.huawei.com/uk/wearables/watch-gt5-pro/)
- GT 6 Pro (late 2025): built-in faces switch to a black background to save battery while still showing complication data. — [GSMArena GT 6 Pro review](https://m.gsmarena.com/huawei_watch_gt_6_pro_review-news-69885.php)
- Wareable says the colourful HarmonyOS interface makes faces stand out and stay readable outdoors. — [Wareable GT 6 Pro](https://www.wareable.com/smartwatches/huawei-watch-gt-6-pro-review)
- Reviews disagree on face monetisation: TechRadar says most faces must be bought, while PhoneArena says most are free with some paid. — [TechRadar](https://www.techradar.com/health-fitness/smartwatches/huawei-watch-gt-6-pro-review); [PhoneArena](https://www.phonearena.com/reviews/huawei-watch-gt6-pro-review_id7671)
- Face selection outside China is "fairly limited". — [GSMArena GT 6 Pro review](https://m.gsmarena.com/huawei_watch_gt_6_pro_review-news-69885.php)
- GSMArena headline: Huawei's Watch Face Store "now boasts over 100,000 watch faces" (2025). The article body was paywalled and not read. — [GSMArena](https://m.gsmarena.com/huaweis_watch_face_store_now_boasts_over_100000_watch_faces-news-69777.php)
- Tooling features: Selected Layer (backgrounds per weekday or emotion), "emotion" data on 466 v2.4, multi-group sequence-frame digits, up to 3 videos on WATCH series, and sidebar entries for Color Customization, Style Customization, Control Customization, Accessibility Features and DoF Effect. — [Theme Studio Pro](https://developer.huawei.com/consumer/en/doc/content/production-example-pro-0000001633927109)

### Inferences
- Premium Huawei-style faces typically combine:
  - Photoreal material backgrounds (guilloché, ceramic, enamel, carbon) kept mostly dark to stay under the brightness threshold.
  - Layered hands with highlights and shadows in active mode, flattened to silhouettes in AOD.
  - A short ambient video loop or depth-of-field parallax.
  - Emotion- or weekday-reactive art (Selected Layer).
  - Multiple tap-switchable backgrounds and colour options.
  This is an inference from tool capabilities; no design-critique source confirmed it.

### Gaps
- No reliable 2024-2026 designer-community analysis of Huawei premium faces (e.g. Huawei Themes "designer program" featured faces) was found. No store bestseller data was found either, since the GSMArena article body was blocked.
- No official Huawei Watch 5 face-design notes were found.

## 4. Amazfit Zepp OS, Xiaomi, Garmin: legibility, AOD/low-power, burn-in, battery

### Takeaway
Zepp OS publishes the most designer-ready numeric rules, with explicit 480x480 support:
- 324x324 preview.
- 2px edge safe margin; keep the top and bottom free.
- 22px minimum font, 1px minimum line.
- AOD: #000000 background, white hands, no second hand, ≤10% lit pixels.

Garmin AOD is also ≤10% of pixels per update, updated once a minute, with burn-in protection that shifts static elements by up to 4px. No Xiaomi design documentation was found.

### Cited Findings
**Zepp OS / Amazfit**
- Preview thumbnail sizes:

  | Device resolution | Thumbnail |
  |---|---|
  | 480x480 | 324x324 |
  | 454x454 | 306x306 |
  | 416x416 | 280x280 |
  | 390x450 | 266x306 |

  — [Zepp Watchface Specification](https://docs.zepp.com/docs/watchface/specification/)
- Safe areas and cutting:
  - Safe distance of at least 2px from screen edges.
  - Reserve the top and bottom for status indicators and offline voice.
  - Elements of the same type use identical cutout sizes.
  - Pointer cutouts must have odd widths, with the rotation centre marked by a red block.
  — [Zepp Watchface Specification](https://docs.zepp.com/docs/watchface/specification/)
- Legibility:
  - Minimum font size 22px.
  - Dial lines at least 1px.
  - Preview time 10:09.
  - Hand stacking: second hand on top, then minute, then hour.
  - Digits may use negative spacing.
  — [Zepp watch face design guidance](https://docs.zepp.com/docs/designs/customization/watchface/)
- Default preview data:
  - Time 10:09:36 (hour hand 304°, minute hand 54°, second hand 216°).
  - HR 86, steps 8670, calories 280, battery 75%, temperature 22°C.
  — [Zepp Watchface Specification](https://docs.zepp.com/docs/watchface/specification/)
- AOD (screen-off):
  - Background #000000; main hand colour #FFFFFF, with as few extra colours as possible.
  - Lit pixels ≤10% of the screen.
  - No second hand.
  - Keep hand and digit sizes identical to active mode, and minimise element movement so nothing "jumps" when switching.
  - Recommended data priority after time: steps > date > weather > battery > heart rate > others.
  - Hands use one of two treatments, both with a 1-2px black outer stroke:
    - Silhouette: remove gradients, highlights and shadows.
    - White film: keep some structural light and shadow, rendered as an overall white effect.
  - Digital time gets a ≥2px white or high-lightness outline, which may be omitted if the lit area is under 10%.
  — [Zepp Screen-off mode](https://docs.zepp.com/docs/designs/specifications/screen-off-mode/); [Zepp Watchface Specification](https://docs.zepp.com/docs/watchface/specification/)
- Two AOD types exist: one follows the current face and must be designed separately by the designer; the other is chosen independently by the user. — [Zepp Screen-off mode](https://docs.zepp.com/docs/designs/specifications/screen-off-mode/)
- Wear OS comparison: AoD faces must illuminate 15% or less of pixels. — [Android Developers: watch faces](https://developer.android.com/training/wearables/design/watch-faces)

**Garmin Connect IQ**
- Power modes:
  - Low-power: updates once per minute.
  - High-power: after a wrist gesture, about 10 s, with timers and animations allowed.
  - Partial updates: only a small region refreshes each second, and each update must finish within 20 ms.
  — [Garmin CIQ UX Guidelines: Watch Faces](https://developer.garmin.com/connect-iq/articles/user-experience-guidelines/Watch_Faces.html)
- AMOLED always-on:
  - Updates once per minute, and each update may use at most 10% of display pixels.
  - Some devices add extra burn-in protection.
  - AMOLED faces should support always-on because some users disable the wrist gesture.
  — [Garmin CIQ UX Guidelines: Watch Faces](https://developer.garmin.com/connect-iq/articles/user-experience-guidelines/Watch_Faces.html)
- Burn-in:
  - Minimise static elements (e.g. the centre post of analog hands).
  - Shift static elements by up to 4 px in any direction every minute in always-on mode.
  - Avoid large white or blue areas (use light grey) and use thin-weight fonts.
  — [Garmin CIQ UX Guidelines: Watch Faces](https://developer.garmin.com/connect-iq/articles/user-experience-guidelines/Watch_Faces.html)
- Developer forum, citing CIQ 3.1 rules **[OLDER, c. 2019-2020]**: no more than 10% of pixels on, and no single pixel on for more than 3 minutes. — [Garmin forum](https://forums.garmin.com/developer/connect-iq/f/discussion/192673/how-to-enable-an-always-on-mode-for-venu-amoled/1253092)
- Always-on is disabled automatically when a face could cause burn-in, and developers report false triggers, so test on hardware. — [Garmin forum](https://forums.garmin.com/developer/connect-iq/f/discussion/424766/always-on-watch-face); [bug report](https://forums.garmin.com/developer/connect-iq/i/bug-reports/the-burn-in-protection-on-venu2-s-devices-with-ciq4-falsely-triggers-and-turns-off-the-display)

**Xiaomi**
- Xiaomi Watch S4 faces come from the Mi Fitness app's face market. One listing cites 200+ faces, some exclusive to bezel/strap sets and not downloadable. — [Xiaomi Watch S4](https://www.mi.com/global/product/xiaomi-watch-s4/)

### Inferences
- Common cross-platform AOD rules:
  - Lit pixels at 10% (Zepp, Garmin; Huawei FAQ lower bound) to 20% (Huawei Pro).
  - True black background.
  - No seconds.
  - Silhouette hands with a black separation stroke.
  - Thin outline digits.
  - Shift static marks by a few pixels per minute.
- Designing to 10% satisfies all platforms.

### Gaps
- No public Xiaomi watch face design spec or designer SDK was found (Xiaomi Watch S/HyperOS).
- Garmin has no published hard battery numbers; the guidelines give only qualitative statements.

## 5. Data widgets, progress arcs and customization across platforms

### Takeaway
All platforms treat data as typed widgets with fixed digit budgets and "empty" states. Progress is rendered as arcs or images:
- Huawei: ratio arcs.
- Zepp: `#_circle`, `#_line` and stage images (`#_stage_0..10`).

Customization is via tap-switchable backgrounds and Selected Layers (Huawei), or editable components (Zepp). Huawei's colour/style customization docs exist but were not retrieved.

### Cited Findings
- Huawei:
  - Ratio arcs exist for battery, heart rate and steps, defined by start/end angle, direction, centre, width and radius (= inner radius + half the width).
  - Battery can also be an enum image set.
  - Weather has 28 icon types plus °C/°F unit images.
  - Selected background holds up to 5 tap-switchable images.
  — [Theme Studio Pro](https://developer.huawei.com/consumer/en/doc/content/production-example-pro-0000001633927109)
- Huawei: data must sit in containers (tappable shortcuts) or the face is rejected. — [Huawei Watch Face FAQ](https://developer.huawei.com/consumer/en/doc/content/watchface-faq-0000001174035539)
- Zepp digit budgets:

  | Data | Max | Empty state |
  |---|---|---|
  | Steps | 5 | "0" |
  | Distance | 4 | "0" |
  | Calories | 4 | "0" |
  | HR | 3 | "- -" |
  | PAI | 3 | "0" |
  | Temperature | 5 incl. sign/degree | "- -" |
  | Humidity | 4 | "- -" |
  | Battery | 4 ("100%") | n/a |
  | Sunrise/sunset | 5 ("00:00") | "- -" |

  - Moon phase artwork comes in 7-, 13- or 30-day sets.
  - Status icons are required for DND, Bluetooth, screen lock and alarm.
  - AQI is not shown outside China; humidity replaces it.
  — [Zepp watch face design guidance](https://docs.zepp.com/docs/designs/customization/watchface/); [Zepp Watchface Specification](https://docs.zepp.com/docs/watchface/specification/)
- Zepp naming:
  - Linear progress `#_line`, circular progress `#_circle`, custom progress `#_stage_(0~10)`.
  - Progress sections: heart rate 6; calories, PAI, steps, temperature, humidity, UVI, AQI and battery 10.
  - Weather icon codes 0-28 (e.g. 3 Sunny, 25 Unknown, 28 Clear night).
  — [Zepp Watchface Specification](https://docs.zepp.com/docs/watchface/specification/)
- Samsung Watch Face Studio comparison: theme colour palettes and a Customization Editor for previewing colour/background combinations. — [Samsung Developers](https://developer.samsung.com/sdp/blog/en-us/2023/04/05/watch-face-studio-theme-color-implementation-basics)

### Inferences
- For a competitive 480x480 face, plan:
  - Fixed-width digit slots sized for the maximum digit budget (steps 5, HR 3, battery "100%").
  - Explicit empty-state glyphs ("--").
  - Arcs drawn as full-coverage images clipped by angle.
  - 3-5 colour themes or backgrounds.
  - Tappable data zones.

### Gaps
- Huawei's Color/Style/Control Customization pages, the number of allowed theme colours, and an editable-complication model equivalent to Wear OS were not retrieved.
