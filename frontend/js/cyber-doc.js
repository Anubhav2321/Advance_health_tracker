/**
 * BioNexus Cyber-Doc AI Core — Premium Medical Assistant
 * Features: Voice Input (Web Speech API + Whisper fallback), 
 *           Text-to-Speech, Multi-Language Support, Enhanced Rendering,
 *           Chat History with Session Management
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
    gujarati: { bcp47: "gu-IN", ttsLang: "gu-IN", name: "ગુજરાতી" }
};

let currentLanguage = "english";
let currentSessionId = null;

// ==========================================
// DOM ELEMENTS
// ==========================================
let chatBox, userInput, typingIndicator, typingLabel, lockdownScreen, lockdownText;
let voiceBtn, voiceStatus, voiceStatusText, languageSelector;
let historyBtn, historySidebar, historyOverlay, historyList, historyCloseBtn, newChatBtn;

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

    // History elements
    historyBtn = document.getElementById("history-btn");
    historySidebar = document.getElementById("history-sidebar");
    historyOverlay = document.getElementById("history-overlay");
    historyList = document.getElementById("history-list");
    historyCloseBtn = document.getElementById("history-close-btn");
    newChatBtn = document.getElementById("new-chat-btn");

    // Language selector event
    languageSelector.addEventListener('change', (e) => {
        currentLanguage = e.target.value;
        const langName = LANGUAGE_CONFIG[currentLanguage]?.name || "English";
        showSystemNote(`Language switched to ${langName}`);
    });

    // Voice button event
    voiceBtn.addEventListener('click', toggleVoiceRecording);

    // History sidebar events
    historyBtn.addEventListener('click', openHistorySidebar);
    historyCloseBtn.addEventListener('click', closeHistorySidebar);
    historyOverlay.addEventListener('click', closeHistorySidebar);

    // New chat button
    newChatBtn.addEventListener('click', startNewChat);

    // Focus input
    userInput.focus();

    // Load history on page load
    loadChatHistory();
});

// ==========================================
// CHAT HISTORY SIDEBAR
// ==========================================
function openHistorySidebar() {
    historySidebar.classList.add('active');
    historyOverlay.classList.add('active');
    loadChatHistory();
}

function closeHistorySidebar() {
    historySidebar.classList.remove('active');
    historyOverlay.classList.remove('active');
}

async function loadChatHistory() {
    if (!userEmail) return;
    
    try {
        const res = await fetch(`/api/ai/history/${userEmail}`);
        const data = await res.json();
        
        if (data.status === 'success' && data.sessions && data.sessions.length > 0) {
            historyList.innerHTML = '';
            
            data.sessions.forEach(session => {
                const timeStr = formatRelativeTime(session.updated_at || session.created_at);
                const phaseLabel = getPhaseLabel(session.phase);
                const isActive = session.session_id === currentSessionId;
                
                const item = document.createElement('div');
                item.className = `history-item ${isActive ? 'active' : ''}`;
                item.innerHTML = `
                    <div class="history-item-title">${escapeHtml(session.title || 'Untitled')}</div>
                    <div class="history-item-meta">
                        <span class="history-item-time">${timeStr}</span>
                        <div style="display:flex;align-items:center;gap:4px;">
                            <span class="history-item-phase ${session.phase || 'initial'}">${phaseLabel}</span>
                            <button class="history-item-delete" data-id="${session.session_id}" title="Delete">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    </div>
                `;
                
                // Click to load session
                item.addEventListener('click', (e) => {
                    if (e.target.closest('.history-item-delete')) return;
                    loadSession(session.session_id);
                    closeHistorySidebar();
                });
                
                // Delete button
                const deleteBtn = item.querySelector('.history-item-delete');
                deleteBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if (confirm('Delete this conversation?')) {
                        await deleteSession(session.session_id);
                        loadChatHistory();
                    }
                });
                
                historyList.appendChild(item);
            });
        } else {
            historyList.innerHTML = `
                <div class="history-empty">
                    <i class="fa-solid fa-comments"></i>
                    No conversations yet.<br>Start a consultation to see history here.
                </div>
            `;
        }
    } catch (err) {
        console.error("Failed to load chat history:", err);
        historyList.innerHTML = `
            <div class="history-empty">
                <i class="fa-solid fa-wifi"></i>
                Failed to load history.
            </div>
        `;
    }
}

async function loadSession(sessionId) {
    try {
        const res = await fetch(`/api/ai/session/${sessionId}`);
        const data = await res.json();
        
        if (data.status === 'success' && data.session) {
            currentSessionId = sessionId;
            
            // Clear chat and render session messages
            chatBox.innerHTML = '';
            
            // Re-create typing indicator FIRST so appendMessage/appendBotMessage
            // have a valid reference node for insertBefore()
            const typingDiv = document.createElement('div');
            typingDiv.className = 'typing-indicator';
            typingDiv.id = 'typing';
            typingDiv.innerHTML = `
                <div class="typing-dots"><span></span><span></span><span></span></div>
                <div class="typing-label" id="typing-label">Analyzing symptoms...</div>
            `;
            chatBox.appendChild(typingDiv);
            typingIndicator = typingDiv;
            typingLabel = typingDiv.querySelector('#typing-label');
            
            const messages = data.session.messages || [];
            messages.forEach(msg => {
                if (msg.role === 'user') {
                    appendMessage(msg.content, 'user-msg');
                } else {
                    appendBotMessage(msg.content);
                }
            });
            
            if (messages.length === 0) {
                showWelcomeMessage();
            }
            
            showSystemNote(`Loaded conversation: "${data.session.title}"`);
        }
    } catch (err) {
        console.error("Failed to load session:", err);
        showSystemNote("Failed to load conversation.");
    }
}

async function deleteSession(sessionId) {
    try {
        await fetch(`/api/ai/session/${sessionId}`, { method: 'DELETE' });
        if (sessionId === currentSessionId) {
            currentSessionId = null;
            startFreshChat();
        }
    } catch (err) {
        console.error("Failed to delete session:", err);
    }
}

async function startNewChat() {
    try {
        const res = await fetch('/api/ai/new-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: userEmail })
        });
        const data = await res.json();
        
        if (data.status === 'success') {
            currentSessionId = data.session_id;
            startFreshChat();
            showSystemNote("New consultation started. Describe your symptoms.");
        }
    } catch (err) {
        console.error("Failed to start new chat:", err);
        showSystemNote("Failed to start new session.");
    }
}

function startFreshChat() {
    chatBox.innerHTML = '';
    showWelcomeMessage();
    
    // Re-add typing indicator
    const typingDiv = document.createElement('div');
    typingDiv.className = 'typing-indicator';
    typingDiv.id = 'typing';
    typingDiv.innerHTML = `
        <div class="typing-dots"><span></span><span></span><span></span></div>
        <div class="typing-label" id="typing-label">Analyzing symptoms...</div>
    `;
    chatBox.appendChild(typingDiv);
    typingIndicator = typingDiv;
    typingLabel = typingDiv.querySelector('#typing-label');
}

function showWelcomeMessage() {
    const welcomeDiv = document.createElement('div');
    welcomeDiv.className = 'message bot-msg';
    welcomeDiv.innerHTML = `
        <div class="welcome-msg">
            <span class="doc-icon"><i class="fa-solid fa-staff-snake"></i></span>
            <h3>BioNexus Medical AI Core</h3>
            <p>I am your premium AI diagnostic assistant. Describe your symptoms in detail and I will guide you through a thorough clinical analysis.</p>
            <div class="welcome-badges">
                <span><i class="fa-solid fa-stethoscope"></i> Diagnostics</span>
                <span><i class="fa-solid fa-prescription"></i> Prescriptions</span>
                <span><i class="fa-solid fa-microphone"></i> Voice Input</span>
                <span><i class="fa-solid fa-language"></i> Multi-Language</span>
            </div>
        </div>
    `;
    chatBox.appendChild(welcomeDiv);
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================
function formatRelativeTime(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getPhaseLabel(phase) {
    const labels = {
        'initial': 'New',
        'follow_up': 'In Progress',
        'diagnosis': 'Diagnosis',
        'prescribed': 'Complete'
    };
    return labels[phase] || 'New';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

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
                language: currentLanguage,
                session_id: currentSessionId
            })
        });

        const data = await response.json();
        hideTyping();

        // Update session ID from response
        if (data.session_id) {
            currentSessionId = data.session_id;
        }

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
    if (typingIndicator && chatBox.contains(typingIndicator)) {
        chatBox.insertBefore(msgDiv, typingIndicator);
    } else {
        chatBox.appendChild(msgDiv);
    }
    chatBox.scrollTop = chatBox.scrollHeight;
}

function appendBotMessage(text) {
    const msgDiv = document.createElement("div");
    msgDiv.className = "message bot-msg";
    
    // Format the AI response with rich styling
    let formatted = formatMedicalResponse(text);
    
    msgDiv.innerHTML = formatted;

    if (typingIndicator && chatBox.contains(typingIndicator)) {
        chatBox.insertBefore(msgDiv, typingIndicator);
    } else {
        chatBox.appendChild(msgDiv);
    }
    chatBox.scrollTop = chatBox.scrollHeight;
}

function formatMedicalResponse(text) {
    let html = text;
    
    // Convert markdown-style bold **text** to <strong>
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Convert lines starting with emoji indicators to styled sections
    html = html.replace(/📋\s*\*?\*?(DIAGNOSIS|निदान|রোগ নির্ণয়).*?:/gi, '<br><strong style="color:#00f3ff;font-size:0.92rem;"><i class="fa-solid fa-clipboard-list" style="margin-right:4px;"></i> DIAGNOSIS:</strong>');
    html = html.replace(/💊\s*\*?\*?(MEDICINE|दवाई|ওষুধ).*?:/gi, '<br><strong style="color:#00ff87;font-size:0.92rem;"><i class="fa-solid fa-pills" style="margin-right:4px;"></i> MEDICINE:</strong>');
    html = html.replace(/🍽️?\s*\*?\*?(DIET|आहार|খাদ্য).*?:/gi, '<br><strong style="color:#ff9d00;font-size:0.92rem;"><i class="fa-solid fa-utensils" style="margin-right:4px;"></i> DIET & REST:</strong>');
    html = html.replace(/⚠️\s*\*?\*?(RED FLAG|चेतावनी|সতর্কতা|WARNING).*?:/gi, '<br><strong style="color:#ff6b6b;font-size:0.92rem;"><i class="fa-solid fa-triangle-exclamation" style="margin-right:4px;"></i> RED FLAGS:</strong>');
    html = html.replace(/📌\s*\*?\*?(DISCLAIMER|अस्वीकरण|দাবিত্যাগ).*?:/gi, '<br><strong style="color:#a0a6b1;font-size:0.82rem;"><i class="fa-solid fa-circle-info" style="margin-right:4px;"></i> DISCLAIMER:</strong>');
    
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
                            audio_base64: base64Audio.split(',')[1],
                            language: currentLanguage,
                            session_id: currentSessionId
                        })
                    });

                    const data = await response.json();
                    hideTyping();

                    // Update session ID
                    if (data.session_id) {
                        currentSessionId = data.session_id;
                    }

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