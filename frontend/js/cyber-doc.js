/**
 * BioNexus Cyber-Doc AI Core Logic
 */

// 🌟 DYNAMIC EMAIL FETCH: Gets the email of whoever is currently logged in
function getLoggedInUserEmail() {
    // Option 1: Check if email is directly saved in localStorage (Dashboard standard)
    const email = localStorage.getItem("userEmail");
    if (email) return email;

    // Option 2: Extract it dynamically from the JWT Token
    const token = localStorage.getItem("token") || localStorage.getItem("access_token");
    if (token) {
        try {
            const payloadBase64 = token.split('.')[1];
            const decodedPayload = JSON.parse(atob(payloadBase64));
            return decodedPayload.sub; // FastAPI saves the email in the 'sub' field
        } catch (error) {
            console.error("Failed to decode token:", error);
        }
    }

    // Security: If no valid session is found, kick them out to the login page
    alert("Authentication Error: Active session not found. Please login to access AI Core.");
    window.location.href = "/login";
    return null;
}

// Automatically fetch the correct user's email
const userEmail = getLoggedInUserEmail();

// Initialize DOM elements globally so functions can access them
let chatBox, userInput, typingIndicator, lockdownScreen, lockdownText;

// Wait for the DOM to fully load before assigning variables
document.addEventListener('DOMContentLoaded', () => {
    chatBox = document.getElementById("chat-box");
    userInput = document.getElementById("user-input");
    typingIndicator = document.getElementById("typing");
    lockdownScreen = document.getElementById("lockdown-screen");
    lockdownText = document.getElementById("lockdown-text");
});

// Handle the "Enter" key press on the input box
function handleEnter(e) {
    if (e.key === 'Enter') {
        sendMessage();
    }
}

// Main function to send message to the FastAPI Backend
async function sendMessage() {
    const text = userInput.value.trim();
    if (!text || !userEmail) return;

    // 1. Add User message to UI
    appendMessage(text, 'user-msg');
    userInput.value = '';
    
    // Show typing indicator while waiting for response
    typingIndicator.style.display = 'block';
    chatBox.appendChild(typingIndicator); // Move indicator to the bottom
    chatBox.scrollTop = chatBox.scrollHeight; // Scroll to bottom

    try {
        // 2. Call FastAPI Backend AI Route
        const response = await fetch('/api/ai/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: userEmail, message: text })
        });

        const data = await response.json();
        typingIndicator.style.display = 'none';

        // 3. Handle Backend Logic (Success, Warning, Blocked)
        if (data.status === "blocked") {
            lockdownText.innerText = data.message;
            lockdownScreen.classList.add("active"); // Trigger red screen
        } 
        else if (data.status === "warning") {
            appendMessage(data.message, 'warning-msg'); // Show yellow warning bubble
        } 
        else {
            appendMessage(data.message, 'bot-msg'); // Normal AI response
        }

    } catch (error) {
        typingIndicator.style.display = 'none';
        appendMessage("System Error: Unable to connect to AI Core.", 'warning-msg');
        console.error("AI Engine Connection Failed:", error);
    }
}

// Helper function to append message bubbles to the chat box
function appendMessage(text, className) {
    const msgDiv = document.createElement("div");
    msgDiv.className = `message ${className}`;
    
    // Convert plain text newlines (\n) to HTML breaks (<br>) for neat formatting
    msgDiv.innerHTML = text.replace(/\n/g, '<br>');
    
    // Insert message right before the typing indicator
    chatBox.insertBefore(msgDiv, typingIndicator);
    chatBox.scrollTop = chatBox.scrollHeight;
}