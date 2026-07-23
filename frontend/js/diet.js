// ==========================================
// BioNexus: AI Diet System + Nutrition Coach
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

    // Theme is applied by theme-loader.js (loaded in HTML <head>)

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

    // ==========================================
    // 🍽️ AI NUTRITION COACH — FOOD PHOTO ANALYSIS
    // ==========================================
    
    const cameraScanBtn = document.getElementById('camera-scan-btn');
    const uploadScanBtn = document.getElementById('upload-scan-btn');
    const foodUploadInput = document.getElementById('food-upload-input');
    const imagePreviewArea = document.getElementById('image-preview-area');
    const previewImage = document.getElementById('preview-image');
    const analyzeFoodBtn = document.getElementById('analyze-food-btn');
    const cancelPreviewBtn = document.getElementById('cancel-preview-btn');
    const scannerLoading = document.getElementById('scanner-loading');
    const analysisResults = document.getElementById('analysis-results');
    
    // Camera elements
    const cameraModal = document.getElementById('camera-modal');
    const cameraVideo = document.getElementById('camera-video');
    const cameraCanvas = document.getElementById('camera-canvas');
    const cameraCaptureBtn = document.getElementById('camera-capture-btn');
    const cameraCloseBtn = document.getElementById('camera-close-btn');

    let currentFoodBase64 = null;
    let currentAnalyzedFood = null;
    let cameraStream = null;

    // --- Upload Photo ---
    uploadScanBtn.addEventListener('click', () => {
        foodUploadInput.click();
    });

    foodUploadInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            currentFoodBase64 = event.target.result;
            previewImage.src = currentFoodBase64;
            imagePreviewArea.classList.add('active');
            analysisResults.classList.remove('active');
        };
        reader.readAsDataURL(file);
        foodUploadInput.value = ''; // Reset so same file can be re-selected
    });

    // --- Camera Capture ---
    cameraScanBtn.addEventListener('click', async () => {
        try {
            cameraStream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } 
            });
            cameraVideo.srcObject = cameraStream;
            cameraModal.classList.add('active');
        } catch (err) {
            console.error("Camera access error:", err);
            alert("Camera access denied. Please allow camera access in your browser settings or use the Upload option.");
        }
    });

    cameraCaptureBtn.addEventListener('click', () => {
        // Capture frame from video
        cameraCanvas.width = cameraVideo.videoWidth;
        cameraCanvas.height = cameraVideo.videoHeight;
        const ctx = cameraCanvas.getContext('2d');
        ctx.drawImage(cameraVideo, 0, 0);
        
        currentFoodBase64 = cameraCanvas.toDataURL('image/jpeg', 0.85);
        previewImage.src = currentFoodBase64;
        imagePreviewArea.classList.add('active');
        analysisResults.classList.remove('active');

        // Close camera
        closeCameraModal();
    });

    cameraCloseBtn.addEventListener('click', closeCameraModal);

    function closeCameraModal() {
        cameraModal.classList.remove('active');
        if (cameraStream) {
            cameraStream.getTracks().forEach(track => track.stop());
            cameraStream = null;
        }
    }

    // --- Cancel Preview ---
    cancelPreviewBtn.addEventListener('click', () => {
        imagePreviewArea.classList.remove('active');
        analysisResults.classList.remove('active');
        currentFoodBase64 = null;
        currentAnalyzedFood = null;
    });

    // --- Analyze Food ---
    analyzeFoodBtn.addEventListener('click', async () => {
        if (!currentFoodBase64) return;

        imagePreviewArea.classList.remove('active');
        scannerLoading.classList.add('active');
        analysisResults.classList.remove('active');

        try {
            const response = await fetch('/api/diet/analyze-food', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_email: userEmail,
                    image_base64: currentFoodBase64
                })
            });

            const result = await response.json();
            scannerLoading.classList.remove('active');

            if (result.status === "success" && result.data) {
                currentAnalyzedFood = result.data;
                renderAnalysisResults(result.data);
            } else {
                analysisResults.innerHTML = `
                    <div style="text-align:center;padding:20px;color:#ff6b6b;font-size:0.85rem;">
                        <i class="fa-solid fa-triangle-exclamation" style="font-size:1.5rem;margin-bottom:8px;display:block;"></i>
                        ${result.message || 'Analysis failed. Please try with a clearer image.'}
                    </div>`;
                analysisResults.classList.add('active');
            }
        } catch (error) {
            console.error("Food analysis error:", error);
            scannerLoading.classList.remove('active');
            analysisResults.innerHTML = `
                <div style="text-align:center;padding:20px;color:#ff6b6b;font-size:0.85rem;">
                    <i class="fa-solid fa-wifi" style="font-size:1.5rem;margin-bottom:8px;display:block;"></i>
                    Connection failed. Please check your network.
                </div>`;
            analysisResults.classList.add('active');
        }
    });

    // --- Render Analysis Results ---
    function renderAnalysisResults(data) {
        const ratingClass = data.health_rating >= 7 ? 'good' : data.health_rating >= 4 ? 'mid' : 'bad';
        
        // Calculate macro percentages for bars (out of a reasonable daily max)
        const calPct = Math.min((data.calories / targetCalories) * 100, 100);
        const proPct = Math.min((data.protein / 150) * 100, 100);
        const carbPct = Math.min((data.carbs / 300) * 100, 100);
        const fatPct = Math.min((data.fat / 80) * 100, 100);

        let pointsHtml = '';
        if (data.points && Array.isArray(data.points)) {
            pointsHtml = data.points.map((point, i) => `
                <div class="analysis-point">
                    <div class="point-num">${i + 1}</div>
                    <div>${point}</div>
                </div>
            `).join('');
        }

        analysisResults.innerHTML = `
            <div class="analysis-food-header">
                <div>
                    <div class="analysis-food-name">${data.food_name || 'Unknown Food'}</div>
                    <div class="analysis-food-desc">${data.description || ''}</div>
                    ${data.serving_size ? `<div style="font-size:0.7rem;color:var(--accent-orange);margin-top:4px;"><i class="fa-solid fa-plate-wheat"></i> ${data.serving_size}</div>` : ''}
                </div>
                <div class="health-rating ${ratingClass}">
                    <div class="rating-num">${data.health_rating || '?'}</div>
                    <div class="rating-label">/ 10</div>
                </div>
            </div>

            <div class="macro-grid">
                <div class="macro-item macro-cal">
                    <div class="macro-item-header">
                        <span class="macro-item-label">Calories</span>
                        <span class="macro-item-value">${data.calories || 0} kcal</span>
                    </div>
                    <div class="macro-bar"><div class="macro-bar-fill" id="bar-cal"></div></div>
                </div>
                <div class="macro-item macro-pro">
                    <div class="macro-item-header">
                        <span class="macro-item-label">Protein</span>
                        <span class="macro-item-value">${data.protein || 0}g</span>
                    </div>
                    <div class="macro-bar"><div class="macro-bar-fill" id="bar-pro"></div></div>
                </div>
                <div class="macro-item macro-carb">
                    <div class="macro-item-header">
                        <span class="macro-item-label">Carbs</span>
                        <span class="macro-item-value">${data.carbs || 0}g</span>
                    </div>
                    <div class="macro-bar"><div class="macro-bar-fill" id="bar-carb"></div></div>
                </div>
                <div class="macro-item macro-fat">
                    <div class="macro-item-header">
                        <span class="macro-item-label">Fat</span>
                        <span class="macro-item-value">${data.fat || 0}g</span>
                    </div>
                    <div class="macro-bar"><div class="macro-bar-fill" id="bar-fat"></div></div>
                </div>
            </div>

            ${data.fiber !== undefined || data.sugar !== undefined ? `
                <div style="display:flex;gap:8px;margin-bottom:12px;">
                    ${data.fiber !== undefined ? `<div style="flex:1;background:rgba(0,0,0,0.2);padding:8px 10px;border-radius:8px;font-size:0.78rem;">
                        <span style="color:var(--text-secondary);">Fiber</span>
                        <span style="float:right;font-weight:600;color:var(--accent-green);">${data.fiber}g</span>
                    </div>` : ''}
                    ${data.sugar !== undefined ? `<div style="flex:1;background:rgba(0,0,0,0.2);padding:8px 10px;border-radius:8px;font-size:0.78rem;">
                        <span style="color:var(--text-secondary);">Sugar</span>
                        <span style="float:right;font-weight:600;color:var(--accent-pink);">${data.sugar}g</span>
                    </div>` : ''}
                </div>
            ` : ''}

            ${pointsHtml ? `
                <div class="analysis-points">
                    <h4><i class="fa-solid fa-clipboard-list"></i> Food Analysis</h4>
                    ${pointsHtml}
                </div>
            ` : ''}

            <button class="log-analyzed-btn" id="log-analyzed-food-btn">
                <i class="fa-solid fa-plus-circle"></i> Log This Food
            </button>
        `;

        analysisResults.classList.add('active');

        // Animate macro bars after render
        requestAnimationFrame(() => {
            setTimeout(() => {
                const barCal = document.getElementById('bar-cal');
                const barPro = document.getElementById('bar-pro');
                const barCarb = document.getElementById('bar-carb');
                const barFat = document.getElementById('bar-fat');
                if (barCal) barCal.style.width = calPct + '%';
                if (barPro) barPro.style.width = proPct + '%';
                if (barCarb) barCarb.style.width = carbPct + '%';
                if (barFat) barFat.style.width = fatPct + '%';
            }, 100);
        });

        // Log analyzed food button
        const logAnalyzedBtn = document.getElementById('log-analyzed-food-btn');
        if (logAnalyzedBtn) {
            logAnalyzedBtn.addEventListener('click', async () => {
                if (!currentAnalyzedFood) return;

                const postData = {
                    user_email: userEmail,
                    date: today,
                    meal_type: "Snacks", // Default, can be improved with a selector
                    items: [{
                        food_name: currentAnalyzedFood.food_name,
                        calories: Math.round(currentAnalyzedFood.calories || 0),
                        protein: parseFloat(currentAnalyzedFood.protein || 0),
                        carbs: parseFloat(currentAnalyzedFood.carbs || 0),
                        fats: parseFloat(currentAnalyzedFood.fat || 0)
                    }],
                    total_calories: Math.round(currentAnalyzedFood.calories || 0),
                    total_protein: parseFloat(currentAnalyzedFood.protein || 0),
                    total_carbs: parseFloat(currentAnalyzedFood.carbs || 0),
                    total_fats: parseFloat(currentAnalyzedFood.fat || 0)
                };

                try {
                    logAnalyzedBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Logging...';
                    logAnalyzedBtn.disabled = true;

                    const response = await fetch('/api/diet/log', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(postData)
                    });

                    if (response.ok) {
                        logAnalyzedBtn.innerHTML = '<i class="fa-solid fa-check-circle"></i> Logged Successfully!';
                        logAnalyzedBtn.style.borderColor = 'var(--accent-green)';
                        logAnalyzedBtn.style.color = 'var(--accent-green)';
                        await loadDietData();
                        
                        // Reset after 2 seconds
                        setTimeout(() => {
                            analysisResults.classList.remove('active');
                            currentAnalyzedFood = null;
                            currentFoodBase64 = null;
                        }, 2000);
                    } else {
                        logAnalyzedBtn.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Failed to Log';
                        logAnalyzedBtn.disabled = false;
                    }
                } catch (error) {
                    console.error("Log food error:", error);
                    logAnalyzedBtn.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Network Error';
                    logAnalyzedBtn.disabled = false;
                }
            });
        }
    }
});