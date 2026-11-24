# Apple's Approach to Watch Face Design (watchOS HIG and signature faces) as a Benchmark

Scope note: the primary sources are Apple's Human Interface Guidelines (HIG), pulled as raw JSON from developer.apple.com on 2026-11-24, plus WWDC session pages, Apple Newsroom, and reputable press (MacStories, 9to5Mac, MacRumors). Apple's HIG covers *complications* and *shareable faces*. It does **not** publish design specs for Apple's own first-party faces, because third parties cannot build full watch faces on watchOS. The details on signature faces therefore come from Newsroom and press descriptions, not from specifications.

Unit conversion for the target device (my inference, see Inferences under Q1): Apple Watch renders at @2x, so 1 pt = 2 px. A 1.43" round 480x480 panel works out to about 336 ppi (480 px / 1.43 in). That is close to Apple Watch's pixel density, so Apple's **@2x pixel values carry over roughly 1:1 in physical size** to the 480x480 target.

---

## 1. What the watchOS HIG says about watch faces, complications (families/templates), layout, hierarchy, glanceability

### Takeaway
Apple treats the face as "the heart of the watchOS experience". Each complication is a small, *dynamic*, always-current data module in a fixed family: circular, corner, inline, rectangular (plus extra-large circular and legacy templates). For every family Apple fixes the image sizes, text style (SF Compact Rounded, Medium or Semibold) and point size per case size. Lines should be at least 2 pt, and complications must survive tinted (single-color) rendering.

