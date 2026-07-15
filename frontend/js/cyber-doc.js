/**
 * BioNexus Cyber-Doc AI Core — Premium Medical Assistant
 * Features: Voice Input (Web Speech API + Whisper fallback), 
 *           Text-to-Speech, Multi-Language Support, Enhanced Rendering
 */

// ==========================================
// AUTHENTICATION & EMAIL FETCH
// ==========================================
function getLoggedInUserEmail() {
    const email = localStorage.getItem("userEmail") || localStorage.getItem("email") || localStorage.getItem("user_email");
    if (email) return email;

    const token = localStorage.getItem("bionexus_token") || 
                  localStorage.getItem("token") || 
                  localStorage.getItem("access_token") || 
                  localStorage.getItem("jwt_token") || 
                  localStorage.getItem("auth_token");
                  
    if (token) {
        try {
            let cleanToken = token.replace(/^"|"$/g, ''); 
            let payloadBase64 = cleanToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
            while (payloadBase64.length % 4 !== 0) { payloadBase64 += '='; }
            const decodedEmail = JSON.parse(atob(payloadBase64)).sub;
            return decodedEmail;
        } catch (error) {
            console.error("Token decode error:", error);
        }
    }

    const manualEmail = prompt("SYSTEM OVERRIDE: Auto-detect failed. Please enter your registered email manually:");
    if (manualEmail && manualEmail.includes("@")) {
        localStorage.setItem("userEmail", manualEmail);
        return manualEmail;
    }

    alert("Authentication Error: Valid email not provided.");
    window.location.href = "/login";
    return null;
}

const userEmail = getLoggedInUserEmail();

// ==========================================
// LANGUAGE CONFIGURATION
// ==========================================
const LANGUAGE_CONFIG = {
    english:  { bcp47: "en-US", ttsLang: "en-US", name: "English" },
    hindi:    { bcp47: "hi-IN", ttsLang: "hi-IN", name: "हिन्दी" },
    bengali:  { bcp47: "bn-IN", ttsLang: "bn-IN", name: "বাংলা" },
    bhojpuri: { bcp47: "hi-IN", ttsLang: "hi-IN", name: "भोजपुरी" },  // Bhojpuri uses Hindi recognition
    gujarati: { bcp47: "gu-IN", ttsLang: "gu-IN", name: "ગુજરાતી" }
};

let currentLanguage = "english";

// ==========================================
// DOM ELEMENTS
// ==========================================
let chatBox, userInput, typingIndicator, typingLabel, lockdownScreen, lockdownText;
let voiceBtn, voiceStatus, voiceStatusText, languageSelector;

document.addEventListener('DOMContentLoaded', () => {
    chatBox = document.getElementById("chat-box");
    userInput = document.getElementById("user-input");
    typingIndicator = document.getElementById("typing");
    typingLabel = document.getElementById("typing-label");
    lockdownScreen = document.getElementById("lockdown-screen");
    lockdownText = document.getElementById("lockdown-text");
    voiceBtn = document.getElementById("voice-btn");
    voiceStatus = document.getElementById("voice-status");
    voiceStatusText = document.getElementById("voice-status-text");
    languageSelector = document.getElementById("language-selector");

    // Language selector event
    languageSelector.addEventListener('change', (e) => {
        currentLanguage = e.target.value;
        const langName = LANGUAGE_CONFIG[currentLanguage]?.name || "English";
        showSystemNote(`Language switched to ${langName}`);
    });

    // Voice button event
    voiceBtn.addEventListener('click', toggleVoiceRecording);

    // Focus input
    userInput.focus();
});

// ==========================================
// TEXT MESSAGING
// ==========================================
function handleEnter(e) {
    if (e.key === 'Enter') sendMessage();
}

async function sendMessage(overrideText = null) {
    const text = overrideText || userInput.value.trim();
    if (!text || !userEmail) return;

    appendMessage(text, 'user-msg');
    if (!overrideText) userInput.value = '';
    
    showTyping("Analyzing symptoms...");

    try {
        const response = await fetch('/api/ai/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                email: userEmail, 
                message: text,
                language: currentLanguage 
            })
        });

        const data = await response.json();
        hideTyping();

        if (data.status === "blocked") {
            lockdownText.innerText = data.message;
            lockdownScreen.classList.add("active"); 
        } 
        else if (data.status === "warning") {
            appendMessage(data.message, 'warning-msg'); 
        } 
        else {
            appendBotMessage(data.message);
        }

    } catch (error) {
        hideTyping();
        appendMessage("System Error: Unable to connect to AI Core.", 'warning-msg');
        console.error("AI Engine Connection Failed:", error);
    }
}

