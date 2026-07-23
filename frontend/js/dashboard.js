// ==========================================
// BioNexus: Main Dashboard UI + Data Engine
// ==========================================

// Secure JWT Parser
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
    
    // --- Security & Token Decode ---
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
    
    const payload = parseJwt(currentToken);
    if (!payload || !payload.sub) {
        localStorage.removeItem('bionexus_token');
        window.location.href = '/login';
        return;
    }
    
    userEmail = payload.sub;
    if (payload.name) userName = payload.name;

    // Set Name & Initial
    const greetingNameElement = document.getElementById('user-greeting-name');
    if (greetingNameElement) greetingNameElement.innerText = userName.split(' ')[0];
    
    const profileInitial = document.getElementById('profile-initial');
    if (profileInitial && userName) profileInitial.innerText = userName.charAt(0).toUpperCase();

    // Set current date
    const dateEl = document.getElementById('current-date');
    if (dateEl) {
        const now = new Date();
        dateEl.innerText = now.toLocaleDateString('en-US', { 
            weekday: 'long', month: 'long', day: 'numeric' 
        });
    }

    // ==========================================
    // SVG CALORIE RING CONSTANTS
    // ==========================================
    const RING_CIRCUMFERENCE = 2 * Math.PI * 50; // radius=50 -> 314.16
    const calorieRing = document.getElementById('calorie-ring');

    function setCalorieRing(percent) {
        if (!calorieRing) return;
        const clampedPercent = Math.min(Math.max(percent, 0), 100);
        const offset = RING_CIRCUMFERENCE - (RING_CIRCUMFERENCE * clampedPercent / 100);
        calorieRing.style.strokeDashoffset = offset;
    }

    // ==========================================
    // DATA FETCHING
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

                // Profile Picture
                const profileBtn = document.getElementById('profile-btn');
                if (profile.profile_image && profile.profile_image.trim() !== "") {
                    let highResImg = profile.profile_image;
                    if (highResImg.includes('googleusercontent.com')) {
                        highResImg = highResImg.replace(/=s\d+-c/g, '=s400-c');
                    }
                    profileBtn.innerHTML = `<img src="${highResImg}" alt="Profile" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover; border: 2px solid var(--accent-color); display: block;">`;
                } else {
                    profileBtn.innerHTML = `<span id="profile-initial">${userName.charAt(0).toUpperCase()}</span>`;
                }
            }

            // --- DIET DATA ---
            let consumedProtein = 0, consumedCarbs = 0, consumedFats = 0, consumedCalories = 0;
            
            if (dietResult.status === "success" && dietResult.data) {
                consumedProtein = dietResult.data.daily_total_protein || 0;
                consumedCarbs = dietResult.data.daily_total_carbs || 0;
                consumedFats = dietResult.data.daily_total_fats || 0;
                consumedCalories = dietResult.data.daily_total_calories || 0;
            }

            // Health log data
            let healthLogCal = 0;
            let loggedWater = 0;
            if (logResult.status === "success" && logResult.data) {
                const log = logResult.data;
                healthLogCal = log.calories || 0;
                loggedWater = log.water_liters || 0;
                
                document.getElementById('val-steps').innerText = (log.steps || 0).toLocaleString();
                document.getElementById('val-water').innerText = loggedWater;
                document.getElementById('val-sleep').innerText = log.sleep_hours || 0;
                
                let burnedKcal = Math.round((log.steps || 0) * 0.04);
                document.getElementById('val-move').innerText = burnedKcal;
            }

            // Use diet calories if available, else health log calories
            let totalConsumed = consumedCalories > 0 ? consumedCalories : healthLogCal;
            let remainingCalories = Math.max(targetCalories - totalConsumed, 0);

            // --- Update SVG Calorie Ring ---
            document.getElementById('val-calories').innerText = remainingCalories.toLocaleString();
            let calPercent = Math.min((totalConsumed / targetCalories) * 100, 100) || 0;
            
            // Animate ring after small delay for visual effect
            setTimeout(() => setCalorieRing(calPercent), 300);

            // --- Update Macro Progress Bars ---
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
            console.error("Failed to fetch dashboard data:", error);
        }
    }
    
    loadDashboardData();

    // ==========================================
    // PROFILE DROPDOWN & LOGOUT
    // ==========================================
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

    // ==========================================
    // ENHANCED LOG HEALTH DATA MODAL
    // ==========================================
    const addDataBtn = document.getElementById('add-data-btn');
    const dataModal = document.getElementById('data-modal');
    const closeDataModalBtn = document.getElementById('close-data-modal');
    const healthForm = document.getElementById('health-form');
    const detailedForm = document.getElementById('detailed-health-form');

    if (addDataBtn) addDataBtn.addEventListener('click', () => dataModal.classList.remove('hidden'));
    if (closeDataModalBtn) closeDataModalBtn.addEventListener('click', () => dataModal.classList.add('hidden'));

    window.addEventListener('click', (e) => {
        if (dataModal && e.target === dataModal) dataModal.classList.add('hidden');
    });

    // --- Tab Switching ---
    const tabs = document.querySelectorAll('.modal-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
            const targetPanel = document.getElementById(`tab-${tab.dataset.tab}`);
            if (targetPanel) targetPanel.classList.add('active');
        });
    });

    // --- Mood Selector ---
    let selectedMood = '';
    const moodOptions = document.querySelectorAll('.mood-option');
    moodOptions.forEach(opt => {
        opt.addEventListener('click', () => {
            moodOptions.forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
            selectedMood = opt.dataset.mood;
        });
    });

    // --- Energy Level Selector ---
    let selectedEnergy = 0;
    const energyBars = document.querySelectorAll('.energy-bar');
    energyBars.forEach(bar => {
        bar.addEventListener('click', () => {
            const level = parseInt(bar.dataset.level);
            selectedEnergy = level;
            energyBars.forEach(b => {
                if (parseInt(b.dataset.level) <= level) {
                    b.classList.add('active');
                } else {
                    b.classList.remove('active');
                }
            });
        });
    });

    // --- Quick Log Submit ---
    if (healthForm) {
        healthForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = document.getElementById('submit-health-btn');
            submitBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Syncing...';
            
            const logData = {
                user_email: userEmail,
                log_date: new Date().toISOString().split('T')[0], 
                calories: parseInt(document.getElementById('input-cal').value) || 0,
                water_liters: parseFloat(document.getElementById('input-water').value) || 0,
                sleep_hours: parseFloat(document.getElementById('input-sleep').value) || 0,
                steps: parseInt(document.getElementById('input-steps').value) || 0
            };

            try {
                const response = await fetch('/api/log-health', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(logData)
                });

                const result = await response.json();

                if (response.ok) {
                    submitBtn.innerHTML = '<i class="fa-solid fa-check"></i> Synced!';
                    submitBtn.classList.add('success');
                    
                    await loadDashboardData(); 

                    setTimeout(() => {
                        dataModal.classList.add('hidden');
                        healthForm.reset();
                        submitBtn.innerHTML = '<i class="fa-solid fa-bolt"></i> Sync & Analyze';
                        submitBtn.classList.remove('success');
                    }, 1200);

                    const chatBody = document.querySelector('.ria-chat-body');
                    if (chatBody && result.ai_insight) {
                        appendMessage("Analyzing your new data... 📊", false);
                        setTimeout(() => appendMessage(result.ai_insight, false), 1000);
                    }
                }
            } catch (error) {
                console.error("Error logging health data:", error);
                submitBtn.innerHTML = '<i class="fa-solid fa-exclamation-triangle"></i> Error';
                setTimeout(() => {
                    submitBtn.innerHTML = '<i class="fa-solid fa-bolt"></i> Sync & Analyze';
                }, 2000);
            }
        });
    }

    // --- Detailed Log Submit ---
    if (detailedForm) {
        detailedForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = document.getElementById('submit-detailed-btn');
            submitBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Saving...';

            const logData = {
                user_email: userEmail,
                log_date: new Date().toISOString().split('T')[0],
                mood: selectedMood || 'okay',
                energy_level: selectedEnergy || 3,
                weight_kg: parseFloat(document.getElementById('input-weight').value) || 0,
                heart_rate: parseInt(document.getElementById('input-heart-rate').value) || 0,
                notes: document.getElementById('input-notes').value || ''
            };

            try {
                const response = await fetch('/api/log-health-detailed', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(logData)
                });

                if (response.ok) {
                    submitBtn.innerHTML = '<i class="fa-solid fa-check"></i> Saved!';
                    submitBtn.classList.add('success');

                    await loadDashboardData();

                    setTimeout(() => {
                        dataModal.classList.add('hidden');
                        detailedForm.reset();
                        moodOptions.forEach(o => o.classList.remove('selected'));
                        energyBars.forEach(b => b.classList.remove('active'));
                        selectedMood = '';
                        selectedEnergy = 0;
                        submitBtn.innerHTML = '<i class="fa-solid fa-database"></i> Save Detailed Log';
                        submitBtn.classList.remove('success');
                    }, 1200);
                }
            } catch (error) {
                console.error("Error saving detailed log:", error);
                submitBtn.innerHTML = '<i class="fa-solid fa-exclamation-triangle"></i> Error';
                setTimeout(() => {
                    submitBtn.innerHTML = '<i class="fa-solid fa-database"></i> Save Detailed Log';
                }, 2000);
            }
        });
    }

    // ==========================================
    // RIA AI CHAT
    // ==========================================
    const riaBotBtn = document.getElementById('ria-bot-btn');
    const riaChatModal = document.getElementById('ria-chat-modal');
    const closeRiaModalBtn = document.getElementById('close-ria-modal');

    if (riaBotBtn) riaBotBtn.addEventListener('click', () => riaChatModal.classList.remove('hidden'));
    if (closeRiaModalBtn) closeRiaModalBtn.addEventListener('click', () => riaChatModal.classList.add('hidden'));

    window.addEventListener('click', (e) => {
        if (riaChatModal && e.target === riaChatModal) riaChatModal.classList.add('hidden');
    });

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
            bubbleDiv.style.background = `linear-gradient(135deg, var(--accent-color), var(--accent-purple))`;
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