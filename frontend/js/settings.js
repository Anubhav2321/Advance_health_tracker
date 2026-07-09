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

    // 💥 DYNAMIC THEME APPLIER
    const themeColors = {
        cyan: '#00f3ff',
        purple: '#9d4edd',
        green: '#00ff87',
        orange: '#ff9d00'
    };

    function applyLiveTheme(colorKey, modeKey) {
        const root = document.documentElement;
        if (themeColors[colorKey]) {
            root.style.setProperty('--accent-master', themeColors[colorKey]);
        }
        
        // Basic Light/Dark switch logic
        if(modeKey === 'light') {
            root.style.setProperty('--bg-dark', '#f0f2f5');
            root.style.setProperty('--surface-dark', '#ffffff');
            root.style.setProperty('--text-primary', '#181b21');
        } else {
            root.style.setProperty('--bg-dark', '#0f1115');
            root.style.setProperty('--surface-dark', '#181b21');
            root.style.setProperty('--text-primary', '#f8f9fa');
        }
    }

    // Listen for live theme changes in dropdown
    fields.themeColor.addEventListener('change', (e) => applyLiveTheme(e.target.value, fields.themeMode.value));
    fields.themeMode.addEventListener('change', (e) => applyLiveTheme(fields.themeColor.value, e.target.value));

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

                fields.themeMode.value = d.theme.mode || 'dark';
                fields.themeColor.value = d.theme.accent_color || 'cyan';
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

    // 💥 ROBUST SAVE SYSTEM
    document.getElementById('save-settings-btn').addEventListener('click', async (e) => {
        const btn = e.target;
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Updating...';

        // Strict fallback for numbers so backend doesn't crash (422 Error Fix)
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
            notifications: { water_reminder: true, workout_alert: true, meal_reminder: true } // Defaulted since we removed them from UI
        };

        try {
            const res = await fetch('/api/settings/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(postData)
            });
            
            if (res.ok) {
                btn.style.background = '#00ff87'; // Temp green for success
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

    // Change Password
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

    // 💥 EXPORT TO PDF LOGIC
    document.getElementById('export-data-btn').addEventListener('click', async (e) => {
        e.target.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Generating PDF...';
        try {
            const res = await fetch(`/api/settings/export/${userEmail}`);
            const data = await res.json();
            
            if(res.ok && data.status === "success") {
                // Generate a clean HTML page with the data
                const printContent = `
                    <html>
                    <head>
                        <title>BioNexus Report - ${userEmail}</title>
                        <style>
                            body { font-family: Arial, sans-serif; padding: 40px; color: #333; line-height: 1.6; }
                            h1 { color: #000; border-bottom: 2px solid #ccc; padding-bottom: 10px; }
                            h2 { color: #444; margin-top: 30px; }
                            pre { background: #f4f4f4; padding: 15px; border-radius: 8px; white-space: pre-wrap; word-wrap: break-word; font-size: 12px; }
                        </style>
                    </head>
                    <body>
                        <h1>BioNexus Complete Matrix Data</h1>
                        <p><strong>User:</strong> ${userEmail}</p>
                        <p><strong>Generated On:</strong> ${new Date().toLocaleString()}</p>
                        
                        <h2>1. Profile & Macros</h2>
                        <pre>${JSON.stringify(data.export_data.profile_and_macros, null, 4)}</pre>
                        
                        <h2>2. Workout History</h2>
                        <pre>${JSON.stringify(data.export_data.workout_routines_history, null, 4)}</pre>
                        
                        <h2>3. Diet & Nutrition Logs</h2>
                        <pre>${JSON.stringify(data.export_data.diet_food_history, null, 4)}</pre>
                    </body>
                    </html>
                `;
                
                // Open a hidden window and print it as PDF
                const pdfWin = window.open('', '_blank');
                pdfWin.document.write(printContent);
                pdfWin.document.close();
                pdfWin.focus();
                
                // Delay slightly to let the window render before calling print
                setTimeout(() => {
                    pdfWin.print();
                }, 500);
            }
        } catch (error) { console.error("Export Failed", error); }
        e.target.innerHTML = '<i class="fa-solid fa-file-pdf"></i> Export Data as PDF';
    });

    // Delete Account
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
                    window.location.href = '/login';
                }
            } catch (error) { alert("Failed."); }
        }
    });
});