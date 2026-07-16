// ==========================================
// BioNexus: Profile System Logic
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

document.addEventListener('DOMContentLoaded', async () => {
    
    // 1. Security Check
    const currentToken = localStorage.getItem('bionexus_token');
    if (!currentToken) {
        window.location.href = '/login';
        return;
    }

    // 2. Decode Token to get Email securely
    let userEmail = ""; 
    const payload = parseJwt(currentToken);
    
    if (!payload || !payload.sub) {
        localStorage.removeItem('bionexus_token');
        window.location.href = '/login';
        return;
    }
    userEmail = payload.sub;

    // 3. UI Elements
    const spinner = document.getElementById('loading-spinner');
    const content = document.getElementById('profile-content');
    const backBtn = document.getElementById('back-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const editBtn = document.getElementById('edit-profile-btn');
    
    // 💥 NEW: Upload Elements
    const imageUploadInput = document.getElementById('image-upload');
    const avatarCircle = document.querySelector('.avatar-circle');

    // ==========================================
    // 4. FETCH DATA & DISPLAY GOOGLE/LOCAL IMAGE
    // ==========================================

    // Apply saved theme
    (function applyStoredTheme() {
        const root = document.documentElement;
        const savedMode = localStorage.getItem('bionexus_theme_mode') || 'dark';
        const savedAccent = localStorage.getItem('bionexus_theme_accent') || 'cyan';
        const accentMap = { cyan: '#00f3ff', purple: '#9d4edd', green: '#00ff87', orange: '#ff9d00' };
        if (accentMap[savedAccent]) {
            root.style.setProperty('--accent-cyan', savedAccent === 'cyan' ? '#00f3ff' : accentMap[savedAccent]);
        }
        if (savedMode === 'light') {
            root.style.setProperty('--bg-dark', '#f0f2f5');
            root.style.setProperty('--surface-dark', '#ffffff');
            root.style.setProperty('--text-primary', '#181b21');
            root.style.setProperty('--text-secondary', '#5a5f6b');
        }
    })();

    try {
        const response = await fetch(`/api/profile/${userEmail}`);
        const result = await response.json();

        if (response.ok && result.status === "success") {
            const data = result.data;
            
            // Render Profile Picture with caching
            if (data.profile_image && data.profile_image.trim() !== "") {
                let highResImg = data.profile_image;
                
                if (highResImg.includes('googleusercontent.com')) {
                    highResImg = highResImg.replace(/=s\d+-c/g, '=s400-c');
                }
                
                // Cache for instant display on revisit
                localStorage.setItem('bionexus_cached_avatar', highResImg);
                
                avatarCircle.innerHTML = `<img src="${highResImg}" alt="Profile" loading="lazy" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover; display: block;">`;
            } else {
                const cachedAvatar = localStorage.getItem('bionexus_cached_avatar');
                if (cachedAvatar) {
                    avatarCircle.innerHTML = `<img src="${cachedAvatar}" alt="Profile" loading="lazy" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover; display: block;">`;
                } else {
                    avatarCircle.innerHTML = `<span id="profile-initial">${data.name.charAt(0).toUpperCase()}</span>`;
                }
            }

            // Inject User Info
            document.getElementById('profile-name').innerText = data.name;
            document.getElementById('profile-email').innerText = data.email;
            
            // Member Since
            if (data.created_at) {
                const memberDate = new Date(data.created_at);
                const formattedDate = memberDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
                document.getElementById('profile-member-since').innerHTML = `<i class="fa-solid fa-calendar"></i> Member since ${formattedDate}`;
            }
            
            // Inject Stats
            const age = data.age || '--';
            const gender = data.gender ? data.gender.charAt(0).toUpperCase() : 'N/A';
            const weight = data.current_weight_kg || '--';
            const heightCm = data.height_cm || 0;
            const goal = data.goal ? data.goal.replace('_', ' ') : '--';
            const tdee = data.target_calories || '--';

            document.getElementById('profile-age').innerText = `${age} Y / ${gender}`;
            document.getElementById('profile-weight').innerText = `${weight} kg`;
            document.getElementById('profile-goal').innerText = goal;
            document.getElementById('profile-tdee').innerText = `${tdee} kcal`;

            // BMI Calculation
            if (weight !== '--' && heightCm > 0) {
                const heightM = heightCm / 100;
                const bmi = (weight / (heightM * heightM)).toFixed(1);
                let bmiCategory = 'Normal';
                let bmiColor = 'var(--accent-green)';
                if (bmi < 18.5) { bmiCategory = 'Underweight'; bmiColor = '#ffc107'; }
                else if (bmi >= 25 && bmi < 30) { bmiCategory = 'Overweight'; bmiColor = '#ff9d00'; }
                else if (bmi >= 30) { bmiCategory = 'Obese'; bmiColor = '#ff5e5e'; }
                
                const bmiEl = document.getElementById('profile-bmi');
                bmiEl.innerText = `${bmi} (${bmiCategory})`;
                bmiEl.style.color = bmiColor;
            }

            // Health Score (composite algorithm)
            let healthScore = 50; // Base
            const activityMap = { sedentary: 0, light: 10, moderate: 20, active: 30, very_active: 40 };
            healthScore += activityMap[data.activity_level] || 0;
            
            // BMI penalty/bonus
            if (weight !== '--' && heightCm > 0) {
                const heightM = heightCm / 100;
                const bmi = weight / (heightM * heightM);
                if (bmi >= 18.5 && bmi < 25) healthScore += 10;
                else if (bmi >= 25 && bmi < 30) healthScore -= 5;
                else if (bmi >= 30) healthScore -= 15;
                else healthScore -= 10; // underweight
            }
            healthScore = Math.max(0, Math.min(100, healthScore));
            
            const healthEl = document.getElementById('profile-health-score');
            healthEl.innerText = `${healthScore}/100`;
            if (healthScore >= 70) healthEl.style.color = 'var(--accent-green)';
            else if (healthScore >= 40) healthEl.style.color = '#ff9d00';
            else healthEl.style.color = '#ff5e5e';

            // Hide Spinner, Show Content
            spinner.style.display = 'none';
            content.style.display = 'flex';
        } else {
            throw new Error("Data sync failed");
        }
    } catch (error) {
        console.error("Failed to load profile:", error);
        spinner.innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="color:#ff5e5e;"></i> Error loading matrix.';
    }

    // ==========================================
    // 💥 5. MANUAL IMAGE UPLOAD LOGIC (NEW)
    // ==========================================
    if (imageUploadInput) {
        imageUploadInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            // Size validation (Max 2.5MB allowed)
            if(file.size > 2.5 * 1024 * 1024) {
                alert("File is too large! Please select an image under 2.5MB.");
                return;
            }

            // Show a loading spinner inside the circle while uploading
            avatarCircle.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin" style="font-size: 2rem;"></i>';

            // Convert file to Base64
            const reader = new FileReader();
            reader.onloadend = async () => {
                const base64String = reader.result;

                try {
                    // Send to backend
                    const response = await fetch('/api/upload-image', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ user_email: userEmail, image_base64: base64String })
                    });

                    if (response.ok) {
                        // Success! Show the new uploaded image instantly
                        avatarCircle.innerHTML = `<img src="${base64String}" alt="Profile" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover; display: block;">`;
                    } else {
                        alert("Failed to upload image.");
                        window.location.reload(); // Reload to fix UI
                    }
                } catch (error) {
                    alert("Network error during upload.");
                    window.location.reload();
                }
            };
            reader.readAsDataURL(file); // Start reading the file
        });
    }

    // 6. Navigation Logic
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            window.location.href = '/dashboard';
        });
    }

    // 7. Edit Profile Logic
    if (editBtn) {
        editBtn.addEventListener('click', () => {
            window.location.href = '/onboarding';
        });
    }

    // 8. Logout Logic
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            logoutBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Disconnecting...';
            
            setTimeout(() => {
                localStorage.removeItem('bionexus_token');
                window.location.href = '/login';
            }, 600);
        });
    }
});