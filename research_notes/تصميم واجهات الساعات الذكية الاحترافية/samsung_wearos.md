# Samsung Galaxy Watch and Wear OS Watch Face Design Guidelines and Tooling (as of Nov 2026)

Scope note: research done 2026-11-24. Primary sources: developer.android.com (Wear OS design, Watch Face Format (WFF), Wear app quality checklist), developer.samsung.com (Watch Face Studio (WFS) guide, codelabs, blog), design.samsung.com, plus Samsung support and press pages and Notebookcheck. Some pages could not be fetched (Android Authority Watch 9 faces article and Neowin returned HTTP 403). Tizen-era Samsung pages (Galaxy Watch Studio, Galaxy Watch Designer) are marked discontinued by Samsung and are treated as legacy here.

## 1. Google Wear OS watch face design guidelines (round layout, safe areas, complications, tap targets, glanceability)

### Takeaway
Google's current watch-face design guidance is high level: time first, glanceable, black background, stay inside the bezel, offer complications and customization. The hard numbers come from the Wear app quality checklist: a 15% AOD pixel average, at most 8 complication slots, 48x48dp touch targets, 12sp minimum for essential text and 10sp for non-essential text, 10 MB ambient and 100 MB interactive memory, and 1:1 screenshots.

### Cited Findings
- Three UX principles. Time-telling: "people check the time 150 times a day. Ensure that time is highly visible". Expressive: variety and customization. Useful: complications for glanceable info — [Android Developers: Watch faces design](https://developer.android.com/design/ui/wear/guides/surfaces/watch-faces)
- Five guidelines: "Make glanceable" (clear fonts, legible icons, simple layout); "Include complications"; "Allow for customization" (color ways, customizable hands and complications); "Use the color black" as the primary color to save battery and make other elements stand out; "Stay within the bezel" so essential elements aren't cropped or covered — [Android Developers: Watch faces design](https://developer.android.com/design/ui/wear/guides/surfaces/watch-faces)
- Every watch face has two modes, Interactive and Always-on (AoD). "AoD watch faces must illuminate 15% or less of the pixels" — [Android Developers: Watch faces design](https://developer.android.com/design/ui/wear/guides/surfaces/watch-faces)
- Complication design principles are "Glanceable", "Content forward" (useful on wrist raise without further interaction) and "Privacy first" (the watch is visible everywhere the user goes). Tapping can deep-link into an app or perform a self-contained action, for example incrementing a water count. Wear OS auto-provides an app-shortcut complication — [Android Developers: Complications design](https://developer.android.com/design/ui/wear/guides/surfaces/complications)
- Complication types in the design guide, with required and optional fields:
  - SHORT_TEXT: requires short text; optional icon, burn-in protection icon and short title.
  - ICON (MonochromaticImage): requires an icon; optional burn-in protection icon.
  - RANGED_VALUE: requires value, min and max; optional icon, burn-in icon, short text and short title.
  - LONG_TEXT: requires long text; optional long title, icon, burn-in icon and small image.
  - SMALL_IMAGE.
  - LARGE_IMAGE (PhotoImage).

  [Android Developers: Complications design](https://developer.android.com/design/ui/wear/guides/surfaces/complications)
- Two more complication types arrived in WFF version 2 (Wear OS 5). GOAL_PROGRESS is "useful when users can exceed a goal such as step count". WEIGHTED_ELEMENTS is "useful for showing discrete subsets of data". Version 2 also added a heart-rate system data source — [Android Developers: WFF features](https://developer.android.com/training/wearables/wff/features)
- Conflict: the `ComplicationSlot` reference syntax lists `SHORT_TEXT | LONG_TEXT | MONOCHROMATIC_IMAGE | SMALL_IMAGE | PHOTO_IMAGE | RANGED_VALUE | EMPTY` and does not list GOAL_PROGRESS or WEIGHTED_ELEMENTS. The features page says v2 added them. The syntax block may simply be incomplete — [WFF ComplicationSlot reference](https://developer.android.com/reference/wear-os/wff/complication/complication-slot) vs [WFF features](https://developer.android.com/training/wearables/wff/features)
- A watch face can have "at most eight instances of `ComplicationSlot`, total". Each slot needs exactly one Bounding Area element (box, oval or arc) and at least one `Complication` per supported type. Slots support `isCustomizable` (default TRUE), `tintColor`, `DefaultProviderPolicy`, `Variant` and `ScreenReader`, and from v5 `blendMode` — [WFF ComplicationSlot reference](https://developer.android.com/reference/wear-os/wff/complication/complication-slot)
- Quality checklist ID WO-P10 says "The watch face must have no more than 8 complication slots" — [Wear app quality](https://developer.android.com/docs/quality-guidelines/wear-app-quality)
- WO-V2 sets touch targets at "a minimum of 48x48dp". WO-V14 sets a minimum font of 12sp for essential text and 10sp for non-essential text. WO-V16 requires content to fit the physical display with no overlap or edge clipping, and to be "larger or equal to a 192dp circle". The checklist filters these by Apps or Watch faces, and WO-V12 "Show time (watch faces)" applies specifically to watch faces — [Wear app quality](https://developer.android.com/docs/quality-guidelines/wear-app-quality)
- Recommended test emulators are "Wear OS small round 1.2" (192dp)" and "Wear OS large round 1.39" (227dp)" — [Wear app quality](https://developer.android.com/docs/quality-guidelines/wear-app-quality)
- Samsung WFS complication layouts: "Watch Face Studio has six complication types". Short text has four layouts: Icon+Text+Title, Text+Title, Icon+Text and Text. The watch auto-picks the layout that fits the provider's data, and "Elements without data remain blank". Example: the Step count provider has no icon. To stop elements shifting between layouts, put a 0%-opacity rectangle covering the whole complication area under each layout — [Samsung Developers blog, Sep 2022](https://developer.samsung.com/sdp/blog/en/2022/09/20/things-to-consider-when-designing-complication-layouts)
- Samsung's general guideline is to keep complications below eight. Complications removed from the face can still be set by users in "Quadrant Edge" slots on the device — [Samsung codelab: Optimize your watch face design](https://developer.samsung.com/codelab/watch-face-studio/design-optimization.html)
- A Samsung codelab covers customizable edge complication slots with a digital clock (requires Galaxy Watch4 or newer) — [Samsung codelab: edge complication](https://developer.samsung.com/codelab/watch-face-studio/edge-complication-digital-clock.html)
- Keep elements in the same position across Interactive and Ambient modes for a smooth transition. This is legacy Android guidance seen in a search snippet and not re-verified on a current page — [Android legacy watch face design](https://developer.android.com/design/wear/watchfaces)

### Inferences
- 480x480 on a 1.43-inch round panel works out to about 336 px per inch. On the Galaxy Watch8 44mm (1.47-inch, 480x480) it is about 326 ppi. A 48dp tap target likely maps to roughly 90–100 px on a 480 px Galaxy screen, assuming Galaxy Watch reports around 227–240dp width like the 1.39-inch emulator (227dp). Exact density is not sourced, so verify on device.
- A practical slot plan for a competitive Samsung-style face:
  - 4–7 complications, staying at or under 8 slots per WO-P10.
  - Arc-bounded slots along the edge (BoundingArc), ranged-value and goal-progress gauges for steps and battery, and short-text slots in the center band.
  - Every slot should support several types (for example `SHORT_TEXT RANGED_VALUE`), with a layout for each optional-field combination so no slot renders blank.
- "Stay within the bezel" combined with WO-V16 means keeping essential text inside a centered circle inset from the edge. Edge-hugging arcs and curved text can run close to the edge, but must not clip.

### Gaps
- Google's current design page gives no dp or px safe-area inset values for watch faces, no per-type complication sizes, and no character limits. A SHORT_TEXT limit of about 7 characters is commonly cited, but I did not find it on a fetched page.
- I found no official Wear OS figure for the dp width of Galaxy Watch screens.

## 2. Watch Face Format (WFF) and Samsung Watch Face Studio: structure, features and best practices

### Takeaway
WFF is a declarative XML format co-developed with Samsung, and it has been required for installing watch faces on all Wear OS devices since January 2026. WFS is the no-code tool that outputs WFF. Features have grown by version: v2 added weather, forecasts and flavors; v3 auto-size text and blend modes; v4 photos, ambient transitions and color tinting; v5 blend modes on groups and slots, text auto-size on curved text and nested settings.

### Cited Findings
- "As of January 2026, the Watch Face Format is required for installing watch faces on all Wear OS devices." WFF was "Created in partnership with Samsung". It contains only resources and declarative instructions, and the platform renderer draws the face — [Android Developers: Watch faces / WFF overview](https://developer.android.com/training/wearables/watch-faces/designing)
- There are three creation paths: Watch Face Studio (WYSIWYG, Samsung), Watch Face Designer (a Figma plug-in), and hand-written XML in Android Studio. Distribution is through Google Play or Watch Face Push. Open-source WFF and memory validators are at github.com/google/watchface — [Android Developers: WFF overview](https://developer.android.com/training/wearables/watch-faces/designing)
- Version mapping: WFF v1 needs Wear OS 4 (API 33); v2 needs Wear OS 5 (API 34); v3 needs Wear OS 5.1 (API 35); v4 needs Wear OS 6 (API 36) — [Android Developers: WFF overview](https://developer.android.com/training/wearables/watch-faces/designing)
- Features in all versions: style editing (color, background image, font), groups and complications, and tag expressions (date, time, battery, steps and more) — [WFF features](https://developer.android.com/training/wearables/wff/features)
- v2: Flavors (preset configurations users browse in the companion app), the GOAL_PROGRESS and WEIGHTED_ELEMENTS complication types, weather conditions (current plus hourly and daily forecast), and a heart-rate data source — [WFF features](https://developer.android.com/training/wearables/wff/features)
- v2 weather is exposed as a WEATHER expression object: current conditions, current, low and high temperature, and UV index for the current day, plus forecast data by hour and by day. This comes from the May 2024 blog as summarized by search, not fully fetched — [Android Developers Blog, May 2024](https://android-developers.googleblog.com/2024/05/latest-updates-for-watch-faces-wear-os.html)
- v3: auto-sizing text, blend modes, weighted constraints on lines, and more data sources, mainly time zones — [WFF features](https://developer.android.com/training/wearables/wff/features)
- v4: user-selected photos, transitions when entering and exiting ambient mode, color transformations on most elements, color tinting on grouped elements (ColorConfiguration), and a `Reference` element for single-sourcing transforms — [WFF features](https://developer.android.com/training/wearables/wff/features)
- v5: blend mode on `Group` and `ComplicationSlot`; line spacing and vertical alignment on `Text`; auto-sizing and vertical alignment on `TextCircular` (curved text); `minSize` on `Font` when auto-sizing; the `join` attribute for corner rendering on `Stroke` and `WeightedStroke`; nested settings and dynamic complications in `ListOption` — [WFF features](https://developer.android.com/training/wearables/wff/features)
- The Wear OS 6 announcement (20 May 2025) covered WFF v4 animated ambient-to-interactive transitions, photo watch faces, and a new API for watch face marketplaces (Watch Face Push) — [Android Developers Blog: What's new in Wear OS 6](https://android-developers.googleblog.com/2025/05/whats-new-in-wear-os-6.html)
- Ambient implementation pattern: two groups, each with `<Variant mode="AMBIENT" target="alpha" value="0|255"/>`. Put Variants at the Part or Group level to keep the number of Variants low — [WFF: Save power using ambient mode](https://developer.android.com/training/wearables/wff/ambient)
- WFS best practices from Samsung's optimization codelab:
  - Use the Memory Usage plugin (WFS 1.6+).
  - Crop images and remove transparent padding.
  - Combine images that serve the same purpose.
  - Use WebP animations instead of GIF, since WebP is smaller, lighter to render and uses less power.
  - Prefer vector shapes over bitmaps; shapes support linear, radial and angular gradient fills.
  - Delete unused components rather than hiding them with tag expressions, because hidden components are still partially rendered.
  - Use tag expressions for conditional animation instead of constant animation. Example: blink only when HR is outside 60–100 bpm with `([HR]<60)+([HR]>100)?((\[SEC\]%2==0)?-100:0):0`.
  - Group related parts, such as a hand and its shadow, and apply one expression.

  [Samsung codelab: Optimize your watch face design](https://developer.samsung.com/codelab/watch-face-studio/design-optimization.html)
- Size images to the screen resolution, for example a 450x450 background for a 450x450 screen. Use static components where possible and minimize gyro effects, which force frequent redraws — [Samsung Developers blog: Reducing OPR, May 2024](https://developer.samsung.com/sdp/blog/en/2024/05/07/optimizing-watch-face-battery-usage-by-reducing-on-pixel-ratio)
- WFS "premade designs" (several preset designs in one project, similar to flavors) require WFS 1.9.5+ and Wear OS 5+ — [Samsung codelab: premade designs](https://developer.samsung.com/codelab/watch-face-studio/premade-design.html), per search summary
- Quality checklist WO-G12: a design tool such as WFS must be compatible with current Wear OS requirements and support the latest Wear OS watch-face features. WO-G11: the XML source must be 10 MB or less. WO-G10: at most 10 `<WatchFace>` shape entries in `watch_face_shapes.xml` — [Wear app quality](https://developer.android.com/docs/quality-guidelines/wear-app-quality)

### Inferences
- If you target WFF v2 as a minimum (Wear OS 5, which covers Galaxy Watch4 and later after One UI 6 Watch), you get weather and hourly forecast, goal-progress gauges and flavors. v4 tinting (ColorConfiguration on groups) is the cleanest way to build Samsung-style multi-palette themes, but needs Wear OS 6 (One UI 8 Watch). Plan a fallback palette or version-gated features.
- Curved text with auto-size (v5 `TextCircular`) and `WeightedStroke` with `join` enable One UI-style segmented arc gauges natively, without bitmaps, which also saves memory.

### Gaps
- I did not fetch the full WFF reference for the Gradient, Arc, ColorConfiguration and Weather elements, so per-element attribute details are not captured here.
- I did not find the Wear OS version that maps to WFF v5. The overview table I fetched ends at v4.

## 3. Ambient / Always-On rules: pixel limits, burn-in and power

### Takeaway
The binding rule is WO-P7: a 15% average luminance-weighted pixel ratio, checked about every 10 minutes across a whole day, and every sample must pass. Both Samsung and Google say faces above 15% can be rejected. AOD should be black-dominant, show the time and only essential info, drop seconds, and use dark or outlined elements. The ambient memory budget is 10 MB.

### Cited Findings
- WO-P7 requires an AOD mode that "illuminates no more than 15% of pixels." It is "calculated as the average value across the watch face, with an fully-opaque white pixel having a value of 100% and a black pixel 0%. RGB colors are interpolated linearly". It is "repeated at approximately 10 minute intervals from the start to the end of a whole day, and every calculation must satisfy the 15% limit" — [Wear app quality](https://developer.android.com/docs/quality-guidelines/wear-app-quality)
- WO-P8: "Assets do not exceed the memory budget of 10 MB in ambient mode, and 100 MB in interactive mode" — [Wear app quality](https://developer.android.com/docs/quality-guidelines/wear-app-quality)
- Samsung recommends "no more than 15% of the available pixels in always-on states". A face using "significantly more" can be rejected. WFS auto-generates an AOD version that the designer can modify — [Samsung WFS user guide: Always-on](https://developer.samsung.com/watch-face-studio/user-guide/always-on.html)
- WFS warns when OPR exceeds 15% on deploy and on publish. The Run panel shows OPR in the Always-On view, and sliders let you test conditional states. The AOD Analyzer color-codes each component's contribution. In Samsung's example, hiding the background image, date and second hand cut OPR from 13.4% to 2.4%. Use a separate darker AOD background and darker text, since white text costs more — [Samsung blog: Reducing OPR](https://developer.samsung.com/sdp/blog/en/2024/05/07/optimizing-watch-face-battery-usage-by-reducing-on-pixel-ratio)
- In Samsung's codelab sample, OPR started at 59.7%. Fixes were: change the canvas from off-white #fbf5f5 to #000000, hide layers in the Always-On tab, remove the second-hand components (they don't update in AOD), and add dark versions of resources in the Always-On tab while keeping bright colors in normal mode — [Samsung codelab: Optimize](https://developer.samsung.com/codelab/watch-face-studio/design-optimization.html)
- Ambient should contain "only essential information" and minimize lit pixels. The watch spends much more time in ambient than in interactive mode — [WFF: ambient](https://developer.android.com/training/wearables/wff/ambient)
- Legacy Android burn-in guidance, from search snippets of older design pages: in burn-protected ambient mode, replace solid shapes with outlined shapes and filled images with pixel patterns. On analog faces, hollow out the center where the hands meet to avoid burn-in — [Android legacy watch face design](https://developer.android.com/design/wear/watchfaces) (LEGACY, Wear 1.x/2.x era; snippet only)
- If `burnInProtectionRequired` is true, periodically shift UI elements slightly and avoid solid white areas. This is from the always-on apps guidance — [Android Developers: Always-on apps](https://developer.android.com/training/wearables/always-on)
- Complication types carry an optional "Burn in protection icon" field, used when the device needs burn-in protection — [Android Developers: Complications design](https://developer.android.com/design/ui/wear/guides/surfaces/complications)
- Tizen-era Samsung guidance (LEGACY): Galaxy Watch Studio refused to build faces above 15% OPR; replace bright backgrounds with black; avoid high brightness or chroma on large pixel blocks — [Samsung Tizen pages via search](https://developer.samsung.com/galaxy-watch-design/watch-face/states.html), [Tizen watch face](https://developer.tizen.org/design/wearable/watch-face-0)
- I found no current official source for a 5% or 10% limit. 15% is the published ceiling — based on the searches above.

### Inferences
- Pixel budget on 480x480: the full canvas is 230,400 px and the visible circle about 180,956 px (π×240²). The 15% average equals about 27,100 px fully white if measured over the circle, or about 34,560 px if measured over the square. Because the measure is luminance-weighted, 50% gray text counts half. Thin, mid-gray digits can therefore be much larger than white ones.
- Practical AOD recipe:
  - Black background.
  - Time in outline or thin-weight digits at reduced brightness (gray around #808080–#B0B0B0), keeping the same position as interactive.
  - At most 1–3 small, dimmed complications.
  - No seconds or sweep, no photos or gradients, no filled arcs; convert gauges to thin strokes or ticks.
  - Target under 10% for margin.
  - Check the worst case across the day, since the check samples every ~10 min. Long times like "10:08" or date strings can raise OPR.
- Use the WFF v4 ambient transition to animate the change instead of a hard cut, which matches One UI 8-era polish.

### Gaps
- Whether WO-P7 measures over the square canvas or the round visible area is not stated.
- I found no official Samsung number for brightness dimming levels, AOD refresh cadence, or pixel-shift distance.

## 4. Typography, sizes, color and contrast on Galaxy Watch screens

### Takeaway
Hard rules: 12sp minimum for essential text and 10sp for non-essential (WO-V14), 48dp touch targets, and a black base. Wear's Material 3 typography adds "arc" and "numerals" type roles and variable-font axes. I found no published Samsung One UI Watch type scale or font spec for watch faces.

### Cited Findings
- WO-V14: "Use a minimum font size of 12sp for essential text and 10sp for non-essential text". WO-V1: respect the user's font-size setting without overlap or clipping. This applies to apps; the checklist marks which items apply to watch faces — [Wear app quality](https://developer.android.com/docs/quality-guidelines/wear-app-quality)
- Wear typography (Material 3) type styles are display, title, label, body, arc and numerals. Tokens set font, line height, size, tracking, width and weight. Arc Text is a role for curved, fixed-height titles. The Numerals role is for big, styled numbers that need no localization, with mono or tabular spacing when animated. Variable font axes (weight and width) can be animated for expressive feedback — [Android Developers: Wear typography](https://developer.android.com/design/ui/wear/guides/styles/typography)
- On Wear OS 6+ devices, tiles use the system font by default. Dynamic color on Wear OS 6 builds app and tile themes from the Pixel Watch face colors. This applies to apps and tiles, not to the watch face itself — [Android Developers Blog: Wear OS 6](https://android-developers.googleblog.com/2025/05/whats-new-in-wear-os-6.html)
- Google says to use black as the primary color, because black saves battery and makes other elements stand out — [Android Developers: Watch faces design](https://developer.android.com/design/ui/wear/guides/surfaces/watch-faces)
- Galaxy Watch8 display: 44mm is 1.47-inch at 480x480; 40mm is 1.34-inch at 438x438. Both are Super AMOLED with 3,000 nits peak, up from 2,000 nits on Watch7 — [GSMArena Galaxy Watch8](https://www.gsmarena.com/samsung_galaxy_watch8-13997.php), [Samsung Mobile Press](https://www.samsungmobilepress.com/articles/samsung-galaxy-watch8-series-ultra-comfort-from-sleep-to-workout)
- WFF v3 added auto-sizing text, and v5 added a `minSize` floor plus auto-size on circular text. Use these to keep complication text legible without clipping — [WFF features](https://developer.android.com/training/wearables/wff/features)
- One Samsung forum thread reports complication text appearing too small on a Galaxy Watch5 after Run on Device. Samsung staff pointed to the layout blogs — [Samsung Developer Forum](https://forum.developer.samsung.com/t/complication-text-font-size-too-small-when-run-on-device/26386)
- Tizen-era Samsung sizing (LEGACY, 360x360 Gear-era): 360x360 px backgrounds and about 30x30 px indexes — [Samsung Galaxy Watch Studio tutorial (discontinued)](https://developer.samsung.com/galaxy-watch-design/studio/tutorial/image-size.html)

### Inferences
- Convert sp to px on a 480 px Galaxy screen at about 2x density, assuming around 240dp width; this is not sourced, so verify on device. That gives a 12sp floor of about 24 px and 10sp of about 20 px. A competitive hero time is usually 25–35% of the diameter (120–170 px tall digits). Complication values are about 28–40 px and labels about 20–24 px.
- Use tabular or monospaced numerals for the time and changing values so digits don't jitter. Variable-weight fonts allow a heavy weight in interactive mode and a thin or outline weight in ambient, which keeps OPR low.
- Contrast: aim for WCAG 4.5:1 or higher for small complication text on black (a general accessibility norm, not a Wear-specific source). Accent colors with high chroma work on AMOLED black but should be kept to small areas for power reasons.

### Gaps
- I found no official Samsung One UI Watch type scale, no named Samsung font for watch faces (SamsungOne or One UI Sans), and no Samsung minimum font size for faces. The Wear M3 type-scale sp values (Display Large etc.) were not on the fetched page.
- I found no explicit Google or Samsung contrast-ratio rule for watch faces.

## 5. Signature One UI Watch faces and their design techniques

### Takeaway
Samsung's recent first-party faces fall into three groups. "Informative outdoor" dashboards are dense, with 7–9 complications (Ultra Analog, Ultra Info Board, Info Bricks). "Luxury reinterpretation" faces use realistic light and material effects, guilloché and chronograph sub-dials (Sporty Classic, Heritage Classic, Simple Ultra). "Minimal or bold digit" faces use large geometric numerals, emboss and deboss, and seconds rings (Spatial Number, Simple Digital, Minimal Digital, Dynamic Digits, Circle Dashboard). Gradient and time-of-day color (Daily Gradient Dashboard) is a 2025 trend.

### Cited Findings
- The Galaxy Watch Ultra and Watch7 (July 2024) launched 8 new faces:
  - Informative outdoor: Ultra Analog, Simple Ultra (Ultra-exclusive), Ultra Info Board, Info Bricks.
  - Fashionable: Spatial Number, Simple Digital.
  - Kids: Friends, School time mode.

  Two faces are said to be Ultra-exclusive, but the page names only Simple Ultra — [Samsung AE support](https://www.samsung.com/ae/support/mobile-devices/how-many-new-watch-faces-are-on-galaxy-watch-ultra-and-watch7-and-which-are-exclusive-to-the-watch-ultra/)
- Ultra Analog is "built for performance" with "up to 9 complications" such as heart rate and steps, arranged around workout habits. Backgrounds come in gray, green, black and dark brown; the scale and numerals in dark gray, white and light blue, with red accents. Simple Ultra has a classic luxury look on dark gray, blue, orange or black with white accents; the black version adds fluorescent lime green. Samsung describes the design language as geometric, to harmonize with the watch's shape — [Samsung Design: Galaxy Watch Ultra](https://design.samsung.com/global/contents/galaxy-watch-ultra/)
- Ultra Analog's 9 complications conflict with a Digital Trends reviewer who cited a "lack of complications". Samsung's spec is the more authoritative source — per search summary of [Digital Trends](https://digitaltrends.com/?p=3675100)
- Ultra Info Board supports 7 complications. Spatial Number shows the hour as a large geometric number in the background with analog hands for minutes, and supports 2 complications. Simple Digital shows seconds as a ring along the outer edge. These Watch7 faces were later released to Watch4, 5 and 6 — [Notebookcheck](https://www.notebookcheck.net/Samsung-Galaxy-Watch-4-5-and-6-receive-new-Galaxy-Watch7-watch-faces.897163.0.html)
- Circle Info Board and Gradient Info Board are newer variants with up to 8 customizable complications. This is from a search summary of reporting; the original article was not fetched — [search result summary; SamMobile/Notebookcheck coverage](https://www.sammobile.com/news/stunning-galaxy-watch-8-watch-faces-leak/)
- Galaxy Watch8 and One UI 8 Watch (July 2025) added 7 faces:
  - Sporty Classic: realistic light, material and shadow, plus a sporty chronograph complication.
  - Heritage Classic: a reinterpreted guilloché pattern.
  - Minimal Analog and Minimal Digital: simple numerals, clean layout, subtle emboss and deboss.
  - Dynamic Digits.
  - Daily (Gradient) Dashboard: changes with the time of day through sky and earth tones.
  - Circle Dashboard: described as "the optimal layout for a round display" with bold colors.

  The faces are meant to express a premium brand image and pair with the new cushion case design — [Samsung Design: Galaxy Watch8](http://www.design.samsung.com/global/contents/galaxy-watch-8/)
- One UI 8 Watch also introduced Multi-Info Tiles (tiles that once spread over more than 10 pages now sit on 3 default pages), "a fresh signature color system" and smooth motion. The overall interface is described as bold and sporty — per search summary of [Samsung Newsroom: Galaxy Watch8 series](https://news.samsung.com/us/samsung-galaxy-watch8-series-ultra-comfort-from-sleep-to-workout/)
- A SamMobile user reports filling Ultra Analog and Ultra Info Board with battery, calories, activity, date, Samsung Wallet, sleep, steps and water — [SamMobile opinion](https://www.sammobile.com/opinion/galaxy-watch-ultra-customization-evolved-my-lifestyle/)

### Inferences
- Techniques worth copying for a competitive 480x480 face:
  1. An outer ring of arc-bounded complications or a segmented gauge (the Info Board and Circle Dashboard pattern).
  2. A large geometric hour numeral behind hands or digits (the Spatial Number and Dynamic Digits pattern).
  3. A seconds ring on the outer edge (Simple Digital).
  4. Multi-colorway themes, typically 4–6 backgrounds with high-chroma accents (Ultra lime, orange, red).
  5. Time-of-day gradient backgrounds, using WFF time expressions or v4 color transforms.
  6. Faux-material realism (emboss, deboss, shadows, guilloché) in interactive mode, collapsing to outline-only in AOD.
- Faces named in the brief — "Bold", "Pro Analog", "Large Text" — could not be confirmed as current Galaxy Watch7, 8 or Ultra face names in the sources I found. "Pro Analog" appears to date from older Galaxy Watch generations (unverified).

### Gaps
- The Galaxy Watch 9 / One UI 9 Watch (2026) face list could not be retrieved; the Android Authority article returned 403.
- I found no Samsung-published hex palettes, type specs or complication dimensions for first-party faces.
- I found no source confirming whether "Bold", "Pro Analog" or "Large Text" exist as current faces.

## 6. Samsung and Google design trends 2024–2026 (Material 3 Expressive for Wear OS 6, etc.)

### Takeaway
On Wear OS 6 (2025), Material 3 Expressive is mainly an app and tile language: shape morphing, the EdgeButton, dynamic color drawn from the watch face, and variable-font motion. For watch faces, the 2025–2026 movement is WFF v4 and v5 capabilities (photos, ambient transitions, tinting, blend modes, curved auto-size text) and Watch Face Push marketplaces. Samsung's 2025 faces lean toward luxury-material realism, gradient dashboards and bold round dashboards.

### Cited Findings
- Wear OS 6 (Developer Preview May 2025, based on Android 16) brought these M3 Expressive items:
  - Shape morphing on buttons and lists.
  - EdgeButton, which hugs the screen edge, in four sizes.
  - Expressive motion in TransformingLazyColumn, ScrollIndicator and ProgressIndicator.
  - Dynamic color that generates app and tile themes from Pixel Watch face colors.
  - The system font as the default in tiles.

  For watch faces, the release brought WFF v4 (ambient transitions, photo faces) and a marketplace API — [Android Developers Blog: Wear OS 6](https://android-developers.googleblog.com/2025/05/whats-new-in-wear-os-6.html)
- Material 3 on Wear adds Arc and Numerals type roles and variable-font axis animation — [Wear typography](https://developer.android.com/design/ui/wear/guides/styles/typography)
- WFF v5 adds `TextCircular` auto-size, `WeightedStroke` and `join`, blend modes on groups and slots, and nested settings and dynamic complications in `ListOption` — [WFF features](https://developer.android.com/training/wearables/wff/features)
- WFF became mandatory in January 2026 for installing watch faces on all Wear OS devices, so legacy Jetpack/Canvas faces are effectively phased out — [Wear app quality](https://developer.android.com/docs/quality-guidelines/wear-app-quality)
- Samsung's 2025 face language includes realistic light, material and shadow; guilloché; emboss and deboss; time-of-day gradients; and "bold colors and speed" for round dashboards — [Samsung Design: Galaxy Watch8](http://www.design.samsung.com/global/contents/galaxy-watch-8/)
- Watch Face Designer, a Figma plug-in, is now an official creation path alongside WFS and XML — [WFF overview](https://developer.android.com/training/wearables/watch-faces/designing)

### Inferences
- To look current in 2026, use variable-weight numerals and edge-hugging arcs and curved text. Offer several colorways or themes via flavors, premade designs or ColorConfiguration, and add smooth ambient transitions.
- Dynamic color is not a watch-face API on Wear OS 6. Faces should ship their own curated palettes, because the system themes apps from the face, not the other way round.

### Gaps
- I found no official Material 3 Expressive guidance written specifically for watch faces, and no published One UI 8/9 Watch "signature color system" values.

## 7. Galaxy Store and Play Store watch face quality requirements and common rejection reasons

### Takeaway
On Google Play, the enforceable checklist covers:
- Time shown clearly (WO-V12).
- AOD at or under 15% (WO-P7).
- Memory at or under 10 MB in ambient and 100 MB in interactive (WO-P8).
- At most 8 complication slots (WO-P10).
- XML source at or under 10 MB (WO-G11).
- Stable install, set and customize, including adding complications (WO-P3).
- Category self-tagging (WO-G9).
- Up-to-date tooling (WO-G12).
- Strict listing-asset rules: 1:1 screenshots with no device frames, more than one permutation for customizable faces, and from 15 July 2026 a centered circular icon (WO-G4).

Samsung has no consolidated public list of Galaxy Store watch face rejection reasons. Forum-reported causes are device-compatibility selection, complication defects, IP infringement, description problems and permission issues.

### Cited Findings
- WO-P3: the user can "install, set, and personalize the watch face without crashing, including adding complications when applicable" — [Wear app quality](https://developer.android.com/docs/quality-guidelines/wear-app-quality)
- WO-G4 (in force from 15 July 2026): the icon must accurately represent the face, include no text, graphics or device frames that aren't part of the face, and "feature a centered, circular watch face scaled to touch the outer edges of the icon asset". Apps with several faces are exempt, but single-face apps are more discoverable — [Wear app quality](https://developer.android.com/docs/quality-guidelines/wear-app-quality)
- WO-G6 screenshots: at least one accurate screenshot; "show more than one of the available permutations, if the watch face is customizable"; only the watch face; no device frames or extra text, graphics or backgrounds; 1:1 aspect ratio — [Wear app quality](https://developer.android.com/docs/quality-guidelines/wear-app-quality)
- WO-G2 description: list the main features, don't mention "Android Wear", mention a complication if one is included, and localize. The requirement to mention Wear OS was removed on 12 March 2026 — [Wear app quality](https://developer.android.com/docs/quality-guidelines/wear-app-quality)
- WO-G9 self-tag categories; WO-G10 at most 10 shapes; WO-G11 XML at or under 10 MB; WO-G12 tooling must support the latest Wear OS watch face features — [Wear app quality](https://developer.android.com/docs/quality-guidelines/wear-app-quality)
- Platform deadlines: new apps must target API 34+ from 31 August 2025; 64-bit support is required from 15 September 2026 — [Wear app quality](https://developer.android.com/docs/quality-guidelines/wear-app-quality)
- WFS warns at publish when OPR is above 15%. Samsung says a face significantly above 15% "can be rejected" — [Samsung blog: Reducing OPR](https://developer.samsung.com/sdp/blog/en/2024/05/07/optimizing-watch-face-battery-usage-by-reducing-on-pixel-ratio), [WFS Always-on guide](https://developer.samsung.com/watch-face-studio/user-guide/always-on.html)
- Samsung's Galaxy Watch self-check list covers "the most frequent reasons" apps fail review. It is app-oriented and partly Tizen-era — [Samsung Galaxy Store self-check list](https://developer.samsung.com/galaxy-store/self-check-list-galaxy-watch.html)
- Forum-reported Galaxy Store rejection and suspension causes (anecdotal):
  - Wrong supported-device selection, such as Gear S2 left selected after GWD 1.7 dropped it.
  - "Test Confirmation Rejected (Defect with complications)".
  - Description problems.
  - Use of an auto-restart permission.
  - Vague "not searchable" messages; staff advised a Seller 1:1 enquiry.
  - IP infringement checks requiring proof documents.

  [Samsung Developer Forum: complication defect](https://forum.developer.samsung.com/t/test-confirmation-rejected-defect-with-complications/28387), [Gear S2 rejection blog](https://developer.samsung.com/sdp/blog/en/2019/10/23/was-your-galaxy-watch-app-submission-rejected-due-to-gear-s2-incompatibility-heres-a-solution), [Face rejected because of description](https://forum.developer.samsung.com/t/face-rejected-because-of-description/11787), [Galaxy Store IP infringement](https://developer.samsung.com/GlxyStore/ip-infringement.html)

### Inferences
- Pre-submission checklist for designers:
  - AOD worst case under 15% across 24 hours; target under 10%.
  - No slot ever renders blank or overlapping, for every supported type and layout.
  - Text never clipped by the circle, including long localized dates and temperatures.
  - No brand logos or trademarks without rights.
  - Screenshots at 1:1 showing 2+ colorways.
  - A circular icon for single-face apps.
  - Under 8 slots.
  - Run the Google watchface validator and memory validator.

### Gaps
- I found no official, current public list of Galaxy Store watch face rejection reasons. Forum evidence is anecdotal and partly dates from the Tizen era.
- I found no Samsung-specific Galaxy Store metadata rules for watch faces, such as screenshot sizes or icon rules.
