# Smart Web Assistant (Chrome Extension)

An ultra-fast AI-powered Google Chrome extension (built on Manifest V3) that allows you to have deep-dive conversations about the active webpage you are browsing. Powered by the Groq API and LLaMA 3 models.

## 🚀 Features
- **Automated Scraping:** Intelligently extracts raw text content from your active tab while ignoring structural noise.
- **Persistent Memory:** Utilizes stateful conversational logic to handle continuous multi-turn follow-up questions.
- **Context Preservation:** Injects relevant website elements seamlessly directly into the context stream window.

## 🛠️ Installation & Setup
1. Get a free API key from [Groq Console](https://console.groq.com/keys) (starts with `gsk_`).
2. Open `popup.js` and replace the `API_KEY` string on Line 2 with your new Groq key.
3. Launch Google Chrome and navigate to `chrome://extensions/`.
4. Toggle the **Developer mode** slider in the top right corner to **ON**.
5. Click **Load unpacked** in the top left corner.
6. Select this project folder.
