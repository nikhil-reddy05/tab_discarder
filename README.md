# Tab Discarder :     ![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg) [![Chrome Web Store](https://img.shields.io/chrome-web-store/v/hffeenefcoplnpffddgkmlohbmjpmcji?label=Available%20on%20Chrome%20Web%20Store&logo=google-chrome)](https://chromewebstore.google.com/detail/hffeenefcoplnpffddgkmlohbmjpmcji)

**Tab Discarder** is a lightweight Chrome extension that lets you manually discard (unload) tabs to free up memory and improve browser performance. It also visually marks already inactive (discarded) tabs so you can focus on what matters.


## \:star: Features

\:mag: View all open tabs (title)
\:zzz: Manually discard tabs to save memory
\:white\_check\_mark: Detect and label already inactive (discarded) tabs
\:new\_moon: Built-in Light / Dark mode toggle
\:dart: Simple, fast, and clean UI

## 🚀 Installation

1. Go to the [Chrome Web Store listing](https://chromewebstore.google.com/detail/hffeenefcoplnpffddgkmlohbmjpmcji).
2. Click **Add to Chrome**
3. Click **Add Extension** in the confirmation dialog
4. Pin the extension to your toolbar for quick access

## 🧩 Usage

- Click the extension icon to open the popup.
- View all open tabs.
- Click **Discard** next to any tab to free memory.
- Already inactive tabs will show as **“Already Inactive”**.
- Toggle light/dark mode from the top-right corner.

<img src="https://github.com/nikhil-reddy05/tab_discarder/blob/master/screenshots/dark.png" alt="Tab Discarder Screenshot" width="200"/>  &nbsp;&nbsp;&nbsp; <img src="https://github.com/nikhil-reddy05/tab_discarder/blob/master/screenshots/light.png" alt="Tab Discarder Screenshot" width="200"/>

## \:information\_source: Known Limitation

Due to Chrome extension API restrictions, it's not possible to **fully detect tabs that have been automatically discarded (unloaded) by Chrome**. These tabs may still show a **“Discard”** button in the interface, even though they’re already inactive.

> Clicking “Discard” again is harmless — Chrome will silently ignore the request if the tab is already unloaded.


## \:hammer\_and\_wrench: Tech Stack

* Vanilla JavaScript
* Chrome Tabs API
* HTML, CSS


## \:sparkles: Credits

Inspired by Chrome's built-in tab discarding, but with a clean manual interface and better visibility.


## 📝 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
