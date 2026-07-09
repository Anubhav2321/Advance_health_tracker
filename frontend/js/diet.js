// ==========================================
// BioNexus: AI Diet System Logic
// ==========================================

document.addEventListener('DOMContentLoaded', async () => {
    
    // 1. Security Check
    const currentToken = localStorage.getItem('bionexus_token');
    if (!currentToken) { window.location.href = '/login'; return; }

    let userEmail = ""; 
    try {
        const payload = JSON.parse(atob(currentToken.split('.')[1]));
        if (payload.sub) userEmail = payload.sub;
    } catch (e) { window.location.href = '/login'; return; }

    const spinner = document.getElementById('loading-spinner');
    const content = document.getElementById('diet-content');
    const mealsList = document.getElementById('logged-meals-list');
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('date-display').innerText = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

    let targetCalories = 2000;

    // --- Bottom Nav FAB Button ---
    const addDataBtn = document.getElementById('add-data-btn');
    if (addDataBtn) {
        addDataBtn.addEventListener('click', () => { window.location.href = '/dashboard'; });
    }

    // 2. Load Initial Data & Render Meal List
    async function loadDietData() {
        try {
            const [profileRes, dietRes] = await Promise.all([
                fetch(`/api/profile/${userEmail}`),
                fetch(`/api/diet/today/${userEmail}`)
            ]);
            const profileResult = await profileRes.json();
            const dietResult = await dietRes.json();

            if (profileResult.status === "success" && profileResult.data) {
                targetCalories = profileResult.data.target_calories || 2000;
                document.getElementById('ui-target-cal').innerText = targetCalories;
            }
            
            if (dietResult.status === "success" && dietResult.data) {
                const data = dietResult.data;
                document.getElementById('ui-consumed-cal').innerText = data.daily_total_calories || 0;
                
                // ROBUST Rendering for Logged Meals
                if (data.meals && Array.isArray(data.meals) && data.meals.length > 0) {
                    mealsList.innerHTML = '';
                    data.meals.forEach(log => {
                        const itemsArray = log.items || [];
                        let itemsText = itemsArray.map(i => i.food_name || 'Unknown Item').join(', ');
                        
                        mealsList.innerHTML += `
                            <div class="meal-card">
                                <div class="meal-header">
                                    <h4>${log.meal_type || 'Meal'}</h4>
                                    <span>${log.total_calories || 0} kcal</span>
                                </div>
                                <div class="meal-details">
                                    <p>${itemsText}</p>
                                    <p style="margin-top: 5px; color: var(--accent-purple);">
                                        P: ${log.total_protein || 0}g | C: ${log.total_carbs || 0}g | F: ${log.total_fats || 0}g
                                    </p>
                                </div>
                            </div>
                        `;
                    });
                } else {
                    mealsList.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 20px;">No meals logged yet.</div>';
                }
            }
            spinner.style.display = 'none';
            content.style.display = 'flex';
        } catch (error) {
            console.error(error);
            spinner.innerHTML = '<div style="color: #ff5e5e;">Error loading Data.</div>';
        }
    }
    
    loadDietData();

    // 3. AI Meal Planner Logic
    const planBtn = document.getElementById('generate-plan-btn');
    const planBox = document.getElementById('ai-plan-box');
    
    if (planBtn) {
        planBtn.addEventListener('click', async () => {
            if(planBox.style.display === 'block') { planBox.style.display = 'none'; return; }
            
            planBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Generating Matrix Plan...';
            try {
                const res = await fetch(`/api/diet/ai-planner/${userEmail}`);
                const data = await res.json();
                
                if (data.status === "success") {
                    planBox.innerHTML = data.plan;
                    planBox.style.display = 'block';
                } else {
                    planBox.innerHTML = "API Key error. AI Offline.";
                    planBox.style.display = 'block';
                }
            } catch (e) {
                planBox.innerHTML = "Connection Failed.";
                planBox.style.display = 'block';
            }
            planBtn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> 1-Click AI Meal & Grocery Plan';
        });
    }

    // 4. Smart Search & AI Warning Logic
    const searchInput = document.getElementById('food-search-input');
    const searchBtn = document.getElementById('search-btn');
    const searchResults = document.getElementById('search-results');

    async function performSearch() {
        const query = searchInput.value.trim();
        if (!query) { searchResults.style.display = 'none'; return; }

        try {
            searchBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';
            
            const response = await fetch(`/api/diet/search?query=${query}`);
            const result = await response.json();
            
            if (result.status === "success" && result.data) {
                const food = result.data;
                window.currentFoodData = food; 
                
                // Inject Dynamic HTML without inline JS
                searchResults.innerHTML = `
                    <div class="result-item">
                        <div class="res-info">
                            <h4 id="res-food-name">${food.name}</h4>
                            <p id="res-food-macros">${food.calories} kcal | P: ${food.protein}g</p>
                        </div>
                        
                        <div class="ai-warning-box" id="ai-warning-box" style="display:none;"></div>
                        
                        <div class="add-actions">
                            <select class="add-meal-select" id="meal-type-select">
                                <option value="Breakfast">Breakfast</option>
                                <option value="Lunch">Lunch</option>
                                <option value="Snacks">Snacks</option>
                                <option value="Dinner">Dinner</option>
                            </select>
                            <button class="add-btn" id="log-meal-trigger-btn">Log Meal</button>
                        </div>
                    </div>
                `;
                searchResults.style.display = 'flex';

                // Call AI Warning API silently
                const warningBox = document.getElementById('ai-warning-box');
                const warningRes = await fetch('/api/diet/ai-warning', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user_email: userEmail, food_name: food.name })
                });
                const warningData = await warningRes.json();
                
                if (warningData.status === "success" && warningData.warning) {
                    warningBox.innerText = warningData.warning;
                    warningBox.style.display = 'block';
                    if (warningData.warning.includes('⚠️')) {
                        warningBox.style.background = 'rgba(255,0,0,0.1)';
                        warningBox.style.borderLeftColor = '#ff5e5e';
                        warningBox.style.color = '#ff5e5e';
                    } else {
                        warningBox.style.background = 'rgba(0,255,135,0.1)';
                        warningBox.style.borderLeftColor = '#00ff87';
                        warningBox.style.color = '#00ff87';
                    }
                }
            }
            searchBtn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i>';
        } catch (error) {
            console.error(error);
            searchBtn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i>';
        }
    }

    if (searchBtn) searchBtn.addEventListener('click', performSearch);
    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => { 
            if (e.key === 'Enter') performSearch(); 
        });
    }

    // --- EVENT DELEGATION for Log Meal Button ---
    searchResults.addEventListener('click', async (e) => {
        if (e.target.id === 'log-meal-trigger-btn') {
            const food = window.currentFoodData;
            const mealTypeSelect = document.getElementById('meal-type-select');
            
            if (!food || !mealTypeSelect) return;
            const mealType = mealTypeSelect.value;

            const postData = {
                user_email: userEmail, 
                date: today, 
                meal_type: mealType,
                items: [{
                    food_name: food.name, 
                    calories: food.calories,
                    protein: food.protein,
                    carbs: food.carbs,
                    fats: food.fats
                }], 
                total_calories: food.calories, 
                total_protein: food.protein,
                total_carbs: food.carbs, 
                total_fats: food.fats
            };

            try {
                document.getElementById('res-food-name').innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Syncing...';
                e.target.disabled = true;

                const response = await fetch('/api/diet/log', {
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json' }, 
                    body: JSON.stringify(postData)
                });
                
                if (response.ok) {
                    searchResults.style.display = 'none';
                    searchInput.value = '';
                    await loadDietData(); // Instantly refresh the meal list
                } else {
                    document.getElementById('res-food-name').innerHTML = 'Sync Failed!';
                    e.target.disabled = false;
                }
            } catch (error) { 
                console.error("Network Error:", error); 
                e.target.disabled = false;
            }
        }
    });

    // 5. RIA Diet Chat Logic
    const riaInput = document.getElementById('ria-diet-input');
    const riaSendBtn = document.getElementById('ria-diet-send');
    const riaChatArea = document.getElementById('ria-diet-chat');

    async function sendRiaMsg() {
        const msg = riaInput.value.trim();
        if (!msg) return;

        riaChatArea.innerHTML += `<div class="user-msg">${msg}</div>`;
        riaInput.value = '';
        riaChatArea.innerHTML += `<div class="ria-msg" id="ria-typing">Typing...</div>`;
        riaChatArea.scrollTop = riaChatArea.scrollHeight;

        try {
            const response = await fetch('/api/diet/ria-consult', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_email: userEmail, user_message: msg })
            });
            const data = await response.json();
            const typingIndicator = document.getElementById('ria-typing');
            if (typingIndicator) typingIndicator.remove();
            
            if (data.status === "success") {
                riaChatArea.innerHTML += `<div class="ria-msg">${data.reply}</div>`;
            } else {
                riaChatArea.innerHTML += `<div class="ria-msg">Error.</div>`;
            }
            riaChatArea.scrollTop = riaChatArea.scrollHeight;
        } catch (e) {
            const typingIndicator = document.getElementById('ria-typing');
            if (typingIndicator) typingIndicator.remove();
            riaChatArea.innerHTML += `<div class="ria-msg">Connection lost.</div>`;
        }
    }

    if (riaSendBtn) riaSendBtn.addEventListener('click', sendRiaMsg);
    if (riaInput) {
        riaInput.addEventListener('keypress', (e) => { 
            if (e.key === 'Enter') sendRiaMsg(); 
        });
    }
});