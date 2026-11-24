# SiFli + LVGL + QuickJS watch faces: technical implementation and premium effects under constraints

Research method: I went to the primary source. I cloned `github.com/OpenSiFli/SiFli-SDK` (branch `main`, HEAD commit `b4b9041`, dated 2026-11-23) and read the SDK docs, drivers, the LVGL fork and the QuickJS binding source. I added web sources for LVGL docs and community material. File links below point to `https://github.com/OpenSiFli/SiFli-SDK/blob/main/<path>`. The Kieslect KR2 Pro firmware is closed and evolved from this SDK; its paths (`/dyn/dynamic_app/qjs_wf/`) and classes (`img`, `idximg`, `label`, `pointer`, `launcher`) do NOT appear in the public SDK. Anything about the KR2 Pro inferred from the SDK is marked as an inference.

---

## Q1. What is publicly documented about the SiFli SDK graphics stack (LVGL version, EPIC/ePicasso GPU, eZIP, the QuickJS "dynamic app" watch-face framework)?

### Takeaway
The open SiFli-SDK ships two LVGL versions: LVGL **8.3.1** (with a SiFli EPIC GPU draw backend and a custom image decoder) and LVGL v9. It also includes **QuickJS (2021-03-27)** with an LVGL binding that exports the ES modules `"lv"`, `"lvext"` and `"lvapp"`. This is clearly the ancestor of the KR2 Pro's `main.js` system. The EPIC GPU blends, scales and rotates in hardware (rotation in 0.1° units, 0..3600), but **it cannot rotate eZIP-compressed images**. Its JS event bridge subscribes to `LV_EVENT_ALL`, which is a likely cause of the freezes seen with closure callbacks.

### Cited Findings