### Cited Findings
**Watch face philosophy**
- "The watch face is at the heart of the watchOS experience. People choose a watch face they want to see every time they raise their wrist, and they customize it with their favorite complications." People keep different faces for different activities and switch by context. — [HIG: Watch faces](https://developer.apple.com/design/human-interface-guidelines/watch-faces)
- Shareable faces (watchOS 7+) can preset complications, the system accent color, images and styles, e.g. a fitness instructor shares a Gradient face with a custom color and health complications. — [HIG: Watch faces](https://developer.apple.com/design/human-interface-guidelines/watch-faces)
- Some faces are Series 4+ only (California, Chronograph Pro, Gradient, Infograph, Infograph Modular, Meridian, Modular Compact, Solar Dial). — [HIG: Watch faces](https://developer.apple.com/design/human-interface-guidelines/watch-faces)
- Interaction model: people glance at the Always On display "many times throughout the day, performing concise app interactions that can last for less than a minute each". They use complications and notifications more than the app itself. Viewing distance is usually "no more than a foot away". — [HIG: Designing for watchOS](https://developer.apple.com/design/human-interface-guidelines/designing-for-watchos)
- Best practices: "quick, glanceable, single-screen interactions that deliver critical information succinctly". Use complications "to provide relevant, potentially dynamic data and graphics right on the watch face where people can view them on every wrist raise". "Use background content such as color to convey useful supporting information, and use materials to illustrate hierarchy and a sense of place." — [HIG: Designing for watchOS](https://developer.apple.com/design/human-interface-guidelines/designing-for-watchos)

**Complication best practices**
- "Most watch faces can display at least one complication; some can display four or more." — [HIG: Complications](https://developer.apple.com/design/human-interface-guidelines/complications)
- "Identify essential, dynamic content… the complication behavior they appreciate more is the display of relevant information that always feels up to date. A static complication that doesn't display meaningful data may be less likely to remain in a prominent position." — [HIG: Complications](https://developer.apple.com/design/human-interface-guidelines/complications)
- Support all families. Where a family can't show useful data, show the app icon as a launcher. Give each complication its own deep link. Keep privacy in mind on Always On. Updates come from a timeline with a limited daily update budget. — [HIG: Complications](https://developer.apple.com/design/human-interface-guidelines/complications)

**Gauge styles (visual design)**
- **Closed** gauge: a percentage of a whole (e.g. battery). **Open** gauge: arbitrary min/max that isn't a percentage (e.g. speed). **Segmented**: an app-defined range that can show rapid value changes (e.g. the Noise complication). — [HIG: Complications](https://developer.apple.com/design/human-interface-guidelines/complications)
- "When creating complication content, generally use **line widths of two points or greater**. Thinner lines can be difficult to see at a glance, especially when the wearer is in motion." — [HIG: Complications](https://developer.apple.com/design/human-interface-guidelines/complications)

**Family specs (current WidgetKit families, watchOS 9+). Sizes listed as 40mm / 41mm / 44mm / 45mm-49mm** — all from [HIG: Complications](https://developer.apple.com/design/human-interface-guidelines/complications)
- **Circular (regular), used on Infograph and Infograph Modular:**
  - image 42 / 44.5 / 47 / 50 pt square (84 / 89 / 94 / 100 px)
  - closed-gauge image 27 / 28.5 / 31 / 32 pt
  - open-gauge center image 11 / 11.5 / 12 / 13 pt
  - stack 28x14 to 33.5x16.5 pt
  - The system applies a circular mask.
  - Default text: **Rounded, Medium, 12 / 12.5 / 13 / 14.5 pt**
  - Text can curve along the bezel (Infograph) and "can fill nearly 180 degrees of the bezel before truncating."
- **Circular extra-large (X-Large face):**
  - image 120 / 127 / 132 / 143 pt
  - closed gauge 77 / 81.5 / 87 / 91.5 pt
  - open gauge 31 / 33 / 33 / 37 pt
  - stack 80x40 to 95x48 pt
  - Default text: **Rounded, Medium, 34.5 / 36.5 / 36.5 / 41 pt**
- **Corner (Infograph corners):**
  - circular image 32 / 34 / 36 / 38 pt
  - gauge image 20 / 21 / 22 / 24 pt
  - text image 20 / 21 / 22 / 24 pt
  - Default text: **Rounded, Semibold, 10 / 10.5 / 11 / 12 pt** (the smallest default text on the face, set heavier to compensate)
- **Inline, utilitarian small (corner of Chronograph/Simple):**
  - flat 10–22x10 pt (40mm) to 12–26x12 pt (45mm)
  - ring 14–16.5 pt
  - square 22–26 pt
- **Inline, utilitarian large:** spans the bottom of the face (Utility, Motion). Text-first, with an optional leading icon.
- **Rectangular:**
  - large image with title 150x47 to 178.5x56 pt
  - large image without title 162x69 to 193x82 pt
  - standard body/text-gauge icon 12–14.5 pt
  - Large images get an automatic **4 pt corner radius**.
  - Default text: **Rounded, Medium, 16.5 / 17.5 / 18 / 19.5 pt**
- Rectangular data-viz example: the Heart Rate complication's 24 h graph uses "high-contrast white and red for the primary content and a lower-contrast gray for the graph lines and labels". Since watchOS 10, rectangular complications can also appear in the Smart Stack.
- **Legacy (ClockKit) templates.** These are older guidance, and per Apple they are nongraphic styles that don't take on the wearer's color:
  - Circular small, ring 20–26 pt
  - Modular small, ring 18–22.5 pt; simple 26–34.5 pt
  - Modular large, up to 3 rows of text
  - Extra large, ring 63–79 pt; simple 91–121 pt
- Change log: Complications page last updated Oct 24, 2023 (Ultra specs added Sept 2022). The tables have **no** columns for the 42mm/46mm Series 10/11 sizes. — [HIG: Complications](https://developer.apple.com/design/human-interface-guidelines/complications)

**WWDC22 (complications rebuilt on WidgetKit)**
- accessoryRectangular holds "multiple lines of text or small graphs and charts". accessoryCircular is "great for brief information, gauges, and progress views". accessoryInline is "text-only" and drawn "according to system-defined coloring and font". accessoryCorner mixes "a small circle of widget content with gauges and text". — [WWDC22 "Complications and widgets: Reloaded"](https://developer.apple.com/videos/play/wwdc2022/10050/)
- `ViewThatFits` supplies longest-to-shortest text variants so inline text never truncates. `AccessoryWidgetBackground` is "a soft transparent view" behind content. — [WWDC22 10050](https://developer.apple.com/videos/play/wwdc2022/10050/)

**Layout (in apps, informative for faces)**
- No more than three glyph buttons, or two text buttons, side by side. — [HIG: Layout](https://developer.apple.com/design/human-interface-guidelines/layout)
- Touch targets on watchOS: **44x44 pt default, 28x28 pt minimum**. Use about 12 pt padding around bezeled elements and about 24 pt around non-bezeled ones. — [HIG: Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)

### Inferences
- Apple's hierarchy pattern: time is the hero. Data goes to the *periphery*: four corners and bezel-curved text on Infograph, the outer edge on Modular Ultra. A single large data module sits in the center only on data-centric faces (Modular, X-Large, Siri Modular).
- Rough pt to px conversion for a 480x480 round face: double Apple's 45mm pt values.
  - Circular complication: about 100 px diameter
  - Corner gauge: about 48 px
  - Circular complication text: about 29 px
  - Corner text: about 24 px
  - Rectangular text: about 39 px
  - Minimum stroke: 4 px
- The round screen has no true corners. Map Apple's "corner" family to the 45°, 135°, 225° and 315° positions just inside the bezel, and use curved text along the rim (Apple allows nearly 180° of arc) for labels.
- Apple Watch pixel density (about 326 ppi on 41/45mm) comes from my general knowledge, not a source fetched here. It needs checking before the 1:1 px claim is treated as exact.

### Gaps
- The HIG doesn't publish complication specs for Series 10/11 (42/46mm) or Ultra 3. The device specification table on the Layout page didn't render in the JSON I fetched, so exact watch screen resolutions aren't sourced here.
- Apple publishes no layout grid, margins or bezel safe area for its first-party faces.

---

## 2. Typography: SF Compact / Rounded, minimum sizes, weights, tracking, numerals, Dynamic Type

### Takeaway
watchOS uses **SF Compact** for UI and **SF Compact Rounded** in complications. Body text defaults to **16 pt** with a **12 pt minimum**, and thin weights should be set larger. Tracking is size-specific: positive at small sizes, negative at display sizes. Dynamic Type on watch runs from xSmall to xxxLarge plus accessibility sizes, and text should support at least **140% enlargement**.

### Cited Findings
- "SF Compact is the system font in watchOS, and apps can also use NY. In complications, watchOS uses SF Compact Rounded." — [HIG: Typography](https://developer.apple.com/design/human-interface-guidelines/typography)
- Default and minimum sizes: **watchOS 16 pt default / 12 pt minimum** (iOS 17/11, visionOS 17/12). "If you use a custom font with a thin weight, aim for larger than the recommended sizes." — [HIG: Typography](https://developer.apple.com/design/human-interface-guidelines/typography); same table in [HIG: Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)
- "Ideally, give people the option to enlarge text by at least 200 percent (or **140 percent in watchOS apps**)." — [HIG: Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)
- WWDC22: "iOS uses the regular text design, while watchOS uses a **rounded design with a heavier weight**". Use the font styles Title, Headline, Body and Caption with the default font parameters. — [WWDC22 10050](https://developer.apple.com/videos/play/wwdc2022/10050/)
- **watchOS Dynamic Type sizes.** Emphasized weight is Semibold (Large Title: Bold). Leading is consistently size + 2.5 pt. — [HIG: Typography](https://developer.apple.com/design/human-interface-guidelines/typography)

  | Style (weight) | xSmall | Small (38mm default) | Large (40/41/42mm default) | xLarge (44/45/49mm default) | xxxLarge |
  |---|---|---|---|---|---|
  | Large Title (Regular) | 30 | 32 | 36 | 40 | 42 |
  | Title 1 (Regular) | 28 | 30 | 34 | 38 | 40 |
  | Title 2 (Regular) | 24 | 26 | 28 | 30 | 32 |
  | Title 3 (Regular) | 17 | 18 | 19 | 20 | 22 |
  | Headline (**Semibold**) | 14 | 15 | 16 | 17 | 19 |
  | Body (Regular) | 14 | 15 | 16 | 17 | 19 |
  | Caption 1 | 13 | 14 | 15 | 16 | 18 |
  | Caption 2 | 12 | 13 | 14 | 15 | 17 |
  | Footnote 1 | 11 | 12 | 13 | 14 | 16 |
  | Footnote 2 | 10 | 11 | 12 | 13 | 15 |

  Accessibility size AX1 starts at Large Title 44 pt and Title 1 42 pt. The Typography page change log shows emphasized weights added Dec 16, 2025 and Dynamic Type guidance expanded Mar 7, 2025.
- **watchOS tracking (1/1000 em).** Values for 144 ppi @2x. — [HIG: Typography § Tracking values](https://developer.apple.com/design/human-interface-guidelines/typography)
  - *SF Compact:*
    - 6 pt +50
    - 8 pt +30
    - 10 pt +30
    - 11 pt +24
    - 12 pt +20
    - 13 pt +16
    - 14 pt +14
    - 15 pt +4
    - 16 pt 0
    - 17 pt −4
    - 18 pt −8
    - 20 pt 0
    - 22 pt −4
    - 24 pt −8
    - 28 pt −12
    - 32 pt −16
    - 36–48 pt −20
    - 56 pt −22
    - 64 pt −23
    - 72 pt −24
    - 80 pt −26
    - 96 pt −28 (−2.62 pt)
  - *SF Compact Rounded:*
    - 6 pt +28
    - 8 pt +24
    - 10 pt +20
    - 12 pt +16
    - 14 pt +12
    - 16 pt +8
    - 18 pt +4
    - 20 pt 0
    - 22 pt −4
    - 24 pt −8
    - 28 pt −12
    - 32 pt −16
    - 36–48 pt −20
    - 64 pt −23
    - 80 pt −26
    - 96 pt −28
- San Francisco offers rounded variants "to coordinate text with the appearance of soft or rounded UI elements, or to provide an alternative typographic voice". In running apps the system font adjusts tracking automatically at every point size, but mockups need the tracking set by hand. — [HIG: Typography](https://developer.apple.com/design/human-interface-guidelines/typography)
- Custom fonts must implement Dynamic Type and Bold Text behaviors themselves. — [HIG: Typography](https://developer.apple.com/design/human-interface-guidelines/typography)
- Watch face numerals in practice:
  - Flow (watchOS 26) offers SF Rounded as the simpler, more legible numeral choice; the alternative font is called "honestly quite bad". — [MacStories watchOS 26 review](https://www.macstories.net/stories/watchos-26-the-macstories-review/2/)
  - Auto-updating time text uses `Text(date, style: .timer)`. — [WWDC22 10050](https://developer.apple.com/videos/play/wwdc2022/10050/)

### Inferences
- Rule of thumb for a round 480 px face (about 2 px per Apple pt):
  - Never set text below about 24 px. Use 24–26 px for Semibold corner and bezel labels, 28–32 px for secondary data and about 32–40 px for primary complication values.
  - Hero time numerals can run 120–200+ px. At that size, apply tight negative tracking (about −2% to −3% em), matching Apple's −26 to −28/1000 em at 80–96 pt.
  - Use positive tracking (+2% to +3% em) on tiny labels.
- Use Medium or Semibold, not Light or Thin, for anything under about 32 px. Apple raises the corner family to Semibold precisely because it is the smallest text.
- For changing numbers (seconds, heart rate, steps), use tabular (monospaced) figures so the digits don't jitter. This is standard SF practice, but the watch HIG pages I fetched don't state it.

### Gaps
- I found no explicit HIG statement on tabular vs proportional numerals for watch faces, and no published specs for the custom numeral faces on Apple's own dials (e.g. the Unity, Typograph, California or Flow numeral sets).

---

## 3. Color and contrast: tinting, accent colors, black OLED backgrounds, vibrancy, contrast ratios

### Takeaway
Apple watch UI sits on true black. Color is used *to communicate*, not to decorate. Every complication must work in a **tinted / accented** mode in which the system flattens content into one or two colors derived from the wearer's chosen face color. Contrast follows WCAG AA: **4.5:1 for text up to 17 pt, and 3:1 for 18 pt+ or bold**.

### Cited Findings
- watchOS color guidance:
  - "Use background color to support existing content or supply additional information… in Activity, each infographic view for the Move, Exercise, and Stand Activity rings has a background that matches the color of the ring."
  - "Use background color when you have something to communicate, rather than as a solely visual flourish."
  - "Avoid using full-screen background color in views that are likely to remain onscreen for long periods of time."

  — [HIG: Color](https://developer.apple.com/design/human-interface-guidelines/color)
- Tinted mode: "the system applies a solid color to a complication's text, gauges, and images, and desaturates full-color images unless you provide tinted versions." When people choose it, the system "automatically desaturates your complication, converting it to grayscale and tinting its images, gauges, and text using a single color that's based on the wearer's selected color." "Avoid using color as the only way to communicate important information." — [HIG: Complications](https://developer.apple.com/design/human-interface-guidelines/complications)
- Accented rendering: "your views are split into two groups and colored independently. The two coloring groups are flatly colored, preserving only their original opacities" (`.widgetAccentable()`). In full-color mode, "content is displayed exactly as you specify… like the gradient in Weather's gauges, or the Activity rings' colors." — [WWDC22 10050](https://developer.apple.com/videos/play/wwdc2022/10050/)
- Vibrant mode (iOS Lock Screen, a useful analogue): content is desaturated and mapped by luminance. Light source colors come out brighter and more opaque; dark colors become a subtle blur. "Avoid using transparent colors in this mode. Instead, use darker colors or black to represent less prominent content." — [WWDC22 10050](https://developer.apple.com/videos/play/wwdc2022/10050/)
- WWDC25: in accented mode on watchOS, the full-color image option is ignored "to best blend in with the watch face". — [WWDC25 session 278](https://developer.apple.com/videos/play/wwdc2025/278/) (via search snippet)
- Contrast (WCAG AA, used by Accessibility Inspector):

  | Text size | Text weight | Minimum ratio |
  |---|---|---|
  | Up to 17 pt | All | 4.5:1 |
  | 18 pt | All | 3:1 |
  | All | Bold | 3:1 |

  Apple also names APCA as an acceptable measure. Provide a higher-contrast scheme for the Increase Contrast setting. — [HIG: Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)
- Materials on watchOS give contrast in full-screen modals. Don't remove the default material backgrounds. — [HIG: Materials](https://developer.apple.com/design/human-interface-guidelines/materials)
- Custom colors need light, dark and increased-contrast variants. System colors were updated June 9, 2025 for Liquid Glass. — [HIG: Color](https://developer.apple.com/design/human-interface-guidelines/color)

### Inferences
- Build every face from a monochrome luminance master: one primary hue plus white and gray, distinguished by *opacity* (e.g. 100% / 60% / 35%). Then hue variants are a recolor, and the face survives a single-tint mode. This mirrors Apple's accented rendering ("preserving only their original opacities").
- Use pure #000000 backgrounds on AMOLED (pixels off, power saved, infinite contrast). Save full-bleed color for faces built around color (Gradient, Palette, Flux). Avoid it on utility faces people stare at for a long time.
- Data-viz color hierarchy to copy from Heart Rate: saturated hue plus white for the data, low-contrast gray for axes and labels.

### Gaps
- The Color page's watchOS color swatches (RGB values) didn't extract from the JSON. I found no Apple-stated contrast targets specific to faces beyond WCAG AA.

---

## 4. Always-On / luminance-reduced mode

### Takeaway
On wrist-down, Apple dims the face, cuts motion and update cadence, and redacts sensitive data, while keeping the **layout identical**. Since Series 10 (wide-angle LTPO OLED), Always On refreshes **once per second instead of once per minute**, so select faces can keep a ticking seconds hand.

### Cited Findings
- "the system dims the watch face." Always On shows "useful, glanceable information in a low-power, privacy-preserving way by dimming the display and minimizing onscreen motion." — [HIG: Always On](https://developer.apple.com/design/human-interface-guidelines/always-on)
- Best practices — [HIG: Always On](https://developer.apple.com/design/human-interface-guidelines/always-on):
  - Hide sensitive information, such as bank balances and health data.
  - "Keep important content legible and dim nonessential content. You can increase dimming on secondary text, images, and color fills… consider removing the images and using dimmed colors."
  - "Maintain a consistent layout… prefer transitioning an interactive component to an unavailable appearance — don't just remove it… aim to make infrequent, subtle updates."
  - "Gracefully transition motion to a resting state; don't stop it instantly."
- "When inactive, the watch transitions into always-on, with content in a low-luminance presentation and a lower update cadence." "Time-relative text and progress views will change to a reduced fidelity mode." Use `@Environment(\.isLuminanceReduced)` to "remove any time-sensitive content". Mark individual views `.privacySensitive()` for redaction. — [WWDC22 10050](https://developer.apple.com/videos/play/wwdc2022/10050/)
- Apps drive Always On updates with `TimelineView`, whose context reports a `.live` vs `.seconds` cadence. — [Apple docs: Designing your app for the Always On state](https://developer.apple.com/documentation/watchos-apps/designing-your-app-for-the-always-on-state); [WWDC21 10002](https://developer.apple.com/videos/play/wwdc2021/10002/)
- Series 10: the display's efficiency enables "a faster refresh rate when Apple Watch is in always-on mode, going from once a minute to once a second", so "users can now see a ticking seconds hand without raising their wrist on select watch faces". Wide-angle OLED is "up to 40 percent brighter than Series 9 when viewed from an angle". — [Apple Newsroom, Series 10](https://www.apple.com/newsroom/2024/09/introducing-apple-watch-series-10/)

### Inferences
- An Always On spec for the target device:
  - Keep the same geometry.
  - Drop the background to black and remove photos and large fills.
  - Turn filled shapes into outlines or thin strokes.
  - Dim secondary elements more than primary ones (e.g. time at about 60–70% brightness, secondary at about 30–40%).
  - Desaturate or reduce hue.
  - Freeze or remove seconds unless the panel supports 1 Hz low-power refresh.
  - Animate into the rest state; don't cut to it.
  - Aim for a low lit-pixel ratio. The often-cited figure of about 10–15% is industry practice (e.g. Wear OS), not an Apple figure.
- Ultra's Night Mode, which turns the face red, is another Apple low-light technique. It isn't sourced in this research (verify).

### Gaps
- Apple doesn't publish numeric dimming percentages, lit-pixel limits or power budgets for Always On faces.

---

## 5. Signature Apple faces: what makes them feel premium

### Takeaway
Apple's premium feel comes from:
- **Physically motivated motion and light**: Solar Analog's sun-driven shadows, Reflections reacting to wrist movement, Flow's refracting glass numerals.
- **Layered color fields that change with time**: Palette, Flux, Gradient.
- **Depth via segmentation**: Photos puts the time behind the subject.
- **Precision instruments rendered as rings and dials**: Exactograph, Modular Ultra's edge data.
- **Character animation**: Snoopy, Hermès pixel art.
- A disciplined small set of complication slots.

### Cited Findings
- watchOS 10 (2023) — [Apple Newsroom, watchOS 10](https://www.apple.com/uk/newsroom/2023/09/watchos-10-is-available-today/):
  - **Palette** "depicts time in a wide variety of colors using three distinct overlapping layers, and as the time changes, the colors on the display also shift."
  - **Solar Analog** "depicts time on a luminous dial while using light and shadow to reflect the position of the sun throughout the day."
  - **Snoopy** brings Peanuts to life with Snoopy and Woodstock.
  - **Modular Ultra** uses "the outermost edge to present real-time data, including seconds, altitude, or depth" and offers "the most complications of any Apple Watch face".
  - Nike Globe lights up globe lines with each passing second (regional version per search summary).
- watchOS 11 / Series 10 (2024) — [Apple Newsroom, Series 10](https://www.apple.com/newsroom/2024/09/introducing-apple-watch-series-10/):
  - **Reflections**: "a distinctive shimmering dial that reacts subtly to user movements", designed to complement reflective titanium cases (face-to-hardware material matching).
  - **Flux**: "a bold graphic design that fills the screen with color second by second".
  - **Photos** (redesigned) "uses machine learning to help users curate their best photo options".
- watchOS 26 (2025): four new faces, released with the RC rather than announced at WWDC — [MacRumors](https://www.macrumors.com/2025/09/10/watchos-26-adds-four-new-apple-watch-faces/); [9to5Mac](https://9to5mac.com/2025/09/09/watchos-26-adds-four-brand-new-watch-faces-including-an-ultra-exclusive/)
  - **Exactograph**: a regulator-style face with concentric rings for hours, minutes and seconds. In its expanded style, the outer minute and second rings are "many times larger than the watch face itself" and rotate around the center. Colors are customizable. — [MacStories watchOS 26 review](https://www.macstories.net/stories/watchos-26-the-macstories-review/2/)
  - **Flow**: large bold numerals in Liquid Glass that refract a glowing, heat-map-like color background that responds to wrist movement. Reviewers found it "slightly harder to read". Options include a black background with solid numerals and SF Rounded numerals. MacStories calls it "a hard fail", while others liked it. — [MacStories](https://www.macstories.net/stories/watchos-26-the-macstories-review/2/); [Yahoo/Engadget summary](https://tech.yahoo.com/wearables/articles/apple-adding-four-watch-faces-151152008.html)
  - **Photos (updated)**: Liquid Glass translucent time that "pokes out" from behind the photo subject (depth/segmentation). Legibility depends on the photo: a blue sky works, busy scenes don't. The glass effect can be turned off. — [MacStories](https://www.macstories.net/stories/watchos-26-the-macstories-review/2/)
  - **Waypoint (Ultra only)**: chronograph-style compass. An outer dial shows points of interest that shift as you turn, filtered by category and radial distance. One extra-large custom complication slot sits bottom-left or bottom-right. — [MacStories](https://www.macstories.net/stories/watchos-26-the-macstories-review/2/)
  - **Hermès Faubourg Party**: animated pixel art (early-Macintosh style). — [MacStories](https://www.macstories.net/stories/watchos-26-the-macstories-review/2/)
- watchOS 27 (released Sept 14, 2026): new **Siri Modular** face that "displays the top Smart Stack item in a large complication in the middle of your Watch". The Ultra version gets extra customization. The Modular face reportedly gained 13 new colors. — [MacStories watchOS 27 review](https://www.macstories.net/stories/watchos-27-the-macstories-review/2/); [MacRumors](https://www.macrumors.com/2026/09/14/apple-releases-watchos-27/); [9to5Mac](https://9to5mac.com/2026/09/09/watchos-27-will-add-new-siri-modular-face-for-apple-watch/); [9to5Mac, Modular colors](https://9to5mac.com/2026/09/25/watchos-27-upgrades-popular-apple-watch-face-with-new-options/)
  - A rumored simplified Modular Ultra ("Orchid") face is unconfirmed. — [MacRumors rumor](https://www.macrumors.com/2026/05/04/watchos-27-expected-to-have-new-watch-faces/)
  - Critique: the media card keeps landing on Siri Modular because it can't be dismissed without disabling Live Activities.

### Inferences
- Repeatable premium techniques for a non-Apple round AMOLED face:
  1. Tie motion to a physical cause (accelerometer tilt shifting highlights or gradients, the sun's position, time).
  2. Layer translucent shapes or color fields that evolve with the hour.
  3. Create depth by placing time *behind* a foreground subject, with a fallback for busy images.
  4. Use oversized rotating rings so the round dial reads as a precision instrument (the Exactograph idea suits round screens especially well).
  5. Match the dial material to the case.
  6. Always offer a high-legibility variant (solid numerals on black). Apple's own Liquid Glass faces drew legibility criticism.
- Keep complication counts modest on expressive faces (Flow shows little data, Waypoint has one slot). Put dense data on dedicated utility faces (Modular Ultra, Infograph).

### Gaps
- No Apple-published specs (sizes, frame rates, gradient stops) exist for first-party faces. Unity, Infograph, Activity and the newer Reflections internals aren't described technically in the sources found.

---

## 6. Data visualization patterns: activity rings, gauges, progress arcs

### Takeaway
Apple standardizes three gauge semantics (closed, open, segmented), sets a **2 pt minimum stroke**, and uses gradients plus color-coded rings (Move/Exercise/Stand) in full-color mode. Complications must stay legible when flattened to one tint.

### Cited Findings
- Closed, open and segmented gauge semantics, plus the ≥2 pt line rule. — [HIG: Complications](https://developer.apple.com/design/human-interface-guidelines/complications)
- Gauge image sizes: circular closed-gauge center image 27–32 pt and open-gauge 11–13 pt. Corner gauge image 20–24 pt. Extra-large closed gauge 77–91.5 pt. — [HIG: Complications](https://developer.apple.com/design/human-interface-guidelines/complications)
- Full color keeps "the gradient in Weather's gauges, or the Activity rings' colors". — [WWDC22 10050](https://developer.apple.com/videos/play/wwdc2022/10050/)
- Activity uses ring-matched background colors for each ring's infographic view. — [HIG: Color](https://developer.apple.com/design/human-interface-guidelines/color)
- Activity teaches its novel chart by animating each ring individually on pairing. "Aid comprehension by adding descriptive text" (headline summaries). — [HIG: Charting data](https://developer.apple.com/design/human-interface-guidelines/charting-data)
- The Heart Rate rectangular graph uses saturated red and white for data and gray for gridlines and labels. — [HIG: Complications](https://developer.apple.com/design/human-interface-guidelines/complications)
- Auto-updating `ProgressView(interval:…)` with `.circular` style keeps progress current with one timeline entry. In Always On, progress views drop to "reduced fidelity". — [WWDC22 10050](https://developer.apple.com/videos/play/wwdc2022/10050/)
- Exactograph uses concentric time rings, and Modular Ultra runs data along the outer edge. — [MacStories](https://www.macstories.net/stories/watchos-26-the-macstories-review/2/); [Apple Newsroom watchOS 10](https://www.apple.com/uk/newsroom/2023/09/watchos-10-is-available-today/)

### Inferences
- For 480 px round:
  - Use stroke widths of at least 4 px (2 pt) for gauge arcs. Main ring arcs look Apple-like at roughly 8–14% of their radius.
  - Use round caps.
  - Draw the unfilled track as the same hue at low opacity (about 20–30%), as the Activity rings appear. This is observed convention, not sourced.
  - Open gauges suit speed and heart rate; closed suits battery and goal %; segmented suits noise, level and fast-changing values.
  - Pair every gauge with a numeric value and a glyph, so meaning survives tinted mode.

### Gaps
- Apple publishes **no** official Activity ring stroke widths, ring gap ratios, cap styles or exact Move/Exercise/Stand hex values in the HIG pages consulted. HealthKit's `HKActivityRingView` exposes no visual specs. Any numbers seen elsewhere would be third-party measurements.

---

## 7. Latest design-language changes (watchOS 11 → 26 → 27, 2024–2026), incl. Liquid Glass

### Takeaway
watchOS 26 (2025) brought **Liquid Glass**, a translucent, refractive material, to system UI and some faces (Flow numerals, Photos time). Reviewers flagged reduced legibility over bright content. watchOS 27 (2026) kept Liquid Glass but made it crisper: less blur and bleed, sharper edges. It also added the Smart-Stack-driven Siri Modular face.

### Cited Findings
- "watchOS has been updated throughout the OS with the new design system, including changes to materials and controls, updates to app icons, and changes to system spaces like the watch face and Control Center." Toolbar and control styles update automatically. "Audit [custom styles] to ensure your user interface elements are legible." — [WWDC25 "What's new in watchOS 26"](https://developer.apple.com/videos/play/wwdc2025/334/)
- Liquid Glass "has no inherent color, and instead takes on colors from the content directly behind it". "Apply color sparingly to the Liquid Glass material." Reserve color for status indicators and primary actions. — [HIG: Color](https://developer.apple.com/design/human-interface-guidelines/color) (updated June 9 and Dec 16, 2025)
- In watchOS 26, Liquid Glass mostly re-skins the system with reflective edges on buttons and widgets, keeping watchOS 11 positions. The keypad and some notifications lose legibility over bright faces. — [MacStories watchOS 26 review](https://www.macstories.net/stories/watchos-26-the-macstories-review/2/)
- watchOS 27 is "ever so slightly more readable": "Edges are more defined and colors are diffused less, making everything a little crisper". It also adds a Dynamic App Grid and a new tap gesture for navigating the Smart Stack. — [MacStories watchOS 27 review](https://www.macstories.net/stories/watchos-27-the-macstories-review/2/)
- Smart Stack now holds Controls, Widgets and Live Activities, and RelevanceKit surfaces cards by context (date, sleep, fitness, location/POI). Series 9+ moved to arm64 in watchOS 26. — [WWDC25 334](https://developer.apple.com/videos/play/wwdc2025/334/)
- The HIG Layout page was updated Sept 9, 2025 (Series 11, Ultra 3, SE 3 specs) and Sept 9, 2026 ("current best practices"). — [HIG: Layout](https://developer.apple.com/design/human-interface-guidelines/layout)

### Inferences
- The lesson for a competing face: glass and refraction effects read as premium and current. Apple's own trajectory (watchOS 26, then the crisper 27) and reviewer criticism show they must be paired with strong edge definition, adequate contrast behind numerals, and a solid or opaque fallback.
- The face is becoming a context-aware surface (Siri Modular, Smart Stack relevance). A premium face should leave a slot for "whatever matters now" rather than only fixed complications.

### Gaps
- Apple's HIG has no watch-face-specific Liquid Glass spec (blur radius, refraction strength, opacity). I couldn't fully verify which new faces shipped in watchOS 27 beyond Siri Modular and the new Modular colors.
