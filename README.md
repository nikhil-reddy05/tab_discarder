# Tab Discarder \:rocket:     ![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

**Tab Discarder** is a lightweight Chrome extension that lets you manually discard (unload) tabs to free up memory and improve browser performance. It also visually marks already inactive (discarded) tabs so you can focus on what matters.


## \:star: Features

\:mag: View all open tabs (title)
\:zzz: Manually discard tabs to save memory
\:white\_check\_mark: Detect and label already inactive (discarded) tabs
\:new\_moon: Built-in Light / Dark mode toggle
\:dart: Simple, fast, and clean UI


## \:information\_source: Known Limitation

Due to Chrome extension API restrictions, it's not possible to **fully detect tabs that have been automatically discarded (unloaded) by Chrome**. These tabs may still show a **“Discard”** button in the interface, even though they’re already inactive.

> Clicking “Discard” again is harmless — Chrome will silently ignore the request if the tab is already unloaded.


## \:hammer\_and\_wrench: Tech Stack

* HTML, CSS (with CSS variables)
* Vanilla JavaScript
* Chrome Tabs API


## \:sparkles: Credits

Inspired by Chrome's built-in tab discarding, but with a clean manual interface and better visibility.


## 📝 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
