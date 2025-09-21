# SubSpy 🔍


SubSpy is a Chrome/Firefox extension that discovers subdomains of the website you are currently visiting. It uses a customizable wordlist and DNS over HTTPS (DoH) to scan efficiently.

## Features

- 🚀 One-click scan of the active tab's domain  
- 📂 Use built-in or upload your own wordlist  
- ⏸️ Pause / ▶️ Resume / ⏹️ Stop scans  
- 📊 Real-time progress & found subdomain count  
- 📥 Export results as `.txt`  
- 🖱️ Click to copy subdomains  

## Installation

### Chrome

```bash
git clone https://github.com/ghaziwali/SubSpy.git
```

1. Open Chrome → Extensions → Load unpacked
2. Select the SubSpy folder

### Firefox

1. Rename `manifest-firefox.json` to `manifest.json` in the SubSpy folder
2. Add this polyfill at the top of `popup.js` so Firefox recognizes Chrome APIs:

```javascript
// Polyfill so browser.* works in Firefox
if (typeof browser === "undefined") {
  var browser = chrome;
}
```

3. Open Firefox → `about:debugging` → This Firefox → Load Temporary Add-on
4. Select the Firefox manifest

⚠️ **Note:** Firefox does not fully support MV3 service workers. All scanning logic runs from the popup.

## Usage

1. Navigate to a website you want to scan
2. Click the SubSpy icon in your browser toolbar
3. Click **Scan** to start scanning subdomains
4. Pause, resume, or stop scans as needed
5. Export found subdomains using the **Download** button
6. Click individual subdomains to copy them to your clipboard

## Screenshots / Demo

*Add screenshots or GIFs of the extension in action here for better visibility.*

## Contributing

Contributions are welcome!

Please open an issue or submit a pull request if you want to add features, fix bugs, or improve documentation.
