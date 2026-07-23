// ==========================================
// BioNexus: Settings Configuration Logic
// Complete Theme Engine + Settings Management
// ==========================================

document.addEventListener('DOMContentLoaded', async () => {
    
    // Security Check
    const currentToken = localStorage.getItem('bionexus_token');
    if (!currentToken) { window.location.href = '/login'; return; }

    let userEmail = ""; 
    try {
        let base64Url = currentToken.split('.')[1];
        let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        while (base64.length % 4) { base64 += '='; }
        const payload = JSON.parse(decodeURIComponent(window.atob(base64).split('').map(c => 
            '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
        ).join('')));
        if (payload.sub) userEmail = payload.sub;
    } catch (e) { window.location.href = '/login'; return; }

    const spinner = document.getElementById('loading-spinner');
    const content = document.getElementById('settings-content');

    const fields = {
        goal: document.getElementById('set-goal'),
        weight: document.getElementById('set-weight'),
        height: document.getElementById('set-height'),
        age: document.getElementById('set-age'),
        gender: document.getElementById('set-gender'),
        activity: document.getElementById('set-activity'),
        riaTone: document.getElementById('set-ria-tone'),
        riaLang: document.getElementById('set-ria-lang')
    };

    // ==========================================
    // ACCENT COLOR MAP
    // ==========================================
    const accentMap = {
        cyan:   { hex: '#00f3ff', rgb: '0, 243, 255',   name: 'Neon Cyan' },
        purple: { hex: '#a855f7', rgb: '168, 85, 247',  name: 'Synthwave Purple' },
        green:  { hex: '#22c55e', rgb: '34, 197, 94',   name: 'Matrix Green' },
        orange: { hex: '#f97316', rgb: '249, 115, 22',  name: 'Sunset Orange' },
        pink:   { hex: '#ec4899', rgb: '236, 72, 153',  name: 'Hot Pink' },
        blue:   { hex: '#3b82f6', rgb: '59, 130, 246',  name: 'Electric Blue' }
    };

    const modeNames = {
        dark: 'Cyber Dark',
        light: 'Clean Light',
        system: 'System Default'
    };

    let currentMode = localStorage.getItem('bionexus_theme_mode') || 'dark';
    let currentAccent = localStorage.getItem('bionexus_theme_accent') || 'cyan';

    // ==========================================
    // GLOBAL THEME ENGINE
    // ==========================================
    function applyTheme(colorKey, modeKey) {
        const root = document.documentElement;
        
        // Resolve system mode
        let effectiveMode = modeKey;
        if (modeKey === 'system') {
            effectiveMode = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
        }

        // Apply theme mode via data attribute
        root.setAttribute('data-theme', effectiveMode);

        // Apply accent color
        const accent = accentMap[colorKey] || accentMap.cyan;
        root.style.setProperty('--accent-color', accent.hex);
        root.style.setProperty('--accent-rgb', accent.rgb);

        // Persist
        localStorage.setItem('bionexus_theme_mode', modeKey);
        localStorage.setItem('bionexus_theme_accent', colorKey);

        currentMode = modeKey;
        currentAccent = colorKey;

        // Update UI elements
        updateThemeUI();
    }

    function updateThemeUI() {
        // Update mode selector
        document.querySelectorAll('.theme-mode-option').forEach(opt => {
            opt.classList.toggle('active', opt.dataset.mode === currentMode);
        });

        // Update color swatches
        document.querySelectorAll('.color-swatch').forEach(swatch => {
            swatch.classList.toggle('active', swatch.dataset.color === currentAccent);
        });

        // Update live preview text
        const previewTheme = document.getElementById('preview-theme-text');
        const previewAccent = document.getElementById('preview-accent-text');
        if (previewTheme) previewTheme.textContent = modeNames[currentMode] || 'Cyber Dark';
        if (previewAccent) previewAccent.textContent = (accentMap[currentAccent] || accentMap.cyan).name;
    }

    // ==========================================
    // EVENT LISTENERS - Theme Controls
    // ==========================================
    
    // Theme mode selector
    document.querySelectorAll('.theme-mode-option').forEach(btn => {
        btn.addEventListener('click', () => {
            applyTheme(currentAccent, btn.dataset.mode);
        });
    });

    // Color swatches
    document.querySelectorAll('.color-swatch').forEach(swatch => {
        swatch.addEventListener('click', () => {
            applyTheme(swatch.dataset.color, currentMode);
        });
    });

    // System theme change listener
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
        if (currentMode === 'system') {
            applyTheme(currentAccent, 'system');
        }
    });

    // ==========================================
    // LOAD SETTINGS FROM SERVER
    // ==========================================
    async function loadSettings() {
        try {
            const res = await fetch(`/api/settings/${userEmail}`);
            const result = await res.json();

            if (res.ok && result.status === "success") {
                const d = result.data;
                
                fields.goal.value = d.profile.goal || 'maintenance';
                fields.weight.value = d.profile.current_weight_kg || '';
                fields.height.value = d.profile.height_cm || '';
                fields.age.value = d.profile.age || '';
                fields.gender.value = d.profile.gender || 'male';
                fields.activity.value = d.profile.activity_level || 'sedentary';

                // Use localStorage values (most recent user choice), fallback to DB
                const savedMode = localStorage.getItem('bionexus_theme_mode');
                const savedAccent = localStorage.getItem('bionexus_theme_accent');
                
                currentMode = savedMode || d.theme.mode || 'dark';
                currentAccent = savedAccent || d.theme.accent_color || 'cyan';

                fields.riaTone.value = d.ria.tone || 'friendly';
                fields.riaLang.value = d.ria.language || 'english';

                // Apply theme on load
                applyTheme(currentAccent, currentMode);

                spinner.style.display = 'none';
                content.style.display = 'flex';
            }
        } catch (error) {
            console.error(error);
            spinner.innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="color: var(--danger-red);"></i> Error loading settings.';
        }
    }
    loadSettings();

    // ==========================================
    // SAVE SETTINGS
    // ==========================================
    document.getElementById('save-settings-btn').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Saving...';

        let w = parseFloat(fields.weight.value) || 70;
        let h = parseFloat(fields.height.value) || 175;
        let a = parseInt(fields.age.value) || 25;

        const postData = {
            user_email: userEmail,
            profile: {
                goal: fields.goal.value,
                current_weight_kg: w,
                height_cm: h,
                age: a,
                gender: fields.gender.value,
                activity_level: fields.activity.value
            },
            theme: { mode: currentMode, accent_color: currentAccent },
            ria: { tone: fields.riaTone.value, language: fields.riaLang.value },
            notifications: { water_reminder: true, workout_alert: true, meal_reminder: true }
        };

        try {
            const res = await fetch('/api/settings/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(postData)
            });
            
            if (res.ok) {
                localStorage.setItem('bionexus_theme_mode', currentMode);
                localStorage.setItem('bionexus_theme_accent', currentAccent);
                
                btn.style.background = 'var(--accent-green)';
                btn.innerHTML = '<i class="fa-solid fa-check"></i> Settings Saved!';
                setTimeout(() => {
                    btn.style.background = '';
                    btn.innerHTML = '<i class="fa-solid fa-microchip"></i> Save Settings';
                }, 2000);
            } else {
                btn.innerHTML = '<i class="fa-solid fa-exclamation-triangle"></i> Save Failed!';
                setTimeout(() => {
                    btn.innerHTML = '<i class="fa-solid fa-microchip"></i> Save Settings';
                }, 2000);
            }
        } catch (error) {
            console.error(error);
            btn.innerHTML = '<i class="fa-solid fa-exclamation-triangle"></i> Network Error';
            setTimeout(() => {
                btn.innerHTML = '<i class="fa-solid fa-microchip"></i> Save Settings';
            }, 2000);
        }
    });

    // ==========================================
    // CHANGE PASSWORD
    // ==========================================
    document.getElementById('change-pass-btn').addEventListener('click', async (e) => {
        const oldPass = document.getElementById('old-pass').value;
        const newPass = document.getElementById('new-pass').value;
        const msgBox = document.getElementById('pass-msg');

        if(!oldPass || !newPass) { 
            msgBox.innerText = "Please fill both fields."; 
            msgBox.style.color = 'var(--danger-red)'; 
            return; 
        }
        
        e.target.innerText = 'Updating...';
        try {
            const res = await fetch('/api/settings/change-password', {
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_email: userEmail, old_password: oldPass, new_password: newPass })
            });
            const data = await res.json();
            
            if (res.ok) {
                msgBox.innerText = "Password Updated!";
                msgBox.style.color = 'var(--accent-green)';
                document.getElementById('old-pass').value = '';
                document.getElementById('new-pass').value = '';
            } else {
                msgBox.innerText = data.detail || "Update failed.";
                msgBox.style.color = 'var(--danger-red)';
            }
        } catch (error) { 
            msgBox.innerText = "Network error."; 
            msgBox.style.color = 'var(--danger-red)';
        }
        e.target.innerHTML = '<i class="fa-solid fa-key"></i> Update Password';
    });

    // ==========================================
    // EXPORT TO PDF
    // ==========================================
    document.getElementById('export-data-btn').addEventListener('click', async (e) => {
        e.target.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Generating...';
        try {
            const res = await fetch(`/api/settings/export/${userEmail}`);
            const data = await res.json();
            
            if(res.ok && data.status === "success") {
                const d = data.export_data;
                const profile = d.profile_and_macros || {};
                const healthLogs = d.daily_health_logs || [];
                const workouts = d.workout_routines_history || [];
                const dietLogs = d.diet_food_history || [];

                let healthTable = '<tr><th>Date</th><th>Calories</th><th>Water (L)</th><th>Sleep (hrs)</th><th>Steps</th></tr>';
                healthLogs.slice(-14).forEach(log => {
                    healthTable += `<tr><td>${log.log_date || 'N/A'}</td><td>${log.calories || 0}</td><td>${log.water_liters || 0}</td><td>${log.sleep_hours || 0}</td><td>${log.steps || 0}</td></tr>`;
                });

                let workoutRows = '<tr><th>Date</th><th>Exercises</th><th>Volume (kg)</th></tr>';
                workouts.slice(-14).forEach(w => {
                    const exercises = (w.exercises || []).map(ex => ex.name || 'Exercise').join(', ');
                    workoutRows += `<tr><td>${w.date || 'N/A'}</td><td>${exercises || 'N/A'}</td><td>${w.total_volume_kg || 0}</td></tr>`;
                });

                let dietRows = '<tr><th>Date</th><th>Calories</th><th>Protein</th><th>Carbs</th><th>Fats</th></tr>';
                dietLogs.slice(-14).forEach(dl => {
                    dietRows += `<tr><td>${dl.date || 'N/A'}</td><td>${dl.daily_total_calories || 0}</td><td>${dl.daily_total_protein || 0}g</td><td>${dl.daily_total_carbs || 0}g</td><td>${dl.daily_total_fats || 0}g</td></tr>`;
                });

                const accentHex = (accentMap[currentAccent] || accentMap.cyan).hex;

                const printContent = `
                    <html>
                    <head>
                        <title>BioNexus Health Report - ${profile.name || userEmail}</title>
                        <style>
                            * { margin: 0; padding: 0; box-sizing: border-box; }
                            body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px 50px; color: #333; line-height: 1.6; background: #fff; }
                            .header { text-align: center; border-bottom: 3px solid ${accentHex}; padding-bottom: 20px; margin-bottom: 30px; }
                            .header h1 { color: #1a1a2e; font-size: 28px; margin-bottom: 5px; }
                            .header p { color: #666; font-size: 14px; }
                            .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 30px; }
                            .meta-item { background: #f8f9fa; padding: 12px 16px; border-radius: 8px; border-left: 4px solid ${accentHex}; }
                            .meta-item strong { color: #1a1a2e; display: block; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; }
                            .meta-item span { font-size: 16px; font-weight: 600; }
                            h2 { color: #1a1a2e; font-size: 18px; margin: 25px 0 10px 0; padding-bottom: 5px; border-bottom: 1px solid #dee2e6; }
                            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px; }
                            th { background: #1a1a2e; color: #fff; padding: 10px 12px; text-align: left; font-weight: 600; }
                            td { padding: 8px 12px; border-bottom: 1px solid #e9ecef; }
                            tr:nth-child(even) td { background: #f8f9fa; }
                            .footer { text-align: center; margin-top: 40px; padding-top: 15px; border-top: 1px solid #dee2e6; color: #999; font-size: 11px; }
                            @media print { body { padding: 20px; } }
                        </style>
                    </head>
                    <body>
                        <div class="header">
                            <h1>BioNexus Health Report</h1>
                            <p>${profile.name || 'User'} — ${userEmail} — Generated ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                        </div>
                        <div class="meta-grid">
                            <div class="meta-item"><strong>Goal</strong><span>${(profile.goal || 'maintenance').replace('_', ' ')}</span></div>
                            <div class="meta-item"><strong>Weight</strong><span>${profile.current_weight_kg || '--'} kg</span></div>
                            <div class="meta-item"><strong>Height</strong><span>${profile.height_cm || '--'} cm</span></div>
                            <div class="meta-item"><strong>Age / Gender</strong><span>${profile.age || '--'} / ${profile.gender || '--'}</span></div>
                            <div class="meta-item"><strong>Target Calories</strong><span>${profile.target_calories || '--'} kcal</span></div>
                            <div class="meta-item"><strong>Activity Level</strong><span>${(profile.activity_level || 'sedentary').replace('_', ' ')}</span></div>
                            <div class="meta-item"><strong>Protein Target</strong><span>${profile.target_protein_g || 0}g</span></div>
                            <div class="meta-item"><strong>Water Target</strong><span>${profile.target_water_l || 0}L</span></div>
                        </div>
                        <h2>📊 Daily Health Logs (Last 14 Days)</h2>
                        <table>${healthTable}</table>
                        <h2>💪 Workout History (Last 14 Days)</h2>
                        <table>${workoutRows}</table>
                        <h2>🍽️ Diet & Nutrition (Last 14 Days)</h2>
                        <table>${dietRows}</table>
                        <div class="footer">
                            BioNexus Advanced Health Tracker — AI-Powered Health Analytics<br>
                            This report was auto-generated. For medical decisions, consult a healthcare professional.
                        </div>
                    </body>
                    </html>
                `;
                
                const pdfWin = window.open('', '_blank');
                pdfWin.document.write(printContent);
                pdfWin.document.close();
                pdfWin.focus();
                setTimeout(() => { pdfWin.print(); }, 600);
            }
        } catch (error) { console.error("Export Failed", error); }
        e.target.innerHTML = '<i class="fa-solid fa-file-pdf"></i> Export Data as PDF';
    });

    // ==========================================
    // DELETE ACCOUNT
    // ==========================================
    document.getElementById('delete-account-btn').addEventListener('click', async () => {
        const confirmDelete = confirm("⚠️ DANGER: This will permanently erase ALL your data. Are you sure?");
        if (confirmDelete) {
            try {
                const res = await fetch('/api/settings/delete-account', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user_email: userEmail })
                });
                if (res.ok) {
                    localStorage.removeItem('bionexus_token');
                    localStorage.removeItem('bionexus_theme_mode');
                    localStorage.removeItem('bionexus_theme_accent');
                    window.location.href = '/login';
                }
            } catch (error) { alert("Failed to delete account."); }
        }
    });
});