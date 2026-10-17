# Steam release planning

The fixed waits, review times, store assets, demo and Next Fest rules, and discount limits that decide the earliest Steam launch date. Values were checked against the Steamworks docs on 2026-10-17; Valve changes them, so re-read the named page before committing a user to a date and say if a value moved.

## App fee and onboarding

Source: `partner.steamgames.com/doc/gettingstarted/appfee`, `/doc/gettingstarted/onboarding`

- Steam Direct fee: USD 100 per app, non-refundable, recouped in the payment after the app reaches USD 1,000 Adjusted Gross Revenue.
- For a partner's first few titles: a 21-day wait between paying the app fee and releasing that app.
- Tax information is verified by a third party and can take up to 30 days; it can't be changed while verification runs. Complete the tax interview carefully the first time.
- The fee creates the App ID; the store page, depots and builds all hang off it. Pay it first.

## Store page and reviews

Source: `/doc/store/review_process`, `/doc/store/coming_soon`, `/doc/store/releasing`

- Coming Soon must be public at least two weeks before release for a new product. That is a floor: wishlists accumulate only while the page is public, so publish it as soon as there are honest gameplay screenshots.
- Store page review and build review each typically take 3 to 5 business days. Submit the store page at least 7 business days before it must be live, and plan at least 7 business days for the build review.
- The store page review checks that the page shows only what ships, capsules carry a readable title or logo, screenshots are gameplay, and the description is complete. The build review checks the game launches on every OS the page lists and that listed features work; list Linux, Steam Deck or controller support only after testing the exported build.
- Approved titles do not release themselves. Releasing needs the Publish App Changes and Manage pricing and discounts permissions.

## Working backwards from release day R

| Step | Latest | Why |
| --- | --- | --- |
| Pay app fee, start tax interview | well before R − 21 days; allow 30 days for tax | 21-day wait for early titles; tax verification up to 30 days |
| Submit store page for review | 7 business days before Coming Soon | 3 to 5 business day review |
| Coming Soon public | R − 14 days | two-week minimum |
| Submit release build for review | 7 business days before R | 3 to 5 business day review |
| Configure the launch discount | before R | set as part of release |

Chained, the fee lands about four to six weeks before release at the very latest, longer on a new account. Treat that as the point of no return, not the plan: a page public for two weeks collects almost no wishlists. If Next Fest is wanted, its deadlines come first and move every date earlier.

## Store and library assets

Source: `/doc/store/assets/standard`, `/doc/store/assets/libraryassets`. Sizes not rechecked on this pass; confirm on those pages before producing art.

| Asset | Size (px) | Rule |
| --- | --- | --- |
| Header Capsule | 920 × 430 | no text except the title |
| Small Capsule | 462 × 174 | logo fills most of it; readable when shrunk |
| Main Capsule | 1232 × 706 | no text except the title |
| Vertical Capsule | 748 × 896 | no text except the title |
| Screenshots | at least 1920 × 1080, 16:9, at least 5 | gameplay only |
| Page Background | 1438 × 810 | optional |
| Library Capsule | 600 × 900 | no text except the title |
| Library Header | 920 × 430 | falls back to the Header Capsule |
| Library Hero | 3840 × 1240 | no text; key content in the centred safe area |
| Library Logo | 1280 wide and/or 720 tall | transparent PNG, logotype only |

Time-limited text ("Out now", update banners) goes in Artwork Overrides, which expire, not in the standard capsules. Capture screenshots from a 1920 × 1080 or larger 16:9 window, since an in-engine capture has the viewport's rendered size.

## Demo and Next Fest

Source: `/doc/store/application/demos`, `/doc/marketing/upcoming_events/nextfest`

- A demo is a separate App ID linked to the base game, with its own depots, build, release checklist and review. A separate demo store page is optional; without one the demo is a button on the base game's page.
- Build the demo from its own export preset or feature flag, not a long-lived branch of the project.
- The demo's wishlist notification can be sent once, within 14 days of the demo first becoming playable; disabling and re-enabling the demo does not reset it.
- Next Fest runs three times a year (February, June, October). A title takes part in only one edition, must stay unreleased until that edition ends, and needs a public base-game store page and a publicly playable demo by the start.
- Register from the base game, not the demo.
- Submit the demo for review 5 weeks before the fest to be playable in the Press Preview (which starts 11 days before the fest), or 3 weeks before at the latest to be live when the fest starts.

## Discounts and wishlist emails

Source: `/doc/marketing/discounts`, `/doc/marketing/wishlist`

- Discounts range from 10 to 95 %. A launch discount is at most 40 % and runs 7 to 14 days.
- No discount for 30 days after release (the launch discount aside), for 30 days after a base price increase in any currency, or within 30 days of a previous discount.
- Seasonal sales skip the discount-to-discount cooldown, but a product in its release or price-increase cooldown can't join one.
- Wishlisters are emailed at release (Early Access or full) and again on leaving Early Access, and for discounts of at least 20 % that run more than 8 hours and cover the lowest-priced package. A wishlister notified about the app in the last 2 weeks is skipped (longer during busy sale periods), so space the demo, launch and first discount apart.

## Does the game need the Steamworks API?

Not to sell on Steam: a plain export uploads and runs from Steam. The API is for achievements, stats, leaderboards, Workshop, rich presence, overlay features and Steam networking (in Godot, through the GodotSteam addon). For a first release, shipping without it removes one build-review risk; add it in an update.

Saves can still sync without the API: point Steam Auto-Cloud at the directory the game writes saves to. For Godot that is where `user://` resolves (on Windows `%APPDATA%\Godot\app_userdata\<project name>`, or `%APPDATA%\<name>` with `application/config/use_custom_user_dir`); print `OS.get_user_data_dir()` from the exported build to confirm before configuring it.
