// ==========================================
// BioNexus: Authentication, API & Animations
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    
    // --- DOM Elements ---
    const authForm = document.getElementById('auth-form');
    const loadingScreen = document.getElementById('loading-screen');
    const loginUI = document.getElementById('login-ui');
    const authError = document.getElementById('auth-error');

    // --- UI Helper Functions ---
    // Shows the sand-clock animation and blurs the background
    function showLoading(messageText = "Authenticating...") {
        const loadText = document.getElementById('loading-text');
        if(loadText) loadText.innerText = messageText;
        
        if(loadingScreen) loadingScreen.classList.add('active');
        if(loginUI) {
            loginUI.style.transition = "all 0.5s ease";
            loginUI.style.filter = "blur(5px)";
            loginUI.style.transform = "scale(0.95)";
        }
    }

    // Removes the loading animation if authentication fails
    function hideLoading() {
        if(loadingScreen) loadingScreen.classList.remove('active');
        if(loginUI) {
            loginUI.style.filter = "none";
            loginUI.style.transform = "scale(1)";
        }
    }

    // Shows an error message dynamically
    function showError(message) {
        hideLoading();
        if (authError) {
            authError.innerText = message;
            authError.style.display = 'block';
        }
    }

    // --- 1. Manual Login & Register Submission ---
    if (authForm) {
        authForm.addEventListener('submit', async (e) => {
            e.preventDefault(); // Prevent page reload
            
            authError.style.display = 'none'; // Clear previous errors
            
            // Check if user is logging in or creating an account based on the HTML flag
            const isLogin = window.isLoginMode;
            showLoading(isLogin ? "Authenticating..." : "Creating AI Core...");
            
            const email = document.getElementById('email-input').value;
            const password = document.getElementById('password-input').value;
            
            // Prepare payload and URL based on current mode
            let apiUrl = '/api/auth/login';
            let payload = { email: email, password: password };

            // Add name if creating an account
            if (!isLogin) {
                apiUrl = '/api/auth/register';
                payload.name = document.getElementById('name-input').value;
            }
            
            try {
                // Send request to FastAPI Backend
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const data = await response.json();

                if (response.ok) {
                    // Securely store the JWT token
                    localStorage.setItem('bionexus_token', data.access_token);
                    
                    // Add a small 1.5s delay so the user can see the cool animation
                    setTimeout(() => {
                        if (data.is_onboarded) {
                            window.location.href = '/dashboard';
                        } else {
                            window.location.href = '/onboarding';
                        }
                    }, 1500); 
                } else {
                    showError(data.detail || "Authentication Failed. Please try again.");
                }
            } catch (error) {
                console.error("Auth Error:", error);
                showError("Server connection lost. Is the backend running?");
            }
        });
    }

    // --- 2. Dynamic Google Login Initialization ---
    async function initGoogleAuth() {
        try {
            // Fetch Client ID from our backend (which hides it safely in .env)
            const configRes = await fetch('/api/config');
            const configData = await configRes.json();

            if (configData.google_client_id) {
                // Initialize Google Accounts API
                google.accounts.id.initialize({
                    client_id: configData.google_client_id,
                    callback: handleGoogleLogin
                });

                // Render the button inside the placeholder container
                google.accounts.id.renderButton(
                    document.getElementById("google-btn-container"),
                    { theme: "outline", size: "large", type: "standard" }
                );
            }
        } catch (error) {
            console.error("Failed to load Google Config:", error);
        }
    }

    initGoogleAuth();

    // --- 3. Google Sign-In Logic (Global Function) ---
    // Exposed globally so the Google Script can trigger it
    window.handleGoogleLogin = async function(response) {
        showLoading("Verifying Google Identity...");
        const googleToken = response.credential;
        
        try {
            // Send the Google Token to our backend for DB sync
            const res = await fetch('/api/auth/google', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: googleToken })
            });

            const data = await res.json();

            if (res.ok) {
                // Save token
                localStorage.setItem('bionexus_token', data.access_token);
                
                // Add short delay for animation
                setTimeout(() => {
                    if (data.is_onboarded) {
                        window.location.href = '/dashboard';
                    } else {
                        window.location.href = '/onboarding';
                    }
                }, 1500);
            } else {
                showError("Google Authentication Failed.");
            }
        } catch (error) {
            console.error("Google Login Error:", error);
            showError("Server connection lost during Google Auth.");
        }
    };
});