// ==========================================
// MESSAGE RENDERING
// ==========================================
function appendMessage(text, className) {
    const msgDiv = document.createElement("div");
    msgDiv.className = `message ${className}`;
    msgDiv.innerHTML = text.replace(/\n/g, '<br>');
    chatBox.insertBefore(msgDiv, typingIndicator);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function appendBotMessage(text) {
    const msgDiv = document.createElement("div");
    msgDiv.className = "message bot-msg";
    
    // Format the AI response with rich styling
    let formatted = formatMedicalResponse(text);
    
    msgDiv.innerHTML = formatted;

    // Add TTS button
    const ttsBtn = document.createElement("button");
    ttsBtn.className = "msg-tts-btn";
    ttsBtn.innerHTML = '<i class="fa-solid fa-volume-up"></i>';
    ttsBtn.title = "Read aloud";
    ttsBtn.onclick = () => speakText(text, ttsBtn);
    msgDiv.appendChild(ttsBtn);
    msgDiv.style.paddingBottom = "26px"; // space for TTS button

    chatBox.insertBefore(msgDiv, typingIndicator);
    chatBox.scrollTop = chatBox.scrollHeight;

    // Auto-speak the response
    speakText(text);
}

function formatMedicalResponse(text) {
    let html = text;
    
    // Convert markdown-style bold **text** to <strong>
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Convert lines starting with emoji indicators to styled sections
    html = html.replace(/📋\s*\*?\*?(DIAGNOSIS|निदान|রোগ নির্ণয়).*?:/gi, '<br><strong style="color:#00f3ff;font-size:0.92rem;">📋 DIAGNOSIS:</strong>');
    html = html.replace(/💊\s*\*?\*?(MEDICINE|दवाई|ওষুধ).*?:/gi, '<br><strong style="color:#00ff87;font-size:0.92rem;">💊 MEDICINE:</strong>');
    html = html.replace(/🍽️?\s*\*?\*?(DIET|आहार|খাদ্য).*?:/gi, '<br><strong style="color:#ff9d00;font-size:0.92rem;">🍽️ DIET & REST:</strong>');
    html = html.replace(/⚠️\s*\*?\*?(RED FLAG|चेतावनी|সতর্কতা|WARNING).*?:/gi, '<br><strong style="color:#ff6b6b;font-size:0.92rem;">⚠️ RED FLAGS:</strong>');
    html = html.replace(/📌\s*\*?\*?(DISCLAIMER|अस्वीकरण|দাবিত্যাগ).*?:/gi, '<br><strong style="color:#a0a6b1;font-size:0.82rem;">📌 DISCLAIMER:</strong>');
    
    // Convert bullet points (- or •) to styled list items
    html = html.replace(/^[\-•]\s+(.+)/gm, '<div style="padding-left:12px;margin:3px 0;"><span style="color:#00f3ff;margin-right:6px;">▸</span>$1</div>');
    
    // Convert numbered lists
    html = html.replace(/^(\d+)\.\s+(.+)/gm, '<div style="padding-left:12px;margin:3px 0;"><span style="color:#00f3ff;font-weight:600;margin-right:6px;">$1.</span>$2</div>');

    // Convert newlines to br
    html = html.replace(/\n/g, '<br>');
    
    return html;
}

function showSystemNote(text) {
    const noteDiv = document.createElement("div");
    noteDiv.className = "message";
    noteDiv.style.cssText = "align-self:center;text-align:center;font-size:0.72rem;color:rgba(0,243,255,0.5);padding:6px 14px;background:rgba(0,243,255,0.04);border:1px solid rgba(0,243,255,0.08);border-radius:20px;";
    noteDiv.textContent = text;
    chatBox.insertBefore(noteDiv, typingIndicator);
    chatBox.scrollTop = chatBox.scrollHeight;
}

// ==========================================
// TYPING INDICATOR
// ==========================================
function showTyping(label = "Analyzing...") {
    typingLabel.textContent = label;
    typingIndicator.style.display = 'block';
    chatBox.scrollTop = chatBox.scrollHeight;
}

function hideTyping() {
    typingIndicator.style.display = 'none';
}

// ==========================================
// VOICE INPUT — Web Speech API + Fallback
// ==========================================
let isRecording = false;
let speechRecognition = null;
let mediaRecorder = null;
let audioChunks = [];

// Check if Web Speech API is supported
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const hasSpeechAPI = !!SpeechRecognition;

function toggleVoiceRecording() {
    if (isRecording) {
        stopRecording();
    } else {
        startRecording();
    }
}

function startRecording() {
    isRecording = true;
    voiceBtn.classList.add('recording');
    voiceBtn.innerHTML = '<i class="fa-solid fa-stop"></i>';
    voiceStatus.classList.add('active');
    
    const langConfig = LANGUAGE_CONFIG[currentLanguage] || LANGUAGE_CONFIG.english;

    if (hasSpeechAPI) {
        // Use native Web Speech API
        voiceStatusText.textContent = `Listening in ${langConfig.name}...`;
        
        speechRecognition = new SpeechRecognition();
        speechRecognition.lang = langConfig.bcp47;
        speechRecognition.interimResults = false;
        speechRecognition.maxAlternatives = 1;
        speechRecognition.continuous = false;

        speechRecognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            stopRecording();
            if (transcript.trim()) {
                showSystemNote(`🎤 Voice: "${transcript}"`);
                sendMessage(transcript);
            }
        };

        speechRecognition.onerror = (event) => {
            console.error("Speech recognition error:", event.error);
            stopRecording();
            if (event.error === 'no-speech') {
                showSystemNote("No speech detected. Please try again.");
            } else if (event.error === 'not-allowed') {
                showSystemNote("Microphone access denied. Please allow microphone access.");
            } else {
                // Fallback to MediaRecorder
                startMediaRecorderFallback();
            }
        };

        speechRecognition.onend = () => {
            if (isRecording) stopRecording();
        };

        try {
            speechRecognition.start();
        } catch (e) {
            console.error("SpeechRecognition start failed:", e);
            startMediaRecorderFallback();
        }
    } else {
        // Fallback: Use MediaRecorder to capture audio → send to Groq Whisper
        startMediaRecorderFallback();
    }
}

