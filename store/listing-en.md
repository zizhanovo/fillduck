# Store listing (English)

## Name (≤45 chars)

```
FillDuck — Fill any form in one click
```

## Summary (≤132 chars)

```
Save your details once, fill any web form in one click. Tells you field by field what it filled. Data stays on your device.
```

## Category

Productivity

## Detailed description

```
FillDuck is a side-panel extension that saves you from typing the same details over and over.

Save your name, phone, address and company details as a "profile card". On any web form, open the side panel and click "Fill it all" — FillDuck fills the fields it can and reports, field by field, what it filled, what it skipped and why.

■ How it fills
· Generic matching, on any site: autocomplete attributes first, then the label next to the input, then Chinese and English keywords.
· Site recipes, for older government sites: a recipe declares which field to fill first, which suggestion to click, and in what order — so the form is filled correctly the first time. A recipe for China's 12315 consumer report form ships built in, covering all four pages.
· Recipes are plain data with no code, so a recipe someone shares with you cannot run a program in your browser.

■ What it never does
· It never clicks the final Submit button. It highlights it and leaves the click to you.
· It never types into password fields, and offers no password or bank card fields.
· It never overwrites a field you already filled in.
· It has no backend, makes no network requests, contains no analytics, ads or remote code.

■ Where your data lives
In your own browser, in plain text, on your device only. Export it to a file any time, or delete it in one click. Uninstalling removes it. Attachments live only in the side panel's memory and are gone when you close it.

■ About permissions
The extension injects its filling script into the current tab only at the moment you click the button. It never reads page content in the background. Other sites ask for your permission the first time you use them.

Open source, MIT licensed: https://github.com/zizhanovo/fillduck
```

## Single purpose

```
The extension does one thing: when the user clicks, it fills the form on the user's current tab with data the user saved locally, and reports the result field by field.
```

## Permission justifications

| Permission | Justification |
| --- | --- |
| `activeTab` | Needed to identify the current tab and inject the filling script when the user clicks the button. |
| `scripting` | The filling logic runs as an injected script in the current tab; this is the extension's core function. |
| `storage` | Stores the profile cards the user creates, locally. Data never leaves the device. |
| `unlimitedStorage` | Profile cards may contain long text fields (e.g. a multi-thousand-character case description), which can exceed the default quota. |
| `sidePanel` | The interface is a side panel so the user can see their data and the fill results next to the form. |
| Host `https://www.12315.cn/*` | The built-in 12315 site recipe runs on that site. |
| Optional host `<all_urls>` | Generic filling must be able to run on whatever site the user chooses. It is an optional permission, requested the first time the user clicks Fill on a given site, and can be declined. It is never used to read pages in the background. |

## Data usage

- Data collected: **personally identifiable information** (name, phone, email, address — entered by the user and stored on their device).
- Transferred to third parties: **no**. The extension makes no network requests.
- Sold: **no**.
- Used for purposes unrelated to the core function: **no**.
- Used for creditworthiness or lending: **no**.
- Privacy policy: `https://github.com/zizhanovo/fillduck/blob/main/docs/PRIVACY.md`

## Remote code

"No, I am not using remote code." All code ships in the package; recipes are plain data.
