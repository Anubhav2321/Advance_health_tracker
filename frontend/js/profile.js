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
    try {
        const response = await fetch(`/api/profile/${userEmail}`);
        const result = await response.json();

        if (response.ok && result.status === "success") {
            const data = result.data;
            
            // Render Profile Picture (Google or Manually Uploaded)
            if (data.profile_image && data.profile_image.trim() !== "") {
                let highResImg = data.profile_image;
                
                // If it's a Google image, make it HD
                if (highResImg.includes('googleusercontent.com')) {
                    highResImg = highResImg.replace(/=s\d+-c/g, '=s400-c');
                }
                
                // Show the image perfectly fitted in the circle
                avatarCircle.innerHTML = `<img src="${highResImg}" alt="Profile" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover; display: block;">`;
            } else {
                // Fallback: Show Initial if no picture exists
                avatarCircle.innerHTML = `<span id="profile-initial">${data.name.charAt(0).toUpperCase()}</span>`;
            }

            // Inject User Info
            document.getElementById('profile-name').innerText = data.name;
            document.getElementById('profile-email').innerText = data.email;
            
            // Inject Stats
            const age = data.age || '--';
            const gender = data.gender ? data.gender.charAt(0).toUpperCase() : 'N/A';
            const weight = data.current_weight_kg || '--';
            const goal = data.goal ? data.goal.replace('_', ' ') : '--';
            const tdee = data.target_calories || '--';

            document.getElementById('profile-age').innerText = `${age} Y / ${gender}`;
            document.getElementById('profile-weight').innerText = `${weight} kg`;
            document.getElementById('profile-goal').innerText = goal;
            document.getElementById('profile-tdee').innerText = `${tdee} kcal`;

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