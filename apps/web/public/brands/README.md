# Payment brand logos

Drop the **official** logo file for each payment platform here. The UI loads
them automatically; until a file exists, a brand-colored fallback tile is shown.

Use the exact file names below (prefer SVG; PNG with transparent background also
works — just keep the same base name and update the path in
`apps/web/lib/paymentBrands.ts` if you use `.png`):

| Platform        | File name             |
| --------------- | --------------------- |
| InstaPay        | `instapay.svg`        |
| Vodafone Cash   | `vodafone-cash.svg`   |
| Orange Cash     | `orange-cash.svg`     |
| Etisalat Cash   | `etisalat-cash.svg`   |
| WE Pay          | `we-pay.svg`          |

Guidelines:

- Use each brand's **official** asset from its press/brand kit — do not recreate
  a trademarked logo by hand.
- Prefer a version that reads well centered on a white tile (the app renders the
  logo on a white rounded square with padding).
- Square or wordmark logos both work; the logo is scaled to fit (`object-fit:
  contain`).