**LVGL version and configuration**
- The SDK bundles LVGL v8 at `external/lvgl_v8` with `LVGL_VERSION_MAJOR 8`, `MINOR 3`, `PATCH 1` (i.e., v8.3.1). It also bundles `external/lvgl_v9` and has separate example trees `lvgl_v8_examples` and `lvgl_v9_examples` — [external/lvgl_v8/lvgl.h](https://github.com/OpenSiFli/SiFli-SDK/blob/main/external/lvgl_v8/lvgl.h)
- The LVGL v8 fork has a SiFli GPU backend directory `src/draw/sifli_epic/` (`lv_gpu_sifli_epic.h`), next to the upstream NXP, STM32 DMA2D and arm2d backends — [external/lvgl_v8/src/draw/sifli_epic/lv_gpu_sifli_epic.h](https://github.com/OpenSiFli/SiFli-SDK/blob/main/external/lvgl_v8/src/draw/sifli_epic/lv_gpu_sifli_epic.h)
- SiFli's LVGL config defines `LV_USE_GPU_SIFLI_EPIC 1`, `LV_USE_GPU = LV_USE_GPU_SIFLI_EPIC` and `LV_USE_DRAW_EPIC`. It sets `COMPATIBLE_WITH_SIFLI_EPIC_Ax 1` ("attach dummy pixels for every row to align to 1 byte for A2/A4 color format") except on 55x ("55x not support Ax"). Memory uses `rt_malloc/rt_free` (`LV_MEM_CUSTOM 1`) — [middleware/lvgl/lv_conf_sifli.h](https://github.com/OpenSiFli/SiFli-SDK/blob/main/middleware/lvgl/lv_conf_sifli.h)
- SiFli-specific custom image color formats produced by the ezip tool: `LV_IMG_CF_SEQ 0x1F` ("directory with __SEQ", i.e. image sequences), `LV_IMG_CF_GIF 0x1E`, `LV_IMG_CF_264 0x1D` and `LV_IMG_CF_JPG 0x18` (the comment says 0x18 was chosen "for compatible with lvgl v8.0 (LV_IMG_CF_USER_ENCODED_2)"). The 0xFF/0xFE/0xFD/0xF8 variants are used for v9 — [middleware/lvgl/lv_conf_sifli.h](https://github.com/OpenSiFli/SiFli-SDK/blob/main/middleware/lvgl/lv_conf_sifli.h)
- On 16-bit color depth the config sets `EPIC_YUV420_DITHER_LEVEL_DEFAULT EPIC_DITHER_LEVEL_MIDDLE`, so the EPIC has a hardware dither level for YUV→RGB565. At 24-bit it is `EPIC_DITHER_LEVEL_DISABLE` — [middleware/lvgl/lv_conf_sifli.h](https://github.com/OpenSiFli/SiFli-SDK/blob/main/middleware/lvgl/lv_conf_sifli.h)

**EPIC (ePicasso) 2D GPU capabilities** (from the HAL doc)
- Features: alpha-blend two images into an output buffer; rotate the foreground "around any point" and blend it; scale it; "combined rotation and scaling in a single GPU operation without requiring an intermediate buffer"; fill with opaque or semi-transparent colour; automatic colour-format conversion; partially overlapping layers; background and output can share the framebuffer; "fractional coordinate blending (not supported on 55X)" — [docs/source/en/hal/epic.md](https://github.com/OpenSiFli/SiFli-SDK/blob/main/docs/source/en/hal/epic.md)
- Scaling precision: 55X uses 3.8 fixed point ("reduce 8x, enlarge 256x, precision 1/256"). 58X/56X/52X use 10.16 (reduce 1024x). 57X uses 13.16 — [epic.md](https://github.com/OpenSiFli/SiFli-SDK/blob/main/docs/source/en/hal/epic.md)
- Rotation: "[0 ~ 3600], unit is 0.1 degree", supported for all formats "Except EZIP, JPG, YUV formats". Vertical mirror works only on 52X/57X. The 3x3 transform matrix is 57X only — [epic.md](https://github.com/OpenSiFli/SiFli-SDK/blob/main/docs/source/en/hal/epic.md)
- Notes in the same doc: "A4/A8 cannot rotate or use transform matrix when used as mask". Mirroring cannot be combined with rotation or scaling — [epic.md](https://github.com/OpenSiFli/SiFli-SDK/blob/main/docs/source/en/hal/epic.md)
- Maximum output per hardware blend when scaling, rotating, using fractional coordinates or mirroring: **1024 px on 55X/58X and 512 px on 56X/52X/57X**. Normal blends: 1024, or 8192 on 57X. `EPIC_COORDINATES_MAX` in `bf0_hal_epic.h` is that limit minus about 10 — [epic.md](https://github.com/OpenSiFli/SiFli-SDK/blob/main/docs/source/en/hal/epic.md)
- Input formats: RGB565/ARGB8565/RGB888/ARGB8888 and EZIP on all chips. L8 (8-bit indexed) on all except 55X. A4/A8 (mask/overwrite/fill) on all except 55X. YUV on 56X/52X/57X. A2 fill on 52X/57X. L4 and JPEG on 57X only. Output: RGB565/ARGB8565/RGB888/ARGB8888, plus A8/GRAY on 57X — [epic.md](https://github.com/OpenSiFli/SiFli-SDK/blob/main/docs/source/en/hal/epic.md)
- SiFli's own asset advice: "Add a transparent (or background color) border around images to be rotated or scaled to prevent edge clipping and aliasing". Keep the scaling-factor step above 1/256. "Although rotation and scaling can be performed simultaneously, it is recommended to perform only one transformation at a time for better output quality" — [epic.md](https://github.com/OpenSiFli/SiFli-SDK/blob/main/docs/source/en/hal/epic.md)
- ARGB8565 SRAM layout: bits 23..16 = A, bits 15..0 = RGB565 (little-endian). This matches LVGL `TRUE_COLOR_ALPHA` at 16-bit depth, 3 bytes per pixel — [epic.md](https://github.com/OpenSiFli/SiFli-SDK/blob/main/docs/source/en/hal/epic.md)
- The EPIC driver layer has two modes. "Single-step" mode cannot draw lines, circles, polygons or arcs. "Render list" mode can, and it renders in blocks into two equal-size render buffers with a `partial_done_cb` per block. Masks (A2/A4/A8, `ALPHA_BLEND_MASK`) support "solid color fill, gradient fill, and solid color fill with mask", plus "image blending, rotation, and scaling with mask" — [docs/source/en/drivers/epic.md](https://github.com/OpenSiFli/SiFli-SDK/blob/main/docs/source/en/drivers/epic.md)
- Chip specs (52x family, secondary source): HCPU Cortex-M33 up to 240 MHz with 512 KB SRAM; "ePicaso 2.0" 2D/2.5D GPU with rotation, scaling and mirroring "up to 512×512"; "Lossless Decompression Accelerator — eZIP 2.0"; OPI-PSRAM. Brands named as SiFli users: Redmi, Oppo, Noise; Core Time 2 uses the 52x — [CNX Software](https://www.cnx-software.com/2025/05/14/sifli-sf32lb52j-big-little-arm-cortex-m33-bluetooth-mcu-powers-the-core-time-2-smartwatch/)

**EZIP hardware**
- The EZIP module outputs in "AHB" mode (decompress to memory) or "EPIC" mode, where it streams straight into the EPIC for blending and scaling. The doc says: "rotation of ezip format data is not supported". It can decode a partial region. AHB mode also does LZ4 and GZIP. Every chip except 55X decodes **EZIPA animation** data, via `middleware/ezipa_dec`. Buffers must be 4-byte aligned — [docs/source/en/hal/ezip.md](https://github.com/OpenSiFli/SiFli-SDK/blob/main/docs/source/en/hal/ezip.md)
- The doc's sample allocates `width * height * 3` for an ARGB565A (ARGB8565) decode target — [ezip.md](https://github.com/OpenSiFli/SiFli-SDK/blob/main/docs/source/en/hal/ezip.md)

**SiFli LVGL v8 image decoders (critical for file-based watch faces)**
- `lv_sifli_img_decoder()` registers three decoders: an EPIC colour-format decoder, a **file decoder** (when `RT_USING_DFS`) and a JPEG decoder — [middleware/lvgl/lv_drivers/lvsf_img_decoder.c](https://github.com/OpenSiFli/SiFli-SDK/blob/main/middleware/lvgl/lv_drivers/lvsf_img_decoder.c)
- The SiFli file decoder accepts only `LV_IMG_CF_TRUE_COLOR` (4), `TRUE_COLOR_ALPHA` (5), `RAW` (1) and `RAW_ALPHA` (2). For anything else it logs "Cf error". cf 1/2 are the eZIP files (`lv_img_2_epic_cf2` maps `RAW`/`RAW_ALPHA` → `EPIC_INPUT_EZIP`) — [lvsf_img_decoder.c](https://github.com/OpenSiFli/SiFli-SDK/blob/main/middleware/lvgl/lv_drivers/lvsf_img_decoder.c); [lv_gpu.c](https://github.com/OpenSiFli/SiFli-SDK/blob/main/middleware/lvgl/lv_drivers/lv_gpu.c)
- How a file is loaded depends on the flash type:
  - NAND (`RT_USING_MTD_NAND`): the whole file minus its 4-byte header is read into a PSRAM buffer (`app_cache_alloc(..., IMAGE_CACHE_PSRAM)`).
  - NOR (`RT_USING_MTD_NOR`): it asks `ioctl(fd, F_GET_PHY_ADDR)` and **maps the file directly from flash (XIP) with no RAM copy**.
  - Otherwise: it reads the file into memory.

  — [lvsf_img_decoder.c](https://github.com/OpenSiFli/SiFli-SDK/blob/main/middleware/lvgl/lv_drivers/lvsf_img_decoder.c)
- Formats `EPIC_SUPPORTED_CF()` sends to the GPU: RAW/RAW_ALPHA (eZIP), TRUE_COLOR, TRUE_COLOR_ALPHA, TRUE_COLOR_CHROMA_KEYED, RGB565, RGB888, RGBA5658, RGBA8888. Conditional ones: ALPHA_2BIT/4BIT/8BIT (`EPIC_SUPPORT_A2/A4/A8`), INDEXED_8BIT (`EPIC_SUPPORT_L8` → `EPIC_INPUT_L8`), YUV and JPEG. INDEXED_1/2/4BIT and ALPHA_1BIT are **not** on the list, so they go through LVGL's CPU path — [lv_gpu.c](https://github.com/OpenSiFli/SiFli-SDK/blob/main/middleware/lvgl/lv_drivers/lv_gpu.c)

**QuickJS framework (`lv` / `lvapp`)**
- `external/quickjs` holds QuickJS version `2021-03-27`. Its Kconfig has `PKG_USING_QUICKJS`, `QUICKJS_LVGL` ("Enable LVGL v7/v8 support"), `QUICKJS_USING_PSRAM` and `QUICKJS_PSRAM_SIZE` (default 524288 = 512 KB) — [external/quickjs/Kconfig](https://github.com/OpenSiFli/SiFli-SDK/blob/main/external/quickjs/Kconfig)
- `qjs_lv_init()` registers C modules `js_add_lvgl(r,"lv")`, `js_add_lvgl_ext(r,"lvext")` and `js_add_app(r,"lvapp")`. It sets the GC threshold to `QUICKJS_PSRAM_SIZE*3/4`, or `256*1024` without PSRAM. A **single shared JSContext** serves all apps and faces — [external/quickjs/lvgl/lvgl_v8_qjs_main.c](https://github.com/OpenSiFli/SiFli-SDK/blob/main/external/quickjs/lvgl/lvgl_v8_qjs_main.c)
- Watch-face discovery in the reference version: root-level directories prefixed `JW_` (`qjs_watch_prefix[]="JW_"`) with a `/thumb.bin` thumbnail; apps use the `JA_` prefix. The engine evaluates `/<dir>/main.js`, then runs `"<dir>=new <Name>(<parent_ptr>); <dir>.start();"`. Pause, resume and stop map to `.pause()`, `.resume()` and `.stop(); delete <dir>;` followed by `JS_RunGC()`. Watch faces go through `app_clock_ops_t {init,pause,resume,deinit}` — [lvgl_v8_qjs_main.c](https://github.com/OpenSiFli/SiFli-SDK/blob/main/external/quickjs/lvgl/lvgl_v8_qjs_main.c)
- The `lvapp` module exports class `app`. Methods: `start`, `stop`, `resume`, `pause`, `root` (returns the lv_obj pointer as an int), `task(cb, interval_ms)` and `memory`. `task` creates one `lv_timer_create(proxy, interval)` per app, and calling it again deletes the previous timer. `new app(1)` (watch_app≠0) uses `gui_app_get_clock_parent()` as the root; otherwise it creates a full-screen `lv_obj`. `memory()` dumps `JS_ComputeMemoryUsage` — [external/quickjs/lvgl/lvgl_app_qjs.c](https://github.com/OpenSiFli/SiFli-SDK/blob/main/external/quickjs/lvgl/lvgl_app_qjs.c)
- The `lv` module's `obj` class wraps auto-generated LVGL calls such as `img_set_src`, `img_set_angle`, `img_set_zoom`, `img_set_pivot`, `img_set_antialias`, `img_set_offset_x/y`, `label_set_text`, `label_set_text_static`, `label_set_long_mode`, `align_to`, `get_x`… plus `bind(idx, func)` and `set_event_cb(func)` — [external/quickjs/lvgl/lv_qjs_generated.c](https://github.com/OpenSiFli/SiFli-SDK/blob/main/external/quickjs/lvgl/lv_qjs_generated.c)
- **Data binding.** `bind(idx, func)` calls `lv_obj_data_subscribe(obj, idx)`. Data arrives as `LV_EVENT_REFRESH` and becomes a JS object.
  - Field names seen: `level`, `charger_status`; `step`, `calories`, `distance`; `hr`, `rhr`, `timestamp`; `bp_h`, `bp_l`; `sys_language`, `sys_hour_mode`, `sys_display_time`; `l_temp`, `h_temp`, `state`, `temperature`, `aqi`, `hour` (weather).
  - Data IDs come from `GUI_DATA_*` in `gui_app_data.h`: BATTERY, STEP, HR, SPO2, BP, TEMP, STRESS, SETTING_SYS_USER, WEATHER, BLE_CONNECT, …, LANG_CHANGE, SPORT_TARGET. Custom IDs start at `0x51`.

  — [external/quickjs/lvgl/lvgl_v8_qjs.c](https://github.com/OpenSiFli/SiFli-SDK/blob/main/external/quickjs/lvgl/lvgl_v8_qjs.c); [gui_app_data.h](https://github.com/OpenSiFli/SiFli-SDK/blob/main/external/quickjs/lvgl/gui_app_data.h)
- **Event bridge design (relevant to the freeze):**
  - Both `bind()` and `set_event_cb()` call `lv_obj_add_event_cb(obj, lv_event_callback_proxy, LV_EVENT_ALL, NULL)`.
  - The proxy then `JS_Call`s the stored JS callback for **every** non-REFRESH, non-DELETE event, passing `event->code`.
  - The returned `jret` is never `JS_FreeValue`d (the free code is under `#if 0`).
  - The callback is held with `JS_DupValue`. `this_obj` is stored without a dup.

  — [lvgl_v8_qjs.c](https://github.com/OpenSiFli/SiFli-SDK/blob/main/external/quickjs/lvgl/lvgl_v8_qjs.c); [lv_qjs_generated.c](https://github.com/OpenSiFli/SiFli-SDK/blob/main/external/quickjs/lvgl/lv_qjs_generated.c)
- `lv_obj_set_page_glue` is stubbed out (commented). Helpers `lv_get_ver_max/hor_max` return the display resolution — [lvgl_app_qjs.c](https://github.com/OpenSiFli/SiFli-SDK/blob/main/external/quickjs/lvgl/lvgl_app_qjs.c)

### Inferences
- The KR2 Pro's `lv`/`lvapp` imports, the per-face `main.js` and the thumbnail-in-folder pattern match this SDK code. Kieslect (or SiFli's watch "solution" SDK, which is not public) probably added the higher-level helpers `img`, `idximg`, `label` (`set_font_image`), `pointer` and `launcher`. The `pointer` range 0..3600 matches both `lv_img_set_angle` (0.1° units) and EPIC rotation units (inference).
- **Likely cause of the closure-callback freeze (inference, not verified on KR2 Pro firmware).** If the KR2 Pro's bind/event bridge works like the reference code, a JS callback attached to an object runs for every LVGL event on that object. That includes draw-phase events (`LV_EVENT_DRAW_MAIN_BEGIN/…/POST_END`, `COVER_CHECK`, `REFR_EXT_DRAW_SIZE`, etc.), and they fire many times per frame on each redraw. With about 40 objects and closures that allocate (string concatenation, new objects), this means:
  - thousands of JS calls per second;
  - un-freed return values;
  - GC pressure against a 256 KB / 384 KB threshold;
  - possible re-entrant invalidation (a callback that calls `set_src`/`set_text` during a draw event invalidates the object again, which can cause endless redraws).

  Practical rule: keep bind/event callbacks tiny, non-allocating and idempotent. Check the event code, or that the value actually changed, before touching LVGL. Never mutate objects from inside a callback that may run during drawing. Prefer the single `lvapp.task(cb, ms)` timer over per-object callbacks.
- QuickJS holds the callback with `JS_DupValue`, and closures capture their enclosing scope (often the face object itself), so callback → closure → face → lv obj wrapper → callback forms a reference cycle. Plain refcounting cannot free it; only the cycle collector at GC time can. Named methods or top-level functions avoid capturing large scopes (inference based on QuickJS refcount+cycle-GC design).
- On a 480x480 panel the EPIC "512 px max for rotate/scale" limit on 52x/56x/57x is relevant. A full-screen rotating layer, such as a rotating 480 px bezel ring, sits close to the limit. A transparent padding border (as SiFli recommends) could push it over 512, so the driver must split the work or fall back to software (inference).

### Gaps
- Which SiFli chip the KR2 Pro uses (55x/56x/58x/52x) is unknown. That decides whether L8/A4/A8 can go through the GPU (not on 55x), the 512 vs 1024 transform limit, and NOR (XIP) vs NAND storage.
- The KR2 Pro classes (`img`, `idximg`, `label.set_font_image`, `pointer`, `launcher.set_type`) and the `/dyn/dynamic_app/qjs_wf/` loader are not in the public SDK. I found no public docs for them.
- I could not confirm from the source how LVGL's SiFli GPU path handles an `img_set_angle` request on an eZIP (cf 1/2) image: whether it decompresses to a temp buffer first or falls back to software. The HAL states EZIP data cannot be rotated in hardware.
- I did not fetch the SiFli Wiki or docs.sifli.com pages about "dynamic apps" (dlmodule). The SDK has `example/dlmodule` (dynamic loadable C modules), which is a different mechanism from QuickJS faces.

---

## Q2. Is the eZIP format documented, and are there encoders/decoders?

### Takeaway
The eZIP bitstream itself is not documented publicly. SiFli does ship a free CLI encoder for Windows, Linux and macOS (`tools/png2ezip/ezip(.exe|_linux|_mac)`) that creates eZIP and raw "PIXEL" files with the 4-byte LVGL header. It also has a documented **ezip → PNG decode mode**, so official KR2 Pro assets can probably be decoded and new compressed assets produced with SiFli's own tool.

### Cited Findings
- Tool paths: `tools/png2ezip/ezip.exe` (232,960 B), `ezip_linux` (287,328 B), `ezip_mac` (432,816 B), plus `Help.txt` and `jlinkezip2png.py` — [tools/png2ezip/](https://github.com/OpenSiFli/SiFli-SDK/tree/main/tools/png2ezip)
- File header: "The first 4 bytes of the binary file are the file header, followed by EZIP or PIXEL formatted data". It is little-endian: `[31:21]` height, `[20:10]` width, `[9:5]` reserved, `[4:0]` format — [docs/source/en/app_note/ezip_tool_usage.md](https://github.com/OpenSiFli/SiFli-SDK/blob/main/docs/source/en/app_note/ezip_tool_usage.md)
- Format values: **1 = EZIP without alpha, 2 = EZIP with alpha, 4 = PIXEL without alpha, 5 = PIXEL with alpha**. PIXEL without alpha means RGB565 or RGB888; PIXEL with alpha means ARGB565 (i.e., ARGB8565, alpha in bits 23..16) or ARGB8888. "The tool automatically generates the corresponding format based on whether the original PNG file includes an alpha channel" — [ezip_tool_usage.md](https://github.com/OpenSiFli/SiFli-SDK/blob/main/docs/source/en/app_note/ezip_tool_usage.md)
- Commands:
  - `ezip -convert f.png -rgb565 -binfile 1` → PIXEL bin
  - `-binfile 2` → EZIP bin
  - `-cfile 1|2 -section ROM3_IMG` → LVGL C arrays
  - `-rgb888` for 24-bit
  - **SF32LB57x hardware EZIP cannot decode streams with window > 2048**, so pass `-winsize 2048`

  — [ezip_tool_usage.md](https://github.com/OpenSiFli/SiFli-SDK/blob/main/docs/source/en/app_note/ezip_tool_usage.md)
- `Help.txt` adds:
  - batch mode `ezip -dir xxx -rgb565 -binfile 2 -binext .ezip -detailcf`
  - `ezip -gif x.gif` (GIF → C)
  - a TTF→C option
  - **"ezip to png: `ezip -convert xxx.bin -spt 1 -dpt 0 -outdir dst -dec_off_no_header 0` … will try to read an ezip (no lvgl header) from offset 0, and convert it into a png file"**
  - `-detailcf` codes `RAW_RGB565 0x0F, RAW_RGB565A 0x10, RAW_RGB888 0x11, RAW_RGB888A 0x12, PXL_RGB565 0x13, PXL_RGB565A 0x14, PXL_RGB888 0x15, PXL_RGB888A 0x16`
  - `-binext` may be any extension up to 20 bytes

  — [tools/png2ezip/Help.txt](https://github.com/OpenSiFli/SiFli-SDK/blob/main/tools/png2ezip/Help.txt)
- `jlinkezip2png.py` reads an eZIP blob from target memory over J-Link SWD (e.g. `0x600c7f50`, 4000 bytes) and converts it to PNG — [Help.txt](https://github.com/OpenSiFli/SiFli-SDK/blob/main/tools/png2ezip/Help.txt)
- The tool also offers `-gzip file.bin -length -noheader` to make GZIP blobs for hardware decompression. The first 4 bytes are the original length; chunk large data (e.g. 10 KB) — [ezip_tool_usage.md](https://github.com/OpenSiFli/SiFli-SDK/blob/main/docs/source/en/app_note/ezip_tool_usage.md)
- Sample assets in the SDK: `example/multimedia/lvgl/ezip/disk/example.ezip`, `example_57.ezip`; `example/hal/ezip/assets/clock_mickey_shoe01_565A_s_ezip.dat` (plus a pixel twin) — [example/multimedia/lvgl/ezip](https://github.com/OpenSiFli/SiFli-SDK/tree/main/example/multimedia/lvgl/ezip)
- A web search for community eZIP reverse-engineering projects found none — [search results incl. fbiego/dt78](https://github.com/fbiego/dt78), [kabbi/uwatchfaces](https://github.com/kabbi/uwatchfaces) (other platforms)

### Inferences
- The KR2 Pro's "cf=1/2" files are exactly `LV_IMG_CF_RAW`/`RAW_ALPHA`, which SiFli uses for eZIP (header format 1/2). The working cf=5 ARGB8565 files are "PIXEL with ALPHA" (`TRUE_COLOR_ALPHA` at 16 bpp). So `ezip_linux -convert x.png -rgb565 -binfile 2` should make files in the same family as the official ones. KR2 Pro specifics still need checking: the appended CRC-32/MPEG-2 trailer is Kieslect's package-level addition, not something the SDK tool emits, and on 57x the `-winsize` limit applies.
- eZIP is lossless, so decoding official faces with the `ezip to png` mode should give pixel-exact assets for study (inference; I did not run it).
- Under EPIC output mode, eZIP images go from flash through EZIP into EPIC without a full RAM buffer. That makes eZIP the cheapest choice for big static layers (backgrounds, dials), both in flash size and in RAM bandwidth.

### Gaps
- I tried to run `ezip_linux` here to measure compression ratios and the exact output layout, but the sandbox policy blocked it. Running it locally is the next step (`./ezip_linux -convert test.png -rgb565 -binfile 2 -binext .bin`), then compare against an official KR2 Pro file.
- I found no documentation of the eZIP bitstream (entropy coder, block structure) and no open-source decoder outside SiFli's binaries.

---

## Q3. LVGL v8 image formats from files: decoder support, memory cost, caching, MCU performance

### Takeaway
In LVGL 8.3, TRUE_COLOR, ALPHA_8BIT and RGB565A8 from files are read "line by line". INDEXED_1/2/4/8 load a palette (4 bytes per entry, ARGB8888) and are expanded by the CPU. SiFli's own file decoder handles only cf 1/2/4/5, so on SiFli builds those four formats are the fast path. INDEXED_8BIT and ALPHA_x reach the GPU only on non-55x chips, and probably only when they are in memory. Image caching defaults to 0 in the SDK template.

### Cited Findings
- LVGL v8.3 `lv_img_cf_t` enum (order and values):
  - `UNKNOWN=0, RAW=1, RAW_ALPHA=2, RAW_CHROMA_KEYED=3`
  - `TRUE_COLOR=4, TRUE_COLOR_ALPHA=5, TRUE_COLOR_CHROMA_KEYED=6`
  - `INDEXED_1BIT=7, 2BIT=8, 4BIT=9, 8BIT=10`
  - `ALPHA_1BIT=11, 2BIT=12, 4BIT=13, 8BIT=14`
  - then `RGB888, RGBA8888, RGBX8888, RGB565, RGBA5658, RGB565A8`
  - then `RESERVED_15…`, `USER_ENCODED_0..`
  - SiFli adds YUV formats (`YUV422_PACKED_YUYV`, …)

  — [external/lvgl_v8/src/draw/lv_img_buf.h](https://github.com/OpenSiFli/SiFli-SDK/blob/main/external/lvgl_v8/src/draw/lv_img_buf.h)
- Built-in decoder, file source: TRUE_COLOR, TRUE_COLOR_ALPHA, CHROMA_KEYED, RGB565A8 and ALPHA_8BIT are handled with "If it's a file it need to be read line by line later". For INDEXED_x it allocates `palette_size = 1 << bpp` entries of `lv_color_t` plus `lv_opa_t`, seeks past the 4-byte header and reads `lv_color32_t` entries, **including per-entry alpha** (`opa[i] = cur_color.ch.alpha`). ALPHA_1/2/4BIT are expanded per line — [external/lvgl_v8/src/draw/lv_img_decoder.c](https://github.com/OpenSiFli/SiFli-SDK/blob/main/external/lvgl_v8/src/draw/lv_img_decoder.c)
- SiFli registers its decoders with `lv_img_decoder_create()`, which adds new decoders ahead of the built-in one, and does not remove the built-in decoder — [lvsf_img_decoder.c](https://github.com/OpenSiFli/SiFli-SDK/blob/main/middleware/lvgl/lv_drivers/lvsf_img_decoder.c)
- Config defaults in the SDK's LVGL 8.3 `lv_conf_template.h`:
  - `LV_IMG_CACHE_DEF_SIZE 0` ("0: to disable caching")
  - `LV_GRAD_CACHE_DEF_SIZE 0`
  - `LV_DITHER_GRADIENT 0`, `LV_DITHER_ERROR_DIFFUSION 0`
  - `LV_SHADOW_CACHE_SIZE 0`, `LV_CIRCLE_CACHE_SIZE 4`
  - `LV_LAYER_SIMPLE_BUF_SIZE (24*1024)`, `LV_DISP_ROT_MAX_BUF (10*1024)`

  — [external/lvgl_v8/lv_conf_template.h](https://github.com/OpenSiFli/SiFli-SDK/blob/main/external/lvgl_v8/lv_conf_template.h)
- LVGL 8.3 docs: "The number of cache entries can be defined with `LV_IMG_CACHE_DEF_SIZE` in lv_conf.h"; "The size of the cache can be changed at run-time with `lv_img_cache_set_size(entry_num)`"; "caching images is resource intensive as it uses more RAM to store the decoded image". The built-in decoder covers TRUE_COLOR/INDEXED/ALPHA, and RAW formats need an external decoder — [LVGL 8.3 Images](https://lvgl.io/docs/open/8.3/overview/image). The web summary said the default cache is 1, which conflicts with the SDK template value of 0. Treat the firmware's real value as unknown.
- The SiFli GPU draw path opens images through `_lv_img_cache_open(src, recolor, frame_id)` and has special handling when `LV_IMG_CACHE_DEF_SIZE == 0` — [lv_gpu.c](https://github.com/OpenSiFli/SiFli-SDK/blob/main/middleware/lvgl/lv_drivers/lv_gpu.c)
- For eZIP images at small zoom, the GPU path scales several times, allocating temporary `lv_img_buf_alloc` buffers ("Scale multi times to approaching target zoom") — [lv_gpu.c](https://github.com/OpenSiFli/SiFli-SDK/blob/main/middleware/lvgl/lv_drivers/lv_gpu.c)

**Memory arithmetic** (computed from format definitions above, 480x480 = 230,400 px):

| Format (LVGL v8, 16-bit depth) | bytes/px | Full-screen 480² | Notes |
|---|---|---|---|
| TRUE_COLOR (RGB565, cf 4) | 2 | 460,800 B | EPIC native; NOR = XIP |
| TRUE_COLOR_ALPHA (ARGB8565, cf 5) | 3 | 691,200 B | EPIC native; works on KR2 Pro |
| INDEXED_8BIT (cf 10) | 1 + 1 KB palette | 231,424 B | GPU L8 on non-55x; SiFli *file* decoder rejects it, so it falls back to the CPU built-in decoder (inference) |
| INDEXED_4BIT (cf 9) | 0.5 + 64 B | 115,264 B | CPU only (not in EPIC_SUPPORTED_CF) |
| ALPHA_8BIT (cf 14) | 1 | 230,400 B | single colour + alpha; recolourable |
| ALPHA_4BIT (cf 13) | 0.5 | 115,200 B | GPU A4 on non-55x, from memory |
| eZIP (cf 1/2) | variable | typ. much smaller | lossless; HW decode streamed into EPIC; no HW rotation |

### Inferences
- On the KR2 Pro, the only file formats that both definitely work and stay on the GPU path are cf 4/5 (raw) and cf 1/2 (eZIP), because the SiFli file decoder accepts only those. `idximg` in the KR2 Pro API most likely means "indexed image" in the sense of an index into an image sequence (digits 0-9, weather icons), not LVGL INDEXED palette formats (inference).
- Indexed or alpha formats loaded from files would fall back to LVGL's CPU decoder with line-by-line `lv_fs_read` calls. That is slow for big images. Use them only for small elements, after testing on the device.
- With no image cache, every redraw of an area re-opens and re-decodes each image source behind it. A redraw is cheap only if the invalidated area is small (inference based on LVGL v8 design).

### Gaps
- The actual `LV_IMG_CACHE_DEF_SIZE`, `LV_COLOR_DEPTH`, framebuffer type (RAMLESS/compressed FB) and draw-buffer size in the KR2 Pro firmware are unknown.
- I did not measure decode or draw times on the device.

---

## Q4. Practical techniques: smooth rendering and premium effects within these constraints

### Takeaway
Rely on what the hardware does well: blending, eZIP-streamed static layers and GPU rotation of small uncompressed hand images. Avoid what it does badly or not at all: rotating eZIP, large rotated layers beyond 512 px, CPU-decoded palette formats and per-event JS. Pre-render every "premium" effect (gradients with dithering, glows, shadows, curved text, arc progress states) into images offline.

### Cited Findings
- Hardware rotation takes 0.1° units over 0..3600, and EZIP/JPG/YUV cannot be rotated — [epic.md](https://github.com/OpenSiFli/SiFli-SDK/blob/main/docs/source/en/hal/epic.md)
- SiFli advises a transparent border on images that rotate or scale, and doing one transform at a time — [epic.md](https://github.com/OpenSiFli/SiFli-SDK/blob/main/docs/source/en/hal/epic.md)
- EPIC supports A2/A4/A8 masks with "gradient fill" and "image blending, rotation, and scaling with mask". In render-list mode it can draw lines, circles, polygons and arcs — [drivers/epic.md](https://github.com/OpenSiFli/SiFli-SDK/blob/main/docs/source/en/drivers/epic.md)
- LVGL's `LV_DITHER_GRADIENT` only applies when colour depth is below 32. It provides ordered (horizontal/vertical) and error-diffusion dithering (`LV_DITHER_ERROR_DIFFUSION`) — [lv_draw_sw_dither.h mirror](https://searchdoc.mikroe.com/lv__draw__sw__dither_8h_source.html). The SDK template disables both by default — [lv_conf_template.h](https://github.com/OpenSiFli/SiFli-SDK/blob/main/external/lvgl_v8/lv_conf_template.h)
- RGB565 banding on LVGL 8.3: manually dithering RGB888 sources before converting to RGB565 removed the banding — [LVGL forum](https://forum.lvgl.io/t/lvgl8-3-rgb565-interface-gradient-color-display-effect-color-gradation-obvious-is-there-any-solution/17663). Floyd-Steinberg in the flush callback works but is expensive — [LVGL forum](https://forum.lvgl.io/t/real-time-dithering-from-24-to-16-bit-for-beautiful-displays/18642). Pre-dither assets — [LVGL blog 2017](https://blog.lvgl.io/2017-07-03/dithering); [SquareLine forum](https://forum.squareline.io/t/how-to-avoid-banding-on-smooth-gradients-using-squareline/6259)
- Dithering trades steps for grain; a 5-bit channel has only 32 levels — [MicroEJ training](https://docs.microej.com/en/latest/Trainings/trainingColorDisplayConsiderations.html)
- The SDK has EZIPA animation decode (non-55x) and `LV_IMG_CF_SEQ` image sequences, both of which the tool can generate — [ezip.md](https://github.com/OpenSiFli/SiFli-SDK/blob/main/docs/source/en/hal/ezip.md); [lv_conf_sifli.h](https://github.com/OpenSiFli/SiFli-SDK/blob/main/middleware/lvgl/lv_conf_sifli.h)
- `lvapp.task(cb, ms)` is one `lv_timer` per app, and calling it again replaces the timer. Faces receive pause/resume/stop calls — [lvgl_app_qjs.c](https://github.com/OpenSiFli/SiFli-SDK/blob/main/external/quickjs/lvgl/lvgl_app_qjs.c); [lvgl_v8_qjs_main.c](https://github.com/OpenSiFli/SiFli-SDK/blob/main/external/quickjs/lvgl/lvgl_v8_qjs_main.c)

### Inferences (actionable recipes; derived from the cited constraints, not separately sourced)

**Layering and file choice**
- Pick each layer's format by its job:

  | Layer type | Format | Why |
  |---|---|---|
  | Static, full-screen layers (background, dial ticks, bezel artwork, static glow/vignette) | One flattened eZIP image (cf 1, or cf 2 if transparent) | Smallest file. Streamed through EZIP into EPIC. Never rotated. |
  | Rotating hands, sub-dial needles, rotating seconds disc | Uncompressed ARGB8565 (cf 5) or RGB565 (cf 4) | EPIC cannot rotate eZIP |
  | Small swapped images (digits, icons) | eZIP cf 2 or cf 5 | Both work |

  For hands, crop each image tight to the hand plus a 1–2 px transparent margin (SiFli's anti-alias border). Set the pivot exactly. A 24x240 ARGB8565 hand costs 17,280 B.
- Do not rotate full-screen layers. On 52x/56x/57x the rotate/scale output is limited to 512 px, and a full-screen rotation re-blends 230 k pixels. For a "rotating bezel" or "sweeping gradient" effect, use pre-rendered frames (CF_SEQ/EZIPA, or `idximg` sequences) or rotate only a small sprite.
- Flatten aggressively. Every overlapping transparent layer adds a blend pass over its area on each redraw. Merge static decoration such as shadows, glows, gloss highlights and tick marks into the background image. Keep live objects few: the 40-object face worked, but each one has open/decode/blend cost wherever it overlaps an invalidated area.

**Invalidation and update cadence**
- The hand pointer invalidates its rotated bounding box each update. A seconds hand that turns every second redraws a box up to about 2× its length across, plus everything underneath (background, other hands). A long seconds hand is therefore the most expensive element.
  - Option A: a short or thin seconds hand.
  - Option B: a "ticking" 6° step (`angle += 60`) once per second rather than smooth sweeping.
  - Option C: a sweeping seconds hand at a modest timer rate (e.g. 100–200 ms), but only if testing shows it holds frame rate.
- Run updates from one `lvapp.task` timer. For each element, compare the new value with a cached one and call `set_src`/`set_text`/`set_angle` only when it changed. Minutes and hours change rarely, so update them at most once per minute. Data such as steps and HR should come through `bind` callbacks that only store the value and set a dirty flag.
- Pause animations on `pause()` (AOD/screen off) by setting the timer to a long interval or deleting it, and restore them on `resume()`.

**JS hygiene (to avoid the freeze)**
- No closures in bind/event callbacks. Use top-level named functions or methods that reference globals.
- Don't allocate inside callbacks: no string concatenation or template literals in hot paths, pre-build digit filename arrays, and avoid creating objects or arrays per tick.
- Filter callbacks by event code or changed data so drawing does not trigger JS.
- Never call LVGL setters from an event callback that may run during drawing.
- Call `lvapp.memory()` during development to watch heap growth.

**Gradients and dithering**
- Render every gradient (backgrounds, arc fills, glow halos) offline at 24-bit. Then dither it to RGB565 before conversion, using ordered or Bayer 4x4 dithering or Floyd-Steinberg. Do the same for the RGB part of ARGB8565. Feed the dithered PNG to `ezip`/your converter with `-rgb565`. Check whether eZIP's compression ratio suffers on dithered noise; ordered dithering usually compresses better than error diffusion.
- Avoid runtime LVGL gradients and shadows: dithering, gradient cache and shadow cache are all off by default, and shadows are CPU-heavy.

**Anti-aliased arcs (progress rings)**
- Option A, state images: pre-render N frames of the arc (e.g. 0–100% in 2–5% steps) as eZIP and show them with `idximg`/`img.set_src`. This gives perfect anti-aliasing and lets you bake in gradient, glow and end caps. The cost is flash: frames can be cropped to the ring's bounding box.
- Option B, rotating mask: one arc-segment sprite rotated by `pointer`. This is cheap but only gives a moving end cap, not a growing fill.
- Option C, a hybrid "segmented ring": N pre-positioned tick or segment images toggled on and off. Few pixels change per update.
- Prefer A for premium looks and keep the frame count modest.

**Curved text**
- Bake static curved labels (brand, day names around a bezel) into the background.
- For dynamic curved text such as dates, use image-font digits (`label.set_font_image`) placed along an arc as separate `img`s at pre-computed x/y, each pre-rotated offline per slot. This works because digit glyphs are small. Rotating glyphs at runtime is possible but costs a GPU pass per glyph.

**Shadows, glow and depth**
- Bake drop shadows into the hand images as a soft alpha shadow, offset toward the bottom-right. Keep the shadow inside the same ARGB8565 image so it rotates with the hand.
  - Note: a baked shadow rotates with the hand, so the light direction is not fixed.
  - For a fixed light direction, use a separate shadow hand image rotated with the same angle and pivot, offset by a few pixels.
- Use additive-looking glow halos as semi-transparent ARGB8565 overlays, kept small.
- Use a 1-px highlight and a 1-px dark edge on hands for a "machined" bevel.

**Typography**
- Image fonts (pre-rendered digit sheets in ARGB8565 or eZIP) beat runtime font rendering for premium numerals. Pre-dither the gradient inside the digits. Keep each digit image tight.
- Pre-anti-alias against a transparent background (premultiplied-looking edges can halo). Test on dark and light backgrounds.

**Animation**
- Use image sequences (`LV_IMG_CF_SEQ` / EZIPA on non-55x / `idximg` cycling) for complex motion such as particles, liquid or a breathing glow. Keep the animated region small to limit invalidation area. Cap at about 10–20 fps for sequences.
- Simple motion: `pointer` rotation or position changes of small sprites.

### Gaps
- I found no published benchmarks (fps, ms per blend) for EPIC at 480x480, and none for the QuickJS call overhead per event.
- I did not confirm whether the KR2 Pro firmware enables `LV_DITHER_GRADIENT` or any EPIC dithering for RGB565 output.
- I did not find whether `label.set_font_image` supports kerning or proportional digit widths.

---

## Q5. Community projects reverse-engineering SiFli watch faces or similar dynamic-app systems

### Takeaway
I found no public reverse-engineering project for SiFli-based watch faces (Kieslect, Redmi, Oppo, Noise, etc.), and nothing about eZIP from the community. The best public material is SiFli's own open SDK, which contains the QuickJS/LVGL face framework, the ezip tool and its decode mode. RE projects on other platforms show the general approach.

### Cited Findings
- Searches for "SiFli watch face reverse engineering ezip" and "Kieslect watch face SiFli custom tool" returned no SiFli- or Kieslect-specific projects — [search results: fbiego/dt78](https://github.com/fbiego/dt78); [kabbi/uwatchfaces (Umidigi Uwatch 2 face binary format)](https://github.com/kabbi/uwatchfaces)
- Brands using SiFli chips: Redmi, Oppo, Noise; also Core Devices' Core Time 2 (SF32LB52x) — [CNX Software](https://www.cnx-software.com/2025/05/14/sifli-sf32lb52j-big-little-arm-cortex-m33-bluetooth-mcu-powers-the-core-time-2-smartwatch/)
- SiFli offers an open SDK with no NDA, plus sample OTA apps under the OpenSiFli GitHub org. The wiki and docs are mostly Chinese, with English being added — [CNX Software](https://www.cnx-software.com/2025/05/14/sifli-sf32lb52j-big-little-arm-cortex-m33-bluetooth-mcu-powers-the-core-time-2-smartwatch/). OpenSiFli/SiFli-Wiki hosts chip hardware guides (e.g. SF32LB58x/55x/56xV) — [SiFli-Wiki SF32LB58x HW](https://raw.githubusercontent.com/OpenSiFli/SiFli-Wiki/refs/heads/main/source/en/hardware/SF32LB58x-HW-Application.md)
- Other JS-driven watch-face systems for comparison (secondary relevance): Zepp OS watchface specification — [docs.zepp.com](https://docs.zepp.com/docs/watchface/specification/)

### Inferences
- Because the SDK's QuickJS binding is public, Kieslect-style faces can probably be prototyped against the reference `lv`/`lvapp` API in SiFli's PC simulator (`example/dlmodule/project/pc_hcpu` exists; whether QuickJS faces run in the simulator was not verified).
- The Pebble/Core Time 2 open-source effort on the SF32LB52 may eventually produce community tooling for EPIC and eZIP. I did not find any eZIP-specific tooling there.

### Gaps
- I found no community documentation of Kieslect's package format (the CRC-32/MPEG-2 trailer, the `/dyn/dynamic_app/qjs_wf/` layout) or of the BLE "sifli_sd" transfer protocol.
- I did not check the Chinese-language forums (e.g., SiFli developer forum, CSDN) for watch-face or eZIP posts. That is a possible lead.
