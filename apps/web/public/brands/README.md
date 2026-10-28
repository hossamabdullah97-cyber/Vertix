# Payment brand logos

Each payment platform's **official** mark, shown on payment links (the card and
the Studio). The UI loads them from `apps/web/lib/paymentBrands.ts`; a platform
without a file gets a tile in its brand colour with a generic icon.

The Egyptian wallets and gateways use each company's own app icon as published
on Google Play (resized to 256 × 256, never redrawn):

| Platform      | File                | Source (Google Play)                       |
| ------------- | ------------------- | ------------------------------------------ |
| InstaPay      | `instapay.png`      | `com.egyptianbanks.instapay`               |
| Vodafone Cash | `vodafone-cash.png` | `com.emeint.android.myservices` (Ana Vodafone, home of Vodafone Cash) |
| Orange Cash   | `orange-cash.png`   | `io.paysky.orange` (cropped above its "for businesses" strip) |
| Etisalat Cash | `etisalat-cash.png` | `com.etisalat.ewallet`                     |
| WE Pay        | `we-pay.png`        | `com.TE.WEWallet`                          |
| Fawry         | `fawry.png`         | `com.fawry.myfawry`                        |
| valU          | `valu.png`          | `com.efgh.customer`                        |
| Paymob        | `paymob.png`        | `com.paymob.paymob_app`                    |
| PayPal        | `paypal.png`        | `com.paypal.android.p2pmobile`             |

Meeza has no file yet (no official mark was found to use), so it shows the
fallback tile. Bank card, bank smart wallet and custom are generic, not a brand.

Guidelines:

- Use each brand's **official** asset — do not recreate a trademarked logo by hand.
- Square, full-bleed marks: the app renders each edge to edge in a rounded tile.