function startMediaRecorderFallback() {
    voiceStatusText.textContent = "Recording audio...";
    
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            audioChunks = [];
            mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            
            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) audioChunks.push(event.data);
            };

            mediaRecorder.onstop = async () => {
                stream.getTracks().forEach(track => track.stop());
                
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                const base64Audio = await blobToBase64(audioBlob);
                
                showTyping("Processing voice...");
                voiceStatus.classList.remove('active');

                try {
                    const response = await fetch('/api/ai/voice-chat', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            email: userEmail,
                            audio_base64: base64Audio.split(',')[1], // Remove data URL prefix
                            language: currentLanguage
                        })
                    });

                    const data = await response.json();
                    hideTyping();

                    if (data.transcription) {
                        showSystemNote(`🎤 Voice: "${data.transcription}"`);
                    }

                    if (data.status === "blocked") {
                        lockdownText.innerText = data.message;
                        lockdownScreen.classList.add("active");
                    } else if (data.status === "warning") {
                        appendMessage(data.message, 'warning-msg');
                    } else {
                        appendBotMessage(data.message);
                    }
                } catch (error) {
                    hideTyping();
                    appendMessage("Voice processing failed. Please try typing.", 'warning-msg');
                    console.error("Voice chat error:", error);
                }
            };

            mediaRecorder.start();
        })
        .catch(err => {
            console.error("Microphone access denied:", err);
            stopRecording();
            showSystemNote("Microphone access denied. Please allow microphone access in your browser settings.");
        });
}

function stopRecording() {
    isRecording = false;
    voiceBtn.classList.remove('recording');
    voiceBtn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
    voiceStatus.classList.remove('active');

    if (speechRecognition) {
        try { speechRecognition.stop(); } catch (e) {}
        speechRecognition = null;
    }
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        mediaRecorder = null;
    }
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// ==========================================
// TEXT-TO-SPEECH (TTS)
// ==========================================
let currentUtterance = null;

function speakText(text, buttonElement = null) {
    // Cancel any ongoing speech
    if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
        // If clicking the same button, just stop
        if (buttonElement && buttonElement.classList.contains('speaking')) {
            buttonElement.classList.remove('speaking');
            return;
        }
    }

    // Clean text for TTS (remove emojis and formatting)
    let cleanText = text
        .replace(/[📋💊🍽️⚠️📌🎤✅❌🔴🟢🟡]/g, '')
        .replace(/\*\*/g, '')
        .replace(/[▸•\-]/g, ',')
        .replace(/\n+/g, '. ')
        .replace(/\s+/g, ' ')
        .trim();

    if (!cleanText) return;

    const langConfig = LANGUAGE_CONFIG[currentLanguage] || LANGUAGE_CONFIG.english;
    
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = langConfig.ttsLang;
    utterance.rate = 0.95;
    utterance.pitch = 1;
    utterance.volume = 0.9;

    // Try to find a matching voice
    const voices = window.speechSynthesis.getVoices();
    const matchingVoice = voices.find(v => v.lang.startsWith(langConfig.ttsLang.split('-')[0]));
    if (matchingVoice) utterance.voice = matchingVoice;

    if (buttonElement) {
        buttonElement.classList.add('speaking');
        utterance.onend = () => buttonElement.classList.remove('speaking');
        utterance.onerror = () => buttonElement.classList.remove('speaking');
    }

    currentUtterance = utterance;
    window.speechSynthesis.speak(utterance);
}

// Preload voices
if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
    };
}