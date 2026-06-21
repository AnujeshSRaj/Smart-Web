// WARNING: Do not hardcode your production API key here if publishing to the Chrome Web Store.
const API_KEY = "YOUR_GROQ_API_KEY_HERE";
const API_URL = `https://api.groq.com/openai/v1/chat/completions`;

let chatHistory = [];
let pageContextExtracted = false;
let pageTextContent = "";

const chatContainer = document.getElementById('chat-container');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const statusDiv = document.getElementById('status');

function appendMessage(text, sender) {
  const msg = document.createElement('div');
  msg.classList.add('message', sender);
  if (sender === 'gemini') {
    msg.innerHTML = marked.parse(text);
  } else {
    msg.innerText = text;
  }
  chatContainer.appendChild(msg);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

async function getActiveTabContext() {
  statusDiv.innerText = "Reading webpage content...";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id || tab.url.startsWith('chrome://') || tab.url.startsWith('edge://')) {
      statusDiv.innerText = "Cannot read restricted system pages.";
      return "";
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });

    if (results && results[0] && results[0].result) {
      pageContextExtracted = true;
      statusDiv.innerText = "Webpage analyzed.";
      return results[0].result.substring(0, 40000);
    }
  } catch (err) {
    statusDiv.innerText = "Error reading page context.";
    console.error(err);
  }
  return "";
}

async function sendMessageToGemini() {
  const query = userInput.value.trim();
  if (!query) return;

  appendMessage(query, 'user');
  userInput.value = '';
  sendBtn.disabled = true;
  statusDiv.innerText = "Thinking...";

  if (!pageContextExtracted) {
    pageTextContent = await getActiveTabContext();
  }

  let apiContents = [...chatHistory];
  
  if (apiContents.length === 0 && pageTextContent) {
    apiContents.push({
      role: "user",
      content: `You are an intelligent web reading assistant. The user is currently viewing a webpage with the following text content:\n\n"${pageTextContent}"\n\nPlease answer the user's question clearly and concisely, formatting your response using Markdown (bolding, lists, code blocks where appropriate). Be highly aware of the page context.\n\nUser Question: ${query}`
    });
  } else {
    apiContents.push({
      role: "user",
      content: query
    });
  }

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${API_KEY}`
      },
      body: JSON.stringify({ 
        model: "llama-3.3-70b-versatile",
        messages: apiContents 
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`HTTP Error Status: ${response.status} - ${errorData.error?.message || "Unknown error"}`);
    }

    const data = await response.json();
    
    let replyText = "";
    if (data.choices && data.choices.length > 0) {
      const choice = data.choices[0];
      if (choice.message && choice.message.content) {
        replyText = choice.message.content;
      } else {
        console.error("Unexpected choice format:", choice);
        throw new Error("Unexpected response format from API.");
      }
    } else if (data.error) {
      console.error("API Error details:", data.error);
      throw new Error(`API Error: ${data.error.message || "Unknown API error"}`);
    } else {
      console.error("Unexpected data:", data);
      throw new Error("No choices returned from API.");
    }

    appendMessage(replyText, 'gemini');
    statusDiv.innerText = "Ready";

    chatHistory.push({ role: "user", content: query });
    chatHistory.push({ role: "assistant", content: replyText });

  } catch (error) {
    appendMessage(`Error: ${error.message || "Failed to communicate with API."}`, 'gemini');
    statusDiv.innerText = "Error";
    console.error(error);
  } finally {
    sendBtn.disabled = false;
  }
}

sendBtn.addEventListener('click', sendMessageToGemini);
userInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendMessageToGemini();
});