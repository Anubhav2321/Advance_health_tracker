// ==========================================
// BioNexus: Settings Configuration Logic
// ==========================================

document.addEventListener('DOMContentLoaded', async () => {
    
    // Security Check
    const currentToken = localStorage.getItem('bionexus_token');
    if (!currentToken) { window.location.href = '/login'; return; }

    let userEmail = ""; 
    try {
        const payload = JSON.parse(atob(currentToken.split('.')[1]));
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
        themeMode: document.getElementById('set-theme-mode'),
        themeColor: document.getElementById('set-theme-color'),
        riaTone: document.getElementById('set-ria-tone'),
        riaLang: document.getElementById('set-ria-lang')
    };

    // ==========================================
    // DYNAMIC THEME ENGINE
    // ==========================================
    const themeColors = {
        cyan: '#00f3ff',
        purple: '#9d4edd',
        green: '#00ff87',
        orange: '#ff9d00'
    };

    function applyLiveTheme(colorKey, modeKey) {
        const root = document.documentElement;
        
        // Resolve system mode
        let effectiveMode = modeKey;
        if (modeKey === 'system') {
            effectiveMode = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
        }

        // Apply accent color
        if (themeColors[colorKey]) {
            root.style.setProperty('--accent-master', themeColors[colorKey]);
            root.style.setProperty('--accent-cyan', colorKey === 'cyan' ? '#00f3ff' : themeColors[colorKey]);
        }
        
        // Apply mode
        if (effectiveMode === 'light') {
            root.style.setProperty('--bg-dark', '#f0f2f5');
            root.style.setProperty('--surface-dark', '#ffffff');
            root.style.setProperty('--text-primary', '#181b21');
            root.style.setProperty('--text-secondary', '#5a5f6b');
        } else {
            root.style.setProperty('--bg-dark', '#0f1115');
            root.style.setProperty('--surface-dark', '#181b21');
            root.style.setProperty('--text-primary', '#f8f9fa');
            root.style.setProperty('--text-secondary', '#a0a6b1');
        }

        // Persist to localStorage for cross-page usage
        localStorage.setItem('bionexus_theme_mode', modeKey);
        localStorage.setItem('bionexus_theme_accent', colorKey);
    }

    // Listen for live theme changes in dropdown
    fields.themeColor.addEventListener('change', (e) => applyLiveTheme(e.target.value, fields.themeMode.value));
    fields.themeMode.addEventListener('change', (e) => applyLiveTheme(fields.themeColor.value, e.target.value));

    // Listen for system theme changes
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
        if (fields.themeMode.value === 'system') {
            applyLiveTheme(fields.themeColor.value, 'system');
        }
    });

    // Fetch Initial Data
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

                // Use localStorage values if available (most recent user choice)
                const savedMode = localStorage.getItem('bionexus_theme_mode');
                const savedAccent = localStorage.getItem('bionexus_theme_accent');
                
                fields.themeMode.value = savedMode || d.theme.mode || 'dark';
                fields.themeColor.value = savedAccent || d.theme.accent_color || 'cyan';
                fields.riaTone.value = d.ria.tone || 'friendly';
                fields.riaLang.value = d.ria.language || 'english';

                // Apply initial theme on load
                applyLiveTheme(fields.themeColor.value, fields.themeMode.value);

                spinner.style.display = 'none';
                content.style.display = 'flex';
            }
        } catch (error) {
            console.error(error);
            spinner.innerHTML = "Error loading System Configurations.";
        }
    }
    loadSettings();

    // ==========================================
    // ROBUST SAVE SYSTEM
    // ==========================================
    document.getElementById('save-settings-btn').addEventListener('click', async (e) => {
        const btn = e.target;
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Updating...';

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
            theme: { mode: fields.themeMode.value, accent_color: fields.themeColor.value },
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
                // Persist theme to localStorage
                localStorage.setItem('bionexus_theme_mode', fields.themeMode.value);
                localStorage.setItem('bionexus_theme_accent', fields.themeColor.value);
                
                btn.style.background = '#00ff87';
                btn.innerHTML = '<i class="fa-solid fa-check"></i> System Updated';
                setTimeout(() => {
                    btn.style.background = 'var(--accent-master)';
                    btn.innerHTML = '<i class="fa-solid fa-microchip"></i> Update Matrix Configurations';
                }, 2000);
            } else {
                btn.innerHTML = 'Update Failed!';
            }
        } catch (error) {
            console.error(error);
            btn.innerHTML = 'Network Error';
        }
    });

    // ==========================================
    // CHANGE PASSWORD
    // ==========================================
    document.getElementById('change-pass-btn').addEventListener('click', async (e) => {
        const oldPass = document.getElementById('old-pass').value;
        const newPass = document.getElementById('new-pass').value;
        const msgBox = document.getElementById('pass-msg');

        if(!oldPass || !newPass) { msgBox.innerText = "Please fill both fields."; msgBox.style.color = 'var(--danger-red)'; return; }
        
        e.target.innerText = 'Updating...';
        try {
            const res = await fetch('/api/settings/change-password', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_email: userEmail, old_password: oldPass, new_password: newPass })
            });
            const data = await res.json();
            
            if (res.ok) {
                msgBox.innerText = "Password Updated!";
                msgBox.style.color = '#00ff87';
                document.getElementById('old-pass').value = ''; document.getElementById('new-pass').value = '';
            } else {
                msgBox.innerText = data.detail || "Update failed.";
                msgBox.style.color = 'var(--danger-red)';
            }
        } catch (error) { msgBox.innerText = "Error."; }
        e.target.innerText = 'Update Password';
    });

    // ==========================================
    // EXPORT TO PDF — Professional White Paper
    // ==========================================
    document.getElementById('export-data-btn').addEventListener('click', async (e) => {
        e.target.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Generating Report...';
        try {
            const res = await fetch(`/api/settings/export/${userEmail}`);
            const data = await res.json();
            
            if(res.ok && data.status === "success") {
                const d = data.export_data;
                const profile = d.profile_and_macros || {};
                const healthLogs = d.daily_health_logs || [];
                const workouts = d.workout_routines_history || [];
                const dietLogs = d.diet_food_history || [];

                // Build formatted health logs table
                let healthTable = '<tr><th>Date</th><th>Calories</th><th>Water (L)</th><th>Sleep (hrs)</th><th>Steps</th></tr>';
                healthLogs.slice(-14).forEach(log => {
                    healthTable += `<tr><td>${log.log_date || 'N/A'}</td><td>${log.calories || 0}</td><td>${log.water_liters || 0}</td><td>${log.sleep_hours || 0}</td><td>${log.steps || 0}</td></tr>`;
                });

                // Build workout summary
                let workoutRows = '<tr><th>Date</th><th>Exercises</th><th>Volume (kg)</th></tr>';
                workouts.slice(-14).forEach(w => {
                    const exercises = (w.exercises || []).map(ex => ex.name || 'Exercise').join(', ');
                    workoutRows += `<tr><td>${w.date || 'N/A'}</td><td>${exercises || 'N/A'}</td><td>${w.total_volume_kg || 0}</td></tr>`;
                });

                // Build diet summary
                let dietRows = '<tr><th>Date</th><th>Calories</th><th>Protein</th><th>Carbs</th><th>Fats</th></tr>';
                dietLogs.slice(-14).forEach(dl => {
                    dietRows += `<tr><td>${dl.date || 'N/A'}</td><td>${dl.daily_total_calories || 0}</td><td>${dl.daily_total_protein || 0}g</td><td>${dl.daily_total_carbs || 0}g</td><td>${dl.daily_total_fats || 0}g</td></tr>`;
                });

                const printContent = `
                    <html>
                    <head>
                        <title>BioNexus Health Report - ${profile.name || userEmail}</title>
                        <style>
                            * { margin: 0; padding: 0; box-sizing: border-box; }
                            body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px 50px; color: #333; line-height: 1.6; background: #fff; }
                            .header { text-align: center; border-bottom: 3px solid #00b4d8; padding-bottom: 20px; margin-bottom: 30px; }
                            .header h1 { color: #023e8a; font-size: 28px; margin-bottom: 5px; }
                            .header p { color: #666; font-size: 14px; }
                            .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 30px; }
                            .meta-item { background: #f8f9fa; padding: 12px 16px; border-radius: 8px; border-left: 4px solid #00b4d8; }
                            .meta-item strong { color: #023e8a; display: block; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; }
                            .meta-item span { font-size: 16px; font-weight: 600; }
                            h2 { color: #023e8a; font-size: 18px; margin: 25px 0 10px 0; padding-bottom: 5px; border-bottom: 1px solid #dee2e6; }
                            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px; }
                            th { background: #023e8a; color: #fff; padding: 10px 12px; text-align: left; font-weight: 600; }
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
        const confirmDelete = confirm("⚠️ DANGER: Erase entire Matrix footprint?");
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
            } catch (error) { alert("Failed."); }
        }
    });
});