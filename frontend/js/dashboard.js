// ==========================================
// BioNexus: Main Dashboard UI Interactions
// ==========================================

// 💥 THE FIX: Secure JWT Parser (Handles Missing Padding Issues)
function parseJwt(token) {
    try {
        let base64Url = token.split('.')[1];
        let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        while (base64.length % 4) { base64 += '='; }
        let jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload);
    } catch(e) {
        return null;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    
    // --- 0. Security & Decode Token ---
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('token');
    
    if (tokenFromUrl) {
        localStorage.setItem('bionexus_token', tokenFromUrl);
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    const currentToken = localStorage.getItem('bionexus_token');
    if (!currentToken) {
        window.location.href = '/login';
        return; 
    }

    let userEmail = ""; 
    let userName = "User"; 
    
    // 💥 FIX Applied Here: No more atob() crashing!
    const payload = parseJwt(currentToken);
    if (!payload || !payload.sub) {
        console.error("Token format invalid or expired.");
        localStorage.removeItem('bionexus_token');
        window.location.href = '/login';
        return;
    }
    
    userEmail = payload.sub;
    if (payload.name) userName = payload.name;

    // Set Name & Initial Placeholder (Before DB Fetch)
    const greetingNameElement = document.getElementById('user-greeting-name');
    if (greetingNameElement) greetingNameElement.innerText = userName.split(' ')[0];
    
    const profileInitial = document.getElementById('profile-initial');
    if (profileInitial && userName) profileInitial.innerText = userName.charAt(0).toUpperCase();

    // ==========================================
    // THEME LOADER — Apply saved theme instantly
    // ==========================================
    (function applyStoredTheme() {
        const root = document.documentElement;
        const savedMode = localStorage.getItem('bionexus_theme_mode') || 'dark';
        const savedAccent = localStorage.getItem('bionexus_theme_accent') || 'cyan';
        const accentMap = { cyan: '#00f3ff', purple: '#9d4edd', green: '#00ff87', orange: '#ff9d00' };
        if (accentMap[savedAccent]) {
            root.style.setProperty('--accent-cyan', savedAccent === 'cyan' ? '#00f3ff' : accentMap[savedAccent]);
            root.style.setProperty('--accent-master', accentMap[savedAccent]);
        }
        if (savedMode === 'light') {
            root.style.setProperty('--bg-dark', '#f0f2f5');
            root.style.setProperty('--surface-dark', '#ffffff');
            root.style.setProperty('--text-primary', '#181b21');
            root.style.setProperty('--text-secondary', '#5a5f6b');
        }
    })();

    // ==========================================
    // DATA FETCHING (UNLOCKED)
    // ==========================================
    async function loadDashboardData() {
        try {
            const today = new Date().toISOString().split('T')[0];
            
            const [profileRes, logRes, dietRes] = await Promise.all([
                fetch(`/api/profile/${userEmail}`),
                fetch(`/api/health-log/${userEmail}?target_date=${today}`),
                fetch(`/api/diet/today/${userEmail}`)
            ]);

            const profileResult = await profileRes.json();
            const logResult = await logRes.json();
            const dietResult = await dietRes.json();

            let targetCalories = 2000;
            let targetProtein = 0, targetCarbs = 0, targetFats = 0, targetWater = 0;

            if (profileResult.status === "success" && profileResult.data) {
                const profile = profileResult.data;
                
                targetCalories = profile.target_calories || 2000;
                targetProtein = profile.target_protein_g || 0;
                targetCarbs = profile.target_carbs_g || 0;
                targetFats = profile.target_fats_g || 0;
                targetWater = profile.target_water_l || 0;

                let goalBadge = document.getElementById('ui-goal-badge');
                if (goalBadge && profile.goal) {
                    goalBadge.innerText = profile.goal.replace('_', ' ');
                }

                // ==========================================
                // PROFILE PICTURE LOGIC & BLURRY FIX
                // ==========================================
                const profileBtn = document.getElementById('profile-btn');
                
                if (profile.profile_image && profile.profile_image.trim() !== "") {
                    let highResImg = profile.profile_image;
                    if (highResImg.includes('googleusercontent.com')) {
                        highResImg = highResImg.replace(/=s\d+-c/g, '=s400-c');
                    }
                    profileBtn.innerHTML = `<img src="${highResImg}" alt="Profile" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover; border: 2px solid var(--accent-cyan); display: block;">`;
                } else {
                    profileBtn.innerHTML = `<span id="profile-initial">${userName.charAt(0).toUpperCase()}</span>`;
                }
            }

            // --- DIET DATA: Real consumed macros ---
            let consumedProtein = 0, consumedCarbs = 0, consumedFats = 0, consumedCalories = 0;
            
            if (dietResult.status === "success" && dietResult.data) {
                consumedProtein = dietResult.data.daily_total_protein || 0;
                consumedCarbs = dietResult.data.daily_total_carbs || 0;
                consumedFats = dietResult.data.daily_total_fats || 0;
                consumedCalories = dietResult.data.daily_total_calories || 0;
            }

            // Also add health log calories if present
            let healthLogCal = 0;
            let loggedWater = 0;
            if (logResult.status === "success" && logResult.data) {
                const log = logResult.data;
                healthLogCal = log.calories || 0;
                loggedWater = log.water_liters || 0;
                
                document.getElementById('val-steps').innerText = log.steps || 0;
                document.getElementById('val-water').innerText = loggedWater;
                document.getElementById('val-sleep').innerText = log.sleep_hours || 0;
                
                let burnedKcal = Math.round((log.steps || 0) * 0.04);
                document.getElementById('val-move').innerText = burnedKcal;
            }

            // Use diet calories if available, else health log calories
            let totalConsumed = consumedCalories > 0 ? consumedCalories : healthLogCal;
            let remainingCalories = Math.max(targetCalories - totalConsumed, 0);

            // --- Update Calorie Circle ---
            document.getElementById('val-calories').innerText = remainingCalories;
            let calPercent = Math.min((totalConsumed / targetCalories) * 100, 100) || 0;
            const calorieCircle = document.querySelector('.calorie-circle');
            if (calorieCircle) {
                calorieCircle.style.background = `conic-gradient(var(--accent-cyan) ${calPercent}%, rgba(255,255,255,0.05) 0)`;
            }

            // --- Update Macro Progress Bars with REAL consumed/target ---
            const proteinPct = targetProtein > 0 ? Math.min((consumedProtein / targetProtein) * 100, 100) : 0;
            const carbsPct = targetCarbs > 0 ? Math.min((consumedCarbs / targetCarbs) * 100, 100) : 0;
            const fatsPct = targetFats > 0 ? Math.min((consumedFats / targetFats) * 100, 100) : 0;
            const waterPct = targetWater > 0 ? Math.min((loggedWater / targetWater) * 100, 100) : 0;

            document.getElementById('ui-protein').innerText = `${Math.round(consumedProtein)}/${targetProtein}g`;
            document.getElementById('ui-carbs').innerText = `${Math.round(consumedCarbs)}/${targetCarbs}g`;
            document.getElementById('ui-fats').innerText = `${Math.round(consumedFats)}/${targetFats}g`;
            document.getElementById('ui-macro-water').innerText = `${loggedWater}/${targetWater}L`;

            document.getElementById('bar-protein').style.width = `${proteinPct}%`;
            document.getElementById('bar-carbs').style.width = `${carbsPct}%`;
            document.getElementById('bar-fats').style.width = `${fatsPct}%`;
            document.getElementById('bar-water').style.width = `${waterPct}%`;

        } catch (error) {
            console.error("Failed to fetch real data from backend:", error);
        }
    }
    
    // Trigger Data Load Instantly
    loadDashboardData();

    // --- 1. Profile Dropdown & Logout ---
    const profileBtn = document.getElementById('profile-btn');
    const profileMenu = document.getElementById('profile-menu');
    const logoutBtn = document.getElementById('logout-btn');

    if (profileBtn && profileMenu) {
        profileBtn.addEventListener('click', (e) => {
            e.stopPropagation(); 
            profileMenu.classList.toggle('hidden');
        });
    }

    window.addEventListener('click', (e) => {
        if (profileMenu && !profileMenu.classList.contains('hidden') && !profileBtn.contains(e.target)) {
            profileMenu.classList.add('hidden');
        }
    });

    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            localStorage.removeItem('bionexus_token');
            window.location.href = '/login';
        });
    }

    // --- 2. Add Data Modal ---
    const addDataBtn = document.getElementById('add-data-btn');
    const dataModal = document.getElementById('data-modal');
    const closeDataModalBtn = document.getElementById('close-data-modal');
    const healthForm = document.getElementById('health-form');

    if (addDataBtn) addDataBtn.addEventListener('click', () => dataModal.classList.remove('hidden'));
    if (closeDataModalBtn) closeDataModalBtn.addEventListener('click', () => dataModal.classList.add('hidden'));

    window.addEventListener('click', (e) => {
        if (dataModal && e.target === dataModal) dataModal.classList.add('hidden');
    });

    // --- 3. Handle Health Form Submit ---
    if (healthForm) {
        healthForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const logData = {
                user_email: userEmail,
                log_date: new Date().toISOString().split('T')[0], 
                calories: parseInt(document.getElementById('input-cal').value),
                water_liters: parseFloat(document.getElementById('input-water').value),
                sleep_hours: parseFloat(document.getElementById('input-sleep').value),
                steps: parseInt(document.getElementById('input-steps').value)
            };

            try {
                const response = await fetch('/api/log-health', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(logData)
                });

                const result = await response.json();

                if (response.ok) {
                    await loadDashboardData(); 

                    dataModal.classList.add('hidden');
                    healthForm.reset();

                    const chatBody = document.querySelector('.ria-chat-body');
                    if (chatBody && result.ai_insight) {
                        appendMessage("Analyzing your new data... 📊", false);
                        setTimeout(() => appendMessage(result.ai_insight, false), 1000);
                    }
                }
            } catch (error) {
                console.error("Error logging health data:", error);
            }
        });
    }

    // --- 4. RIA AI Chat Modal ---
    const riaBotBtn = document.getElementById('ria-bot-btn');
    const riaChatModal = document.getElementById('ria-chat-modal');
    const closeRiaModalBtn = document.getElementById('close-ria-modal');

    if (riaBotBtn) riaBotBtn.addEventListener('click', () => riaChatModal.classList.remove('hidden'));
    if (closeRiaModalBtn) closeRiaModalBtn.addEventListener('click', () => riaChatModal.classList.add('hidden'));

    window.addEventListener('click', (e) => {
        if (riaChatModal && e.target === riaChatModal) riaChatModal.classList.add('hidden');
    });

    // ==========================================
    // 5. RIA AI Chat Logic
    // ==========================================
    const chatInput = document.querySelector('.chat-input');
    const sendBtn = document.querySelector('.send-btn');
    const chatBody = document.querySelector('.ria-chat-body');

    window.appendMessage = function(text, isUser = false) {
        if (!chatBody) return;
        const msgDiv = document.createElement('div');
        msgDiv.classList.add('chat-msg');
        
        if (!isUser) msgDiv.classList.add('ria-msg');
        else msgDiv.style.justifyContent = 'flex-end';

        const bubbleDiv = document.createElement('div');
        bubbleDiv.classList.add('msg-bubble');
        
        if (isUser) {
            bubbleDiv.style.background = 'linear-gradient(135deg, var(--accent-cyan), #0088ff)';
            bubbleDiv.style.color = '#fff';
            bubbleDiv.style.borderTopRightRadius = '4px';
        }

        bubbleDiv.innerText = text;
        msgDiv.appendChild(bubbleDiv);
        chatBody.appendChild(msgDiv);
        chatBody.scrollTop = chatBody.scrollHeight;
    };

    if (chatInput && sendBtn && chatBody) {
        async function sendMessage() {
            const message = chatInput.value.trim();
            if (!message) return;

            window.appendMessage(message, true);
            chatInput.value = '';
            window.appendMessage("RIA is typing...", false);
            const typingMsg = chatBody.lastChild;

            try {
                const response = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user_message: message, user_email: userEmail })
                });

                const data = await response.json();
                chatBody.removeChild(typingMsg);
                
                if (response.ok) window.appendMessage(data.reply, false);
                else window.appendMessage("Oops, I lost connection! 🤖", false);

            } catch (error) {
                chatBody.removeChild(typingMsg);
                window.appendMessage("Connection error.", false);
            }
        }

        sendBtn.addEventListener('click', sendMessage);
        chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });
    }
});