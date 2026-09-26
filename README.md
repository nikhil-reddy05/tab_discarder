# Tab Discarder :     ![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg) [![Chrome Web Store](https://img.shields.io/chrome-web-store/v/hffeenefcoplnpffddgkmlohbmjpmcji?label=Available%20on%20Chrome%20Web%20Store&logo=google-chrome)](https://chromewebstore.google.com/detail/hffeenefcoplnpffddgkmlohbmjpmcji)

**Tab Discarder** is a lightweight Chrome extension for manually sleeping eligible
background tabs in the current window to free memory and improve browser
performance.


## \:star: Features

\:mag: View tabs in the current window with state badges
\:zzz: Manually sleep eligible background tabs to save memory
\:white\_check\_mark: Keep active and already sleeping tabs safe; protect pinned and audible tabs by default
\:new\_moon: Built-in Light / Dark mode toggle
\:dart: Simple, fast, and clean UI

## 🚀 Installation

1. Go to the [Chrome Web Store listing](https://chromewebstore.google.com/detail/hffeenefcoplnpffddgkmlohbmjpmcji).
2. Click **Add to Chrome**
3. Click **Add Extension** in the confirmation dialog
4. Pin the extension to your toolbar for quick access

## 🧩 Usage

- Click the extension icon to open the popup.
- View tabs in the current browser window.
- Click **Sleep** for an eligible background tab, or use the current-window and
  group quick actions. Active and already sleeping tabs are always skipped.
- Pinned and audible tabs are protected by default; change those protections
  through the popup settings button.
- Add protected sites in Settings to keep a domain and all of its subdomains
  out of every sleep action. Enter hostnames only (for example,
  `example.com`); matching is case-insensitive and there is no wildcard,
  path, port, or URL syntax.
- Toggle light/dark mode from the popup footer.

### Keyboard shortcut

`Ctrl+Shift+L` (`Command+Shift+L` on macOS) sleeps the most recent eligible
recently awakened tab. It does nothing when there is no eligible tracked tab;
it never chooses an arbitrary background tab. Chrome may leave a suggested
shortcut unassigned when it conflicts with another extension or browser
shortcut. You can view or remap it at `chrome://extensions/shortcuts`.

<img src="https://github.com/nikhil-reddy05/tab_discarder/blob/master/screenshots/dark.png" alt="Tab Discarder Screenshot" width="200"/>  &nbsp;&nbsp;&nbsp; <img src="https://github.com/nikhil-reddy05/tab_discarder/blob/master/screenshots/light.png" alt="Tab Discarder Screenshot" width="200"/>

## \:information\_source: Known Limitation

Chrome can reject a sleep request when a tab's live state changes or is not
discardable. The extension re-checks the tab immediately before sleeping and
keeps the tab awake when Chrome does not confirm the discard.


## \:hammer\_and\_wrench: Tech Stack

* Vanilla JavaScript
* Chrome Tabs API
* HTML, CSS


## \:sparkles: Credits

Inspired by Chrome's built-in tab discarding, but with a clean manual interface and better visibility.


## 📝 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